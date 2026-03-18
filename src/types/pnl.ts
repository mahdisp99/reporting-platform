// P&L Report Type Definitions

export interface Dimension {
  id: string;
  name: string;
  field: string;
  table: string;
  level?: number;
  parentDimension?: string;
  children?: Dimension[];
}

export interface Metric {
  id: string;
  name: string;
  field: string;
  table: string;
  aggregation: 'sum' | 'count' | 'avg' | 'min' | 'max' | 'custom';
  formula?: string;
  format: 'currency' | 'number' | 'percent' | 'integer';
  decimals?: number;
  prefix?: string;
  suffix?: string;
}

export interface CalculatedMetric extends Metric {
  type: 'calculated';
  dependencies: string[];
  calculate: (row: Record<string, number>) => number;
}

export interface PnLConfig {
  // Row dimensions (hierarchical drill-down)
  rowDimensions: Dimension[];

  // Column dimensions (typically time periods)
  columnDimensions: Dimension[];

  // Metrics to display
  metrics: (Metric | CalculatedMetric)[];

  // Filters
  filters: Filter[];

  // Comparison settings
  comparison?: {
    enabled: boolean;
    type: 'yoy' | 'mom' | 'qoq' | 'custom';
    previousPeriodOffset?: number;
  };

  // Display options
  options: {
    showTotals: boolean;
    showSubtotals: boolean;
    expandAll: boolean;
    collapseLevel: number;
    currencyCode: string;
  };
}

export interface Filter {
  dimension: Dimension;
  operator: 'equals' | 'notEquals' | 'in' | 'notIn' | 'greaterThan' | 'lessThan' | 'between';
  value: string | string[] | number | number[];
}

export interface PnLCell {
  value: number | null;
  formattedValue: string;
  isCalculated: boolean;
  isTotal: boolean;
  comparisonValue?: number;
  variance?: number;
  variancePercent?: number;
}

export interface PnLRow {
  // Dimension values for this row
  dimensions: Record<string, string | number>;

  // Display level (for indentation)
  level: number;

  // Whether this row can be expanded
  isExpandable: boolean;

  // Whether this row is currently expanded
  isExpanded: boolean;

  // Metric values by column key
  cells: Record<string, PnLCell>;

  // Row metadata
  isTotal: boolean;
  isSubtotal: boolean;
  parentKey?: string;
}

export interface PnLReport {
  config: PnLConfig;
  rows: PnLRow[];
  columns: PnLColumn[];
  metadata: {
    generatedAt: string;
    periodStart?: string;
    periodEnd?: string;
    totalRows: number;
    currencyCode: string;
  };
}

export interface PnLColumn {
  key: string;
  title: string;
  dimensionValues: Record<string, string | number>;
  isTotal: boolean;
  children?: PnLColumn[];
}

// Predefined dimension hierarchies
export const PRODUCT_HIERARCHY: Dimension[] = [
  { id: 'category_l1', name: 'Category', field: 'category_level_1', table: 'products', level: 0 },
  { id: 'category_l2', name: 'Subcategory', field: 'category_level_2', table: 'products', level: 1, parentDimension: 'category_l1' },
  { id: 'category_l3', name: 'Product Type', field: 'category_level_3', table: 'products', level: 2, parentDimension: 'category_l2' },
  { id: 'item_id', name: 'Item', field: 'item_id', table: 'order_items', level: 3, parentDimension: 'category_l3' },
];

export const GEOGRAPHY_HIERARCHY: Dimension[] = [
  { id: 'province', name: 'Province', field: 'province', table: 'locations', level: 0 },
  { id: 'city', name: 'City', field: 'city', table: 'locations', level: 1, parentDimension: 'province' },
  { id: 'store_id', name: 'Store', field: 'store_id', table: 'orders', level: 2, parentDimension: 'city' },
];

export const TIME_HIERARCHY: Dimension[] = [
  { id: 'year', name: 'Year', field: 'year', table: 'dates', level: 0 },
  { id: 'quarter', name: 'Quarter', field: 'quarter', table: 'dates', level: 1, parentDimension: 'year' },
  { id: 'month', name: 'Month', field: 'month', table: 'dates', level: 2, parentDimension: 'quarter' },
  { id: 'week', name: 'Week', field: 'week', table: 'dates', level: 3, parentDimension: 'month' },
  { id: 'day', name: 'Day', field: 'date', table: 'dates', level: 4, parentDimension: 'week' },
];

// Standard P&L Metrics
export const STANDARD_PNL_METRICS: Metric[] = [
  {
    id: 'revenue',
    name: 'Revenue',
    field: 'revenue',
    table: 'order_items',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
  },
  {
    id: 'cost_of_goods',
    name: 'Cost of Goods Sold',
    field: 'cost_amount',
    table: 'order_items',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
  },
  {
    id: 'quantity',
    name: 'Quantity Sold',
    field: 'quantity',
    table: 'order_items',
    aggregation: 'sum',
    format: 'integer',
    decimals: 0,
  },
  {
    id: 'discount',
    name: 'Discounts',
    field: 'discount_amount',
    table: 'order_items',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
  },
];

// Calculated P&L Metrics
export const CALCULATED_PNL_METRICS: CalculatedMetric[] = [
  {
    id: 'gross_profit',
    name: 'Gross Profit',
    field: 'gross_profit',
    table: 'calculated',
    aggregation: 'custom',
    type: 'calculated',
    format: 'currency',
    decimals: 0,
    dependencies: ['revenue', 'cost_of_goods'],
    calculate: (row) => (row.revenue || 0) - (row.cost_of_goods || 0),
  },
  {
    id: 'gross_margin',
    name: 'Gross Margin %',
    field: 'gross_margin',
    table: 'calculated',
    aggregation: 'custom',
    type: 'calculated',
    format: 'percent',
    decimals: 2,
    dependencies: ['gross_profit', 'revenue'],
    calculate: (row) => {
      const revenue = row.revenue || 0;
      return revenue > 0 ? ((row.gross_profit || 0) / revenue) * 100 : 0;
    },
  },
  {
    id: 'avg_order_value',
    name: 'Avg Order Value',
    field: 'avg_order_value',
    table: 'calculated',
    aggregation: 'custom',
    type: 'calculated',
    format: 'currency',
    decimals: 2,
    dependencies: ['revenue', 'order_count'],
    calculate: (row) => {
      const orders = row.order_count || 1;
      return (row.revenue || 0) / orders;
    },
  },
  {
    id: 'net_revenue',
    name: 'Net Revenue',
    field: 'net_revenue',
    table: 'calculated',
    aggregation: 'custom',
    type: 'calculated',
    format: 'currency',
    decimals: 0,
    dependencies: ['revenue', 'discount'],
    calculate: (row) => (row.revenue || 0) - (row.discount || 0),
  },
];
