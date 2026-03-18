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
  aggregation: 'sum' | 'count' | 'countDistinct' | 'avg' | 'min' | 'max' | 'custom';
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
  children?: PnLRow[];
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
  { id: 'category_l1', name: 'Category L1', field: 'cat_lvl1_title', table: 'model_sales', level: 0 },
  { id: 'category_l2', name: 'Category L2', field: 'cat_lvl2_title', table: 'model_sales', level: 1, parentDimension: 'category_l1' },
  { id: 'category_l3', name: 'Category L3', field: 'cat_lvl3_title', table: 'model_sales', level: 2, parentDimension: 'category_l2' },
  { id: 'item_id', name: 'Item ID', field: 'item_id', table: 'model_sales', level: 3, parentDimension: 'category_l3' },
];

export const GEOGRAPHY_HIERARCHY: Dimension[] = [
  { id: 'customer_province', name: 'Customer Province', field: 'customer_province_title', table: 'model_sales', level: 0 },
  { id: 'vendor_province', name: 'Vendor Province', field: 'vendor_province_title', table: 'model_sales', level: 0 },
  { id: 'customer_type', name: 'Customer Type', field: 'customer_type_id', table: 'model_sales', level: 0 },
  { id: 'vendor_type', name: 'Vendor Type', field: 'vendor_type_id', table: 'model_sales', level: 0 },
];

export const TIME_HIERARCHY: Dimension[] = [
  { id: 'year', name: 'Persian Year', field: 'persian_year', table: 'model_sales', level: 0 },
  { id: 'year_month', name: 'Year-Month', field: 'persiandate_purchase_yearmonth', table: 'model_sales', level: 1, parentDimension: 'year' },
  { id: 'month', name: 'Month', field: 'persian_month', table: 'model_sales', level: 2, parentDimension: 'year_month' },
];

// Standard P&L Metrics
export const STANDARD_PNL_METRICS: Metric[] = [
  {
    id: 'orders',
    name: 'Orders',
    field: 'order_id',
    table: 'model_sales',
    aggregation: 'countDistinct',
    format: 'integer',
    decimals: 0,
  },
  {
    id: 'items',
    name: 'Items',
    field: 'item_id',
    table: 'model_sales',
    aggregation: 'count',
    format: 'integer',
    decimals: 0,
  },
  {
    id: 'gmv',
    name: 'GMV',
    field: 'gmv',
    table: 'model_sales',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
  },
  {
    id: 'refund_amount',
    name: 'Refund Amount',
    field: 'refund_amount',
    table: 'model_sales',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
  },
  {
    id: 'delivery_cost',
    name: 'Delivery Cost',
    field: 'delivery_cost',
    table: 'model_sales',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
  },
  {
    id: 'vendor_discount',
    name: 'Vendor Discount',
    field: 'vendor_discount',
    table: 'model_sales',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
  },
  {
    id: 'commission',
    name: 'Commission',
    field: 'commission',
    table: 'model_sales',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
  },
  {
    id: 'satisfaction_commission',
    name: 'Satisfaction Commission',
    field: 'satisfaction_commission',
    table: 'model_sales',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
  },
  {
    id: 'service_fee',
    name: 'Service Fee',
    field: 'service_fee',
    table: 'model_sales',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
  },
  {
    id: 'penalty',
    name: 'Penalty',
    field: 'penalty',
    table: 'model_sales',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
  },
];

// Calculated P&L Metrics
export const CALCULATED_PNL_METRICS: CalculatedMetric[] = [
  {
    id: 'nmv',
    name: 'NMV',
    field: 'nmv',
    table: 'calculated',
    aggregation: 'custom',
    type: 'calculated',
    format: 'currency',
    decimals: 0,
    dependencies: ['gmv', 'refund_amount', 'delivery_cost', 'vendor_discount'],
    calculate: (row) =>
      (row.gmv || 0)
      - (row.refund_amount || 0)
      - (row.delivery_cost || 0)
      - (row.vendor_discount || 0),
  },
  {
    id: 'main_revenue',
    name: 'Main Revenue',
    field: 'main_revenue',
    table: 'calculated',
    aggregation: 'custom',
    type: 'calculated',
    format: 'currency',
    decimals: 0,
    dependencies: ['commission', 'satisfaction_commission'],
    calculate: (row) => (row.commission || 0) + (row.satisfaction_commission || 0),
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
    dependencies: ['gmv', 'orders'],
    calculate: (row) => {
      const orders = row.orders || 1;
      return (row.gmv || 0) / orders;
    },
  },
  {
    id: 'total_fee',
    name: 'Total Fee',
    field: 'total_fee',
    table: 'calculated',
    aggregation: 'custom',
    type: 'calculated',
    format: 'currency',
    decimals: 0,
    dependencies: ['service_fee', 'penalty'],
    calculate: (row) => (row.service_fee || 0) + (row.penalty || 0),
  },
];
