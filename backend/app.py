from __future__ import annotations

import math
import os
import re
from datetime import datetime
from typing import Any

import clickhouse_connect
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


class DimensionInput(BaseModel):
    id: str
    name: str
    field: str
    table: str
    level: int | None = None
    parentDimension: str | None = None


class MetricInput(BaseModel):
    id: str
    name: str
    field: str
    table: str
    aggregation: str
    format: str
    decimals: int | None = None
    prefix: str | None = None
    suffix: str | None = None
    type: str | None = None
    dependencies: list[str] | None = None


class FilterInput(BaseModel):
    dimension: DimensionInput
    operator: str
    value: Any


class ComparisonInput(BaseModel):
    enabled: bool
    type: str
    previousPeriodOffset: int | None = None


class OptionsInput(BaseModel):
    showTotals: bool
    showSubtotals: bool
    expandAll: bool
    collapseLevel: int
    currencyCode: str


class PnLConfigInput(BaseModel):
    rowDimensions: list[DimensionInput]
    columnDimensions: list[DimensionInput]
    metrics: list[MetricInput]
    filters: list[FilterInput]
    comparison: ComparisonInput | None = None
    options: OptionsInput


def get_env(key: str, default: str | None = None) -> str:
    value = os.getenv(key, default)
    if value is None:
        raise RuntimeError(f"Missing required env var: {key}")
    return value


def get_database_name() -> str:
    database = os.getenv("BASALAM_CH_DATABASE", "OLAPBasalam")
    if not re.match(r"^[A-Za-z0-9_]+$", database):
        raise RuntimeError("Invalid BASALAM_CH_DATABASE value")
    return database


def get_client():
    host = os.getenv("BASALAM_CH_HOST", "proxy.bk0i.basalam.dev")
    port = int(os.getenv("BASALAM_CH_PORT", "39674"))
    username = get_env("BASALAM_CH_USER", os.getenv("CH_USER", ""))
    password = get_env("BASALAM_CH_PASSWORD", os.getenv("CH_PASSWORD", ""))
    database = get_database_name()

    return clickhouse_connect.get_client(
        host=host,
        port=port,
        username=username,
        password=password,
        database=database,
        secure=False,
        connect_timeout=20,
        send_receive_timeout=120,
    )


DIMENSION_VALUE_SQL: dict[str, str] = {
    "category_l1": "coalesce(ms.cat_lvl1_title, 'Unknown')",
    "category_l2": "coalesce(ms.cat_lvl2_title, 'Unknown')",
    "category_l3": "coalesce(ms.cat_lvl3_title, 'Unknown')",
    "item_id": "toString(ms.item_id)",
    "customer_province": "coalesce(ms.customer_province_title, 'Unknown')",
    "vendor_province": "coalesce(ms.vendor_province_title, 'Unknown')",
    "customer_type": "toString(coalesce(ms.customer_type_id, 0))",
    "vendor_type": "toString(coalesce(ms.vendor_type_id, 0))",
    "year": "toString(ms.persian_year)",
    "year_month": "toString(ms.persiandate_purchase_yearmonth)",
    "month": "toString(ms.persiandate_purchase_yearmonth % 100)",
}


DIMENSION_FILTER_SQL: dict[str, str] = {
    "category_l1": "ms.cat_lvl1_title",
    "category_l2": "ms.cat_lvl2_title",
    "category_l3": "ms.cat_lvl3_title",
    "item_id": "ms.item_id",
    "customer_province": "ms.customer_province_title",
    "vendor_province": "ms.vendor_province_title",
    "customer_type": "ms.customer_type_id",
    "vendor_type": "ms.vendor_type_id",
    "year": "toInt32(ms.persian_year)",
    "year_month": "toInt32(ms.persiandate_purchase_yearmonth)",
    "month": "toInt32(ms.persiandate_purchase_yearmonth % 100)",
}


COLUMN_SORT_SQL: dict[str, str] = {
    "year": "toInt32(ms.persian_year)",
    "year_month": "toInt32(ms.persiandate_purchase_yearmonth)",
    "month": "toInt32(ms.persiandate_purchase_yearmonth % 100)",
}


BASE_METRIC_SQL: dict[str, str] = {
    "orders": "countDistinct(ms.order_id)",
    "items": "count(ms.item_id)",
    "gmv": "sum(toFloat64(coalesce(ms.gmv, 0)))",
    "refund_amount": "sum(toFloat64(coalesce(ms.refund_amount, 0)))",
    "delivery_cost": "sum(toFloat64(coalesce(ms.delivery_cost, 0)))",
    "vendor_discount": "sum(toFloat64(coalesce(ms.vendor_discount, 0)))",
    "commission": "sum(toFloat64(coalesce(ms.commission, 0)))",
    "satisfaction_commission": "sum(toFloat64(coalesce(ms.satisfaction_commission, 0)))",
    "service_fee": "sum(toFloat64(coalesce(ms.service_fee, 0)))",
    "penalty": "sum(toFloat64(coalesce(ms.penalty, 0)))",
}


