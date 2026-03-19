from __future__ import annotations

import json
import math
import os
import re
from datetime import datetime
from typing import Any
from urllib import parse, request
from urllib.error import HTTPError, URLError

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    import clickhouse_connect  # type: ignore
except Exception:
    clickhouse_connect = None


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


class QueryResult:
    def __init__(self, column_names: list[str], result_rows: list[list[Any]]):
        self.column_names = column_names
        self.result_rows = result_rows


class SimpleClickHouseHttpClient:
    def __init__(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        database: str,
        secure: bool = False,
        timeout: int = 120,
    ):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.database = database
        self.scheme = "https" if secure else "http"
        self.timeout = timeout

    def query(self, sql: str) -> QueryResult:
        query_sql = sql.strip().rstrip(";")
        if " FORMAT " not in query_sql.upper():
            query_sql = f"{query_sql} FORMAT JSON"

        qs = parse.urlencode({"database": self.database})
        url = f"{self.scheme}://{self.host}:{self.port}/?{qs}"
        req = request.Request(
            url=url,
            data=query_sql.encode("utf-8"),
            method="POST",
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "X-ClickHouse-User": self.username,
                "X-ClickHouse-Key": self.password,
            },
        )
        try:
            with request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read().decode("utf-8")
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="ignore") if exc.fp else str(exc)
            raise RuntimeError(f"ClickHouse HTTP error {exc.code}: {body}") from exc
        except URLError as exc:
            raise RuntimeError(f"ClickHouse connection error: {exc}") from exc

        payload = json.loads(raw)
        meta = payload.get("meta", [])
        column_names = [col.get("name", "") for col in meta]
        data_rows = payload.get("data", [])
        result_rows = [
            [row.get(col) for col in column_names]
            for row in data_rows
        ]
        return QueryResult(column_names=column_names, result_rows=result_rows)


def get_client():
    host = os.getenv("BASALAM_CH_HOST", "proxy.bk0i.basalam.dev")
    port = int(os.getenv("BASALAM_CH_PORT", "39674"))
    username = get_env("BASALAM_CH_USER", os.getenv("CH_USER", ""))
    password = get_env("BASALAM_CH_PASSWORD", os.getenv("CH_PASSWORD", ""))
    database = get_database_name()
    secure = os.getenv("BASALAM_CH_SECURE", "false").lower() in {"1", "true", "yes"}
    timeout = int(os.getenv("BASALAM_CH_TIMEOUT", "20"))

    if clickhouse_connect is not None:
        return clickhouse_connect.get_client(
            host=host,
            port=port,
            username=username,
            password=password,
            database=database,
            secure=secure,
            connect_timeout=timeout,
            send_receive_timeout=max(timeout, 20),
        )

    return SimpleClickHouseHttpClient(
        host=host,
        port=port,
        username=username,
        password=password,
        database=database,
        secure=secure,
        timeout=timeout,
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
    "refund_amount": "-sum(toFloat64(coalesce(ms.refund_amount, 0)))",
    "delivery_cost": "-sum(toFloat64(coalesce(ms.delivery_cost, 0)))",
    "vendor_discount": "-sum(toFloat64(coalesce(ms.vendor_discount, 0)))",
    "commission": "sum(toFloat64(coalesce(ms.commission, 0) + coalesce(ms.satisfaction_commission, 0)))",
    "satisfaction_commission": "sum(toFloat64(coalesce(ms.satisfaction_commission, 0)))",
    "ads": "sum(toFloat64(coalesce(ms.ads_rev, 0)))",
    "cost_of_revenue": "-sum(toFloat64(coalesce(ms.cost_of_revenue_cost, 0)))",
    "vouchers_crc": "-sumIf(toFloat64(coalesce(ms.basalam_discount, 0)), ms.customer_type_id = 2)",
    "general_cost_crc": "-sumIf(toFloat64(coalesce(ms.marketing_cost, 0)), ms.customer_type_id = 2)",
    "vat": "-sum(toFloat64(coalesce(ms.vat_cost, 0)))",
    "signup_fee": "sum(toFloat64(coalesce(ms.vendor_signup_rev, 0)))",
    "service_fee": "sum(toFloat64(coalesce(ms.service_fee, 0)))",
    "penalty": "sum(toFloat64(coalesce(ms.penalty, 0)))",
    "customer_support_costs": "-sum(toFloat64(coalesce(ms.customer_support_cost, 0) + coalesce(ms.support_cost, 0)))",
    "brand_costs": "-sum(toFloat64(coalesce(ms.brand_cost, 0)))",
    "vouchers_nc": "-sumIf(toFloat64(coalesce(ms.basalam_discount, 0)), ms.customer_type_id = 1)",
    "general_cost_nc": "-sumIf(toFloat64(coalesce(ms.marketing_cost, 0)), ms.customer_type_id = 1)",
    "ga_costs": "-sum(toFloat64(coalesce(ms.g_and_a_cost, 0)))",
    "hr_costs": "-sum(toFloat64(coalesce(ms.hr_cost, 0)))",
}


