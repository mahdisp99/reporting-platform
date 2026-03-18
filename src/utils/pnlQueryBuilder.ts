// P&L Query Builder - Generates SQL for dimensional analysis

import type { PnLConfig, Dimension, Metric, Filter, CalculatedMetric } from '../types/pnl';

interface QueryParts {
  select: string[];
  from: string;
  joins: string[];
  where: string[];
  groupBy: string[];
  orderBy: string[];
}

export class PnLQueryBuilder {
  private config: PnLConfig;

  constructor(config: PnLConfig) {
    this.config = config;
  }

  /**
   * Build the complete SQL query for P&L report
   */
  buildQuery(): string {
    const parts = this.buildQueryParts();

    const query = [
      `SELECT`,
      `  ${parts.select.join(',\n  ')}`,
      `FROM ${parts.from}`,
      parts.joins.length > 0 ? parts.joins.join('\n') : '',
      parts.where.length > 0 ? `WHERE ${parts.where.join(' AND ')}` : '',
      parts.groupBy.length > 0 ? `GROUP BY ${parts.groupBy.join(', ')}` : '',
      parts.orderBy.length > 0 ? `ORDER BY ${parts.orderBy.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return query;
  }

  /**
   * Build query parts based on configuration
   */
  private buildQueryParts(): QueryParts {
    const parts: QueryParts = {
      select: [],
      from: 'order_items oi',
      joins: [],
      where: [],
      groupBy: [],
      orderBy: [],
    };

    // Add dimension fields to SELECT and GROUP BY
    this.addDimensions(parts);

    // Add metric aggregations to SELECT
    this.addMetrics(parts);

    // Add necessary JOINs
    this.addJoins(parts);

    // Add filters to WHERE
    this.addFilters(parts);

    return parts;
  }

  /**
   * Add dimension fields to query
   */
  private addDimensions(parts: QueryParts): void {
    const allDimensions = [...this.config.rowDimensions, ...this.config.columnDimensions];

    for (const dim of allDimensions) {
      const alias = this.getDimensionAlias(dim);
      parts.select.push(`${dim.table}.${dim.field} AS ${alias}`);
      parts.groupBy.push(`${dim.table}.${dim.field}`);

      // Add dimension level ordering
      if (dim.level !== undefined) {
        parts.orderBy.push(`${alias}`);
      }
    }
  }

  /**
   * Add metric aggregations to query
   */
  private addMetrics(parts: QueryParts): void {
    for (const metric of this.config.metrics) {
      if (this.isCalculatedMetric(metric)) {
        // Calculated metrics are computed client-side
        // But we need their dependencies in the query
        const deps = metric.dependencies;
        for (const depId of deps) {
          const depMetric = this.findMetricById(depId);
          if (depMetric && !this.isCalculatedMetric(depMetric)) {
            this.addMetricAggregation(parts, depMetric);
          }
        }
      } else {
        this.addMetricAggregation(parts, metric);
      }
    }
  }

  /**
   * Add a single metric aggregation
   */
  private addMetricAggregation(parts: QueryParts, metric: Metric): void {
    const alias = this.getMetricAlias(metric);

    switch (metric.aggregation) {
      case 'sum':
        parts.select.push(`SUM(${metric.table}.${metric.field}) AS ${alias}`);
        break;
      case 'count':
        parts.select.push(`COUNT(${metric.table}.${metric.field}) AS ${alias}`);
        break;
      case 'countDistinct':
        parts.select.push(`COUNT(DISTINCT ${metric.table}.${metric.field}) AS ${alias}`);
        break;
      case 'avg':
        parts.select.push(`AVG(${metric.table}.${metric.field}) AS ${alias}`);
        break;
      case 'min':
        parts.select.push(`MIN(${metric.table}.${metric.field}) AS ${alias}`);
        break;
      case 'max':
        parts.select.push(`MAX(${metric.table}.${metric.field}) AS ${alias}`);
        break;
      default:
        parts.select.push(`${metric.table}.${metric.field} AS ${alias}`);
    }
  }

  /**
   * Add necessary table JOINs
   */
  private addJoins(parts: QueryParts): void {
    const tablesNeeded = this.getRequiredTables();

    // Map of table relationships
    const joins: Record<string, string> = {
      'orders': 'JOIN orders o ON oi.order_id = o.id',
      'products': 'JOIN products p ON oi.product_id = p.id',
      'customers': 'JOIN customers c ON o.customer_id = c.id',
      'locations': 'JOIN locations l ON o.location_id = l.id',
      'dates': 'JOIN dates d ON o.date_id = d.id',
      'categories': 'JOIN categories cat ON p.category_id = cat.id',
    };

    for (const table of tablesNeeded) {
      if (joins[table] && !parts.joins.includes(joins[table])) {
        parts.joins.push(joins[table]);
      }
    }
  }

  /**
   * Add filter conditions
   */
  private addFilters(parts: QueryParts): void {
    for (const filter of this.config.filters) {
      const condition = this.buildFilterCondition(filter);
      if (condition) {
        parts.where.push(condition);
      }
    }

    // Add date range filter if applicable
    if (this.config.options?.periodStart && this.config.options?.periodEnd) {
      parts.where.push(`d.date BETWEEN '${this.config.options.periodStart}' AND '${this.config.options.periodEnd}'`);
    }
  }

  /**
   * Build a single filter condition
   */
  private buildFilterCondition(filter: Filter): string | null {
    const field = `${filter.dimension.table}.${filter.dimension.field}`;

    switch (filter.operator) {
      case 'equals':
        return `${field} = ${this.quoteValue(filter.value)}`;
      case 'notEquals':
        return `${field} != ${this.quoteValue(filter.value)}`;
      case 'in':
        const values = Array.isArray(filter.value) ? filter.value : [filter.value];
        return `${field} IN (${values.map(v => this.quoteValue(v)).join(', ')})`;
      case 'notIn':
        const notValues = Array.isArray(filter.value) ? filter.value : [filter.value];
        return `${field} NOT IN (${notValues.map(v => this.quoteValue(v)).join(', ')})`;
      case 'greaterThan':
        return `${field} > ${filter.value}`;
      case 'lessThan':
        return `${field} < ${filter.value}`;
      case 'between':
        const [min, max] = Array.isArray(filter.value) ? filter.value : [filter.value, filter.value];
        return `${field} BETWEEN ${this.quoteValue(min)} AND ${this.quoteValue(max)}`;
      default:
        return null;
    }
  }

  /**
   * Quote a value for SQL
   */
  private quoteValue(value: string | number): string {
    if (typeof value === 'number') return value.toString();
    return `'${value.replace(/'/g, "''")}'`;
  }

  /**
   * Get all tables needed for the query
   */
  private getRequiredTables(): string[] {
    const tables = new Set<string>();

    // From dimensions
    const allDimensions = [...this.config.rowDimensions, ...this.config.columnDimensions];
    for (const dim of allDimensions) {
      tables.add(dim.table);
    }

    // From metrics
    for (const metric of this.config.metrics) {
      if (!this.isCalculatedMetric(metric)) {
        tables.add(metric.table);
      }
    }

    return Array.from(tables);
  }

  /**
   * Find a metric by ID
   */
  private findMetricById(id: string): Metric | undefined {
    return this.config.metrics.find(m => m.id === id);
  }

  /**
   * Check if metric is calculated
   */
  private isCalculatedMetric(metric: Metric | CalculatedMetric): metric is CalculatedMetric {
    return 'type' in metric && metric.type === 'calculated';
  }

  /**
   * Get SQL alias for dimension
   */
  private getDimensionAlias(dim: Dimension): string {
    return `dim_${dim.id}`;
  }

  /**
   * Get SQL alias for metric
   */
  private getMetricAlias(metric: Metric): string {
    return `metric_${metric.id}`;
  }

  /**
   * Build drill-down query for expanding a row
   */
  buildDrillDownQuery(parentDimensions: Record<string, string | number>, nextLevel: Dimension): string {
    const parts = this.buildQueryParts();

    // Add the next level dimension
    const alias = this.getDimensionAlias(nextLevel);
    parts.select.push(`${nextLevel.table}.${nextLevel.field} AS ${alias}`);
    parts.groupBy.push(`${nextLevel.table}.${nextLevel.field}`);

    // Add parent dimension filters
    for (const [dimId, value] of Object.entries(parentDimensions)) {
      const dim = [...this.config.rowDimensions, ...this.config.columnDimensions].find(d => d.id === dimId);
      if (dim) {
        parts.where.push(`${dim.table}.${dim.field} = ${this.quoteValue(value)}`);
      }
    }

    const query = [
      `SELECT`,
      `  ${parts.select.join(',\n  ')}`,
      `FROM ${parts.from}`,
      parts.joins.length > 0 ? parts.joins.join('\n') : '',
      parts.where.length > 0 ? `WHERE ${parts.where.join(' AND ')}` : '',
      parts.groupBy.length > 0 ? `GROUP BY ${parts.groupBy.join(', ')}` : '',
      `ORDER BY ${alias}`,
    ]
      .filter(Boolean)
      .join('\n');

    return query;
  }

  /**
   * Build comparison query (YoY, MoM, etc.)
   */
  buildComparisonQuery(offset: number): string {
    // Clone config and adjust date range
    const comparisonConfig: PnLConfig = {
      ...this.config,
      // Adjust period dates based on offset
    };

    const builder = new PnLQueryBuilder(comparisonConfig);
    return builder.buildQuery();
  }
}

/**
 * Format a number based on metric configuration
 */
export function formatMetricValue(value: number, metric: Metric | CalculatedMetric): string {
  if (value === null || value === undefined) return '-';

  const decimals = metric.decimals ?? 2;

  switch (metric.format) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value);

    case 'percent':
      return `${value.toFixed(decimals)}%`;

    case 'integer':
      return Math.round(value).toLocaleString();

    case 'number':
    default:
      return value.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
  }
}

/**
 * Calculate variance between current and previous period
 */
export function calculateVariance(current: number, previous: number): { value: number; percent: number } {
  const value = current - previous;
  const percent = previous !== 0 ? (value / Math.abs(previous)) * 100 : 0;

  return { value, percent };
}