CALCULATED_DEPENDENCIES: dict[str, list[str]] = {
    "nmv": ["gmv", "refund_amount", "delivery_cost", "vendor_discount"],
    "main_revenue": ["commission", "satisfaction_commission"],
    "total_fee": ["service_fee", "penalty"],
    "avg_order_value": ["gmv", "orders"],
}

NUMERIC_DIMENSIONS = {
    "item_id",
    "customer_type",
    "vendor_type",
    "year",
    "year_month",
    "month",
}


def to_number(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except Exception:
        return 0.0


def quote_value(value: Any) -> str:
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value).replace("\\", "\\\\").replace("'", "''")
    return f"'{text}'"


def normalize_filter_value(dim_id: str, value: Any) -> Any | None:
    if value is None:
        return None

    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        if dim_id in NUMERIC_DIMENSIONS and float(value).is_integer():
            return int(value)
        return value

    if isinstance(value, int):
        return value

    text = str(value).strip()
    if not text:
        return None
    if text.lower() in {"nan", "null", "none"}:
        return None

    if dim_id in NUMERIC_DIMENSIONS:
        try:
            if "." in text:
                numeric = float(text)
                if math.isnan(numeric) or math.isinf(numeric):
                    return None
                return numeric
            return int(text)
        except Exception:
            return None

    return text


def build_filter_condition(filter_obj: FilterInput) -> str:
    dim_id = filter_obj.dimension.id
    expr = DIMENSION_FILTER_SQL.get(dim_id)
    if not expr:
        return ""

    op = filter_obj.operator
    val = filter_obj.value

    if op == "equals":
        parsed = normalize_filter_value(dim_id, val)
        if parsed is None:
            return ""
        return f"{expr} = {quote_value(parsed)}"
    if op == "notEquals":
        parsed = normalize_filter_value(dim_id, val)
        if parsed is None:
            return ""
        return f"{expr} != {quote_value(parsed)}"
    if op == "in":
        items = val if isinstance(val, list) else [val]
        parsed_items = [
            normalize_filter_value(dim_id, item)
            for item in items
        ]
        parsed_items = [item for item in parsed_items if item is not None]
        if not parsed_items:
            return ""
        return f"{expr} IN ({', '.join(quote_value(v) for v in parsed_items)})"
    if op == "notIn":
        items = val if isinstance(val, list) else [val]
        parsed_items = [
            normalize_filter_value(dim_id, item)
            for item in items
        ]
        parsed_items = [item for item in parsed_items if item is not None]
        if not parsed_items:
            return ""
        return f"{expr} NOT IN ({', '.join(quote_value(v) for v in parsed_items)})"
    if op == "greaterThan":
        parsed = normalize_filter_value(dim_id, val)
        if parsed is None:
            return ""
        return f"{expr} > {quote_value(parsed)}"
    if op == "lessThan":
        parsed = normalize_filter_value(dim_id, val)
        if parsed is None:
            return ""
        return f"{expr} < {quote_value(parsed)}"
    if op == "between":
        if not isinstance(val, list) or len(val) < 2:
            return ""
        low = normalize_filter_value(dim_id, val[0])
        high = normalize_filter_value(dim_id, val[1])
        if low is None or high is None:
            return ""
        return f"{expr} BETWEEN {quote_value(low)} AND {quote_value(high)}"
    return ""


def evaluate_metric(metric_id: str, raw_values: dict[str, float]) -> float:
    if metric_id in BASE_METRIC_SQL:
        return to_number(raw_values.get(metric_id, 0.0))
    if metric_id == "nmv":
        return (
            to_number(raw_values.get("gmv"))
            - to_number(raw_values.get("refund_amount"))
            - to_number(raw_values.get("delivery_cost"))
            - to_number(raw_values.get("vendor_discount"))
        )
    if metric_id == "main_revenue":
        return to_number(raw_values.get("commission")) + to_number(
            raw_values.get("satisfaction_commission")
        )
    if metric_id == "total_fee":
        return to_number(raw_values.get("service_fee")) + to_number(raw_values.get("penalty"))
    if metric_id == "avg_order_value":
        orders = to_number(raw_values.get("orders"))
        if orders <= 0:
            return 0.0
        return to_number(raw_values.get("gmv")) / orders
    return 0.0