CALCULATED_DEPENDENCIES: dict[str, list[str]] = {
    "nmv": ["gmv", "refund_amount", "delivery_cost", "vendor_discount"],
    "main_revenue": ["commission", "ads"],
    "marketing_crc": ["vouchers_crc", "general_cost_crc"],
    "total_fee": ["signup_fee", "service_fee", "penalty"],
    "pc1": ["main_revenue", "cost_of_revenue", "marketing_crc", "vat"],
    "pc2": ["pc1", "total_fee", "customer_support_costs"],
    "marketing_nc": ["vouchers_nc", "general_cost_nc"],
    "pc3": ["pc2", "brand_costs", "marketing_nc"],
    "ebitda": ["pc3", "ga_costs", "hr_costs"],
    "avg_order_value": ["gmv", "orders"],
}

DAILY_ALLOCATED_BASE_METRICS = {
    "ads",
    "cost_of_revenue",
    "vouchers_crc",
    "general_cost_crc",
    "vat",
    "signup_fee",
    "customer_support_costs",
    "brand_costs",
    "vouchers_nc",
    "general_cost_nc",
    "ga_costs",
    "hr_costs",
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


def evaluate_metric(metric_id: str, raw_values: dict[str, float], cache: dict[str, float] | None = None) -> float:
    if cache is None:
        cache = {}
    if metric_id in cache:
        return cache[metric_id]

    if metric_id in BASE_METRIC_SQL:
        value = to_number(raw_values.get(metric_id, 0.0))
        cache[metric_id] = value
        return value

    value = 0.0
    if metric_id == "nmv":
        value = (
            evaluate_metric("gmv", raw_values, cache)
            + evaluate_metric("refund_amount", raw_values, cache)
            + evaluate_metric("delivery_cost", raw_values, cache)
            + evaluate_metric("vendor_discount", raw_values, cache)
        )
    elif metric_id == "main_revenue":
        value = evaluate_metric("commission", raw_values, cache) + evaluate_metric("ads", raw_values, cache)
    elif metric_id == "marketing_crc":
        value = evaluate_metric("vouchers_crc", raw_values, cache) + evaluate_metric("general_cost_crc", raw_values, cache)
    elif metric_id == "total_fee":
        value = (
            evaluate_metric("signup_fee", raw_values, cache)
            + evaluate_metric("service_fee", raw_values, cache)
            + evaluate_metric("penalty", raw_values, cache)
        )
    elif metric_id == "pc1":
        value = (
            evaluate_metric("main_revenue", raw_values, cache)
            + evaluate_metric("cost_of_revenue", raw_values, cache)
            + evaluate_metric("marketing_crc", raw_values, cache)
            + evaluate_metric("vat", raw_values, cache)
        )
    elif metric_id == "pc2":
        value = (
            evaluate_metric("pc1", raw_values, cache)
            + evaluate_metric("total_fee", raw_values, cache)
            + evaluate_metric("customer_support_costs", raw_values, cache)
        )
    elif metric_id == "marketing_nc":
        value = evaluate_metric("vouchers_nc", raw_values, cache) + evaluate_metric("general_cost_nc", raw_values, cache)
    elif metric_id == "pc3":
        value = (
            evaluate_metric("pc2", raw_values, cache)
            + evaluate_metric("brand_costs", raw_values, cache)
            + evaluate_metric("marketing_nc", raw_values, cache)
        )
    elif metric_id == "ebitda":
        value = (
            evaluate_metric("pc3", raw_values, cache)
            + evaluate_metric("ga_costs", raw_values, cache)
            + evaluate_metric("hr_costs", raw_values, cache)
        )
    elif metric_id == "avg_order_value":
        orders = evaluate_metric("orders", raw_values, cache)
        if orders <= 0:
            value = 0.0
        else:
            value = evaluate_metric("gmv", raw_values, cache) / orders

    cache[metric_id] = value
    return value


def resolve_base_dependencies(metric_id: str, seen: set[str] | None = None) -> set[str]:
    if metric_id in BASE_METRIC_SQL:
        return {metric_id}
    if metric_id not in CALCULATED_DEPENDENCIES:
        return set()

    current_seen = set(seen or set())
    if metric_id in current_seen:
        return set()
    current_seen.add(metric_id)

    dependencies: set[str] = set()
    for dep in CALCULATED_DEPENDENCIES[metric_id]:
        dependencies.update(resolve_base_dependencies(dep, current_seen))
    return dependencies


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
        try:
            result = client.query(query)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"ClickHouse query failed: {exc}") from exc
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
            required_base_metrics.update(resolve_base_dependencies(metric_id))
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported metric id: {metric_id}")

    metric_select_parts = [f"{BASE_METRIC_SQL[m]} AS m_{m}" for m in sorted(required_base_metrics)]
    requires_daily_cost = bool(required_base_metrics.intersection(DAILY_ALLOCATED_BASE_METRICS))

    where_parts: list[str] = []
    has_year_scope_filter = False
    for filter_obj in config.filters:
        condition = build_filter_condition(filter_obj)
        if condition:
            where_parts.append(condition)
            if filter_obj.dimension.id in {"year", "year_month"}:
                has_year_scope_filter = True

    if requires_daily_cost and not has_year_scope_filter:
        raise HTTPException(
            status_code=400,
            detail=(
                "Using cost-allocated P&L metrics requires a Year or Year-Month filter "
                "to keep query size bounded."
            ),
        )

    base_where_parts = ["ms.purchase_at IS NOT NULL", *where_parts]
    base_where_sql = " AND ".join(base_where_parts)

    if requires_daily_cost:
        prepared_cte_sql = f"""
        daily_cost AS (
          SELECT
            b.*,
            count() OVER (PARTITION BY b.gdate) AS daily_item_count,
            toFloat64(coalesce(cr.ads_rev, 0)) AS ads_rev_daily,
            toFloat64(coalesce(cr.vendor_signup_rev, 0)) AS vendor_signup_rev_daily,
            toFloat64(coalesce(cr.cost_of_revenue_cost, 0)) AS cost_of_revenue_cost_daily,
            toFloat64(coalesce(cr.vat_cost, 0)) AS vat_cost_daily,
            toFloat64(coalesce(cr.marketing_cost, 0)) AS marketing_cost_daily,
            toFloat64(coalesce(cr.customer_support_cost, 0)) AS customer_support_cost_daily,
            toFloat64(coalesce(cr.support_cost, 0)) AS support_cost_daily,
            toFloat64(coalesce(cr.brand_cost, 0)) AS brand_cost_daily,
            toFloat64(coalesce(cr.g_and_a_cost, 0)) AS g_and_a_cost_daily,
            toFloat64(coalesce(cr.hr_cost, 0)) AS hr_cost_daily
          FROM base b
          LEFT JOIN {database}.daily_cost_revenue cr
            ON b.gdate = cr.gregorian_date
        ),
        prepared AS (
          SELECT
            dc.*,
            dc.ads_rev_daily / if(dc.daily_item_count = 0, 1, dc.daily_item_count) AS ads_rev,
            dc.vendor_signup_rev_daily / if(dc.daily_item_count = 0, 1, dc.daily_item_count) AS vendor_signup_rev,
            dc.cost_of_revenue_cost_daily / if(dc.daily_item_count = 0, 1, dc.daily_item_count) AS cost_of_revenue_cost,
            dc.vat_cost_daily / if(dc.daily_item_count = 0, 1, dc.daily_item_count) AS vat_cost,
            dc.marketing_cost_daily / if(dc.daily_item_count = 0, 1, dc.daily_item_count) AS marketing_cost,
            dc.customer_support_cost_daily / if(dc.daily_item_count = 0, 1, dc.daily_item_count) AS customer_support_cost,
            dc.support_cost_daily / if(dc.daily_item_count = 0, 1, dc.daily_item_count) AS support_cost,
            dc.brand_cost_daily / if(dc.daily_item_count = 0, 1, dc.daily_item_count) AS brand_cost,
            dc.g_and_a_cost_daily / if(dc.daily_item_count = 0, 1, dc.daily_item_count) AS g_and_a_cost,
            dc.hr_cost_daily / if(dc.daily_item_count = 0, 1, dc.daily_item_count) AS hr_cost
          FROM daily_cost dc
        )
        """
    else:
        prepared_cte_sql = """
        prepared AS (
          SELECT
            b.*,
            toFloat64(0) AS ads_rev,
            toFloat64(0) AS vendor_signup_rev,
            toFloat64(0) AS cost_of_revenue_cost,
            toFloat64(0) AS vat_cost,
            toFloat64(0) AS marketing_cost,
            toFloat64(0) AS customer_support_cost,
            toFloat64(0) AS support_cost,
            toFloat64(0) AS brand_cost,
            toFloat64(0) AS g_and_a_cost,
            toFloat64(0) AS hr_cost
          FROM base b
        )
        """

    query = f"""
        WITH base AS (
          SELECT
            ms.purchase_date AS gdate,
            ms.item_id,
            ms.order_id,
            toInt32(coalesce(ms.customer_type_id, 0)) AS customer_type_id,
            toInt32(coalesce(ms.vendor_type_id, 0)) AS vendor_type_id,
            ms.customer_province_title,
            ms.vendor_province_title,
            ms.cat_lvl1_title,
            ms.cat_lvl2_title,
            ms.cat_lvl3_title,
            toInt32(coalesce(ms.persian_year, 0)) AS persian_year,
            toInt32(ms.persiandate_purchase_yearmonth) AS persiandate_purchase_yearmonth,
            toFloat64(coalesce(ms.gmv, 0)) AS gmv,
            toFloat64(coalesce(ms.refund_amount, 0)) AS refund_amount,
            toFloat64(coalesce(ms.delivery_cost, 0)) AS delivery_cost,
            toFloat64(coalesce(ms.vendor_discount, 0)) AS vendor_discount,
            toFloat64(coalesce(ms.basalam_discount, 0)) AS basalam_discount,
            toFloat64(coalesce(ms.commission, 0)) AS commission,
            toFloat64(coalesce(ms.satisfaction_commission, 0)) AS satisfaction_commission,
            toFloat64(coalesce(ms.service_fee, 0)) AS service_fee,
            toFloat64(coalesce(ms.penalty, 0)) AS penalty
          FROM {database}.model_sales ms
          WHERE {base_where_sql}
        ),
        {prepared_cte_sql}
        SELECT
          {", ".join(row_select_parts)},
          {col_expr} AS col_value,
          {col_sort_expr} AS col_sort,
          {", ".join(metric_select_parts)}
        FROM prepared ms
        WHERE 1 = 1
        GROUP BY {", ".join(row_group_parts + [col_expr, col_sort_expr])}
        ORDER BY col_sort, {", ".join(row_group_parts)}
    """

    try:
        result = client.query(query)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"ClickHouse query failed: {exc}") from exc
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
            metric_cache: dict[str, float] = {}
            for metric_id in metric_ids:
                metric = metric_map[metric_id]
                metric_value = evaluate_metric(metric_id, raw_values, metric_cache)
                cells[f"{col_key}_{metric_id}"] = make_cell(metric_value, metric, False)

        for base_metric in required_base_metrics:
            grand_totals[base_metric] += row_total_base[base_metric]

        row_total_cache: dict[str, float] = {}
        for metric_id in metric_ids:
            metric = metric_map[metric_id]
            total_value = evaluate_metric(metric_id, row_total_base, row_total_cache)
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
            column_total_cache: dict[str, float] = {}
            for metric_id in metric_ids:
                metric = metric_map[metric_id]
                metric_value = evaluate_metric(metric_id, base_for_column, column_total_cache)
                total_cells[f"{col_key}_{metric_id}"] = make_cell(metric_value, metric, True)

        grand_total_cache: dict[str, float] = {}
        for metric_id in metric_ids:
            metric = metric_map[metric_id]
            total_value = evaluate_metric(metric_id, grand_totals, grand_total_cache)
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