def format_value(value: float, metric: MetricInput) -> str:
    decimals = metric.decimals if metric.decimals is not None else 2
    if metric.format == "currency":
        return f"{value:,.{max(decimals, 0)}f}"
    if metric.format == "integer":
        return f"{int(round(value)):,}"
    if metric.format == "percent":
        return f"{value:.{max(decimals, 0)}f}%"
    return f"{value:,.{max(decimals, 0)}f}"


def make_cell(value: float, metric: MetricInput, is_total: bool):
    return {
        "value": value,
        "formattedValue": format_value(value, metric),
        "isCalculated": metric.id in CALCULATED_DEPENDENCIES,
        "isTotal": is_total,
    }


app = FastAPI(title="Reporting Platform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True, "service": "reporting-platform-api"}


@app.get("/api/pnl/filter-options")
def get_filter_options():
    try:
        client = get_client()
        database = get_database_name()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"ClickHouse connection error: {exc}") from exc

    dimension_queries = {
        "category_l1": "ms.cat_lvl1_title",
        "category_l2": "ms.cat_lvl2_title",
        "category_l3": "ms.cat_lvl3_title",
        "customer_province": "ms.customer_province_title",
        "vendor_province": "ms.vendor_province_title",
        "customer_type": "ms.customer_type_id",
        "vendor_type": "ms.vendor_type_id",
        "year": "ms.persian_year",
        "year_month": "ms.persiandate_purchase_yearmonth",
        "month": "toInt32(ms.persiandate_purchase_yearmonth % 100)",
    }

    options: dict[str, list[Any]] = {}
    for dim_id, expr in dimension_queries.items():
        order = "value DESC" if dim_id in {"year", "year_month", "month"} else "c DESC"
        query = f"""
            SELECT {expr} AS value, count() AS c
            FROM {database}.model_sales ms
            WHERE ms.purchase_at IS NOT NULL AND {expr} IS NOT NULL
            GROUP BY value
            ORDER BY {order}
            LIMIT 150
        """
        result = client.query(query)
        values = []
        for row in result.result_rows:
            value = row[0]
            if value is None:
                continue
            values.append(value)
        options[dim_id] = values

    return {"options": options}


@app.post("/api/pnl/report")
def get_pnl_report(config: PnLConfigInput):
    try:
        client = get_client()
        database = get_database_name()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"ClickHouse connection error: {exc}") from exc

    row_dims = config.rowDimensions or [DimensionInput(id="category_l1", name="Category L1", field="cat_lvl1_title", table="model_sales")]
    col_dim = (config.columnDimensions or [DimensionInput(id="year_month", name="Year-Month", field="persiandate_purchase_yearmonth", table="model_sales")])[0]

    row_select_parts: list[str] = []
    row_group_parts: list[str] = []
    for dim in row_dims:
        expr = DIMENSION_VALUE_SQL.get(dim.id)
        if not expr:
            raise HTTPException(status_code=400, detail=f"Unsupported row dimension: {dim.id}")
        alias = f"dim_{dim.id}"
        row_select_parts.append(f"{expr} AS {alias}")
        row_group_parts.append(expr)

    col_expr = DIMENSION_VALUE_SQL.get(col_dim.id)
    col_sort_expr = COLUMN_SORT_SQL.get(col_dim.id, col_expr)
    if not col_expr:
        raise HTTPException(status_code=400, detail=f"Unsupported column dimension: {col_dim.id}")

    selected_metrics = config.metrics
    if not selected_metrics:
        raise HTTPException(status_code=400, detail="At least one metric is required")

    selected_metric_ids = [m.id for m in selected_metrics]
    required_base_metrics: set[str] = set()
    for metric_id in selected_metric_ids:
        if metric_id in BASE_METRIC_SQL:
            required_base_metrics.add(metric_id)
        elif metric_id in CALCULATED_DEPENDENCIES:
            required_base_metrics.update(CALCULATED_DEPENDENCIES[metric_id])
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported metric id: {metric_id}")

    metric_select_parts = [f"{BASE_METRIC_SQL[m]} AS m_{m}" for m in sorted(required_base_metrics)]

    where_parts = ["ms.purchase_at IS NOT NULL"]
    for filter_obj in config.filters:
        condition = build_filter_condition(filter_obj)
        if condition:
            where_parts.append(condition)

    query = f"""
        SELECT
          {", ".join(row_select_parts)},
          {col_expr} AS col_value,
          {col_sort_expr} AS col_sort,
          {", ".join(metric_select_parts)}
        FROM {database}.model_sales ms
        WHERE {" AND ".join(where_parts)}
        GROUP BY {", ".join(row_group_parts + [col_expr, col_sort_expr])}
        ORDER BY col_sort, {", ".join(row_group_parts)}
    """

    result = client.query(query)
    column_names = result.column_names
    records = [dict(zip(column_names, row)) for row in result.result_rows]

    column_catalog: dict[str, dict[str, Any]] = {}
    for record in records:
        title = str(record["col_value"])
        sort_value = to_number(record["col_sort"])
        if title not in column_catalog:
            column_catalog[title] = {"title": title, "sort": sort_value}

    sorted_column_titles = [
        item["title"]
        for item in sorted(column_catalog.values(), key=lambda v: v["sort"])
    ]
    column_key_map = {title: f"c{idx + 1}" for idx, title in enumerate(sorted_column_titles)}

    metric_map = {m.id: m for m in selected_metrics}
    metric_ids = [m.id for m in selected_metrics]

    pivot: dict[tuple[Any, ...], dict[str, dict[str, float]]] = {}
    for record in records:
        row_key = tuple(record.get(f"dim_{d.id}") for d in row_dims)
        column_title = str(record["col_value"])
        if row_key not in pivot:
            pivot[row_key] = {}
        raw_values: dict[str, float] = {}
        for m in required_base_metrics:
            raw_values[m] = to_number(record.get(f"m_{m}", 0.0))
        pivot[row_key][column_title] = raw_values

    rows_output: list[dict[str, Any]] = []
    grand_totals: dict[str, float] = {m: 0.0 for m in required_base_metrics}

    for idx, (row_key, col_data) in enumerate(pivot.items(), start=1):
        dims_payload: dict[str, Any] = {"rowKey": f"row-{idx}"}
        for d_idx, dim in enumerate(row_dims):
            value = row_key[d_idx]
            dims_payload[dim.id] = "Unknown" if value is None else value

        cells: dict[str, Any] = {}
        row_total_base: dict[str, float] = {m: 0.0 for m in required_base_metrics}

        for column_title in sorted_column_titles:
            col_key = column_key_map[column_title]
            raw_values = col_data.get(column_title, {m: 0.0 for m in required_base_metrics})
            for base_metric in required_base_metrics:
                row_total_base[base_metric] += to_number(raw_values.get(base_metric, 0.0))
            for metric_id in metric_ids:
                metric = metric_map[metric_id]
                metric_value = evaluate_metric(metric_id, raw_values)
                cells[f"{col_key}_{metric_id}"] = make_cell(metric_value, metric, False)

        for base_metric in required_base_metrics:
            grand_totals[base_metric] += row_total_base[base_metric]

        for metric_id in metric_ids:
            metric = metric_map[metric_id]
            total_value = evaluate_metric(metric_id, row_total_base)
            cells[f"total_{metric_id}"] = make_cell(total_value, metric, True)

        rows_output.append(
            {
                "dimensions": dims_payload,
                "level": 0,
                "isExpandable": False,
                "isExpanded": False,
                "cells": cells,
                "isTotal": False,
                "isSubtotal": False,
            }
        )

    if config.options.showTotals:
        total_dimensions: dict[str, Any] = {"rowKey": "row-total"}
        for i, dim in enumerate(row_dims):
            total_dimensions[dim.id] = "Total" if i == 0 else ""

        total_cells: dict[str, Any] = {}
        for title in sorted_column_titles:
            col_key = column_key_map[title]
            base_for_column = {m: 0.0 for m in required_base_metrics}
            for row_key, col_data in pivot.items():
                raw_values = col_data.get(title)
                if not raw_values:
                    continue
                for base_metric in required_base_metrics:
                    base_for_column[base_metric] += to_number(raw_values.get(base_metric, 0.0))
            for metric_id in metric_ids:
                metric = metric_map[metric_id]
                metric_value = evaluate_metric(metric_id, base_for_column)
                total_cells[f"{col_key}_{metric_id}"] = make_cell(metric_value, metric, True)

        for metric_id in metric_ids:
            metric = metric_map[metric_id]
            total_value = evaluate_metric(metric_id, grand_totals)
            total_cells[f"total_{metric_id}"] = make_cell(total_value, metric, True)

        rows_output.append(
            {
                "dimensions": total_dimensions,
                "level": 0,
                "isExpandable": False,
                "isExpanded": False,
                "cells": total_cells,
                "isTotal": True,
                "isSubtotal": False,
            }
        )

    columns_output = [
        {
            "key": column_key_map[title],
            "title": title,
            "dimensionValues": {col_dim.id: title},
            "isTotal": False,
        }
        for title in sorted_column_titles
    ]
    columns_output.append({"key": "total", "title": "Total", "dimensionValues": {}, "isTotal": True})

    payload = {
        "config": config.model_dump(),
        "rows": rows_output,
        "columns": columns_output,
        "metadata": {
            "generatedAt": datetime.utcnow().isoformat(),
            "totalRows": len(rows_output),
            "currencyCode": config.options.currencyCode,
        },
    }
    return payload
