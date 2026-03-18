// Basalam P&L Report Type Definitions
// Based on the e-commerce P&L query with Persian calendar support

export interface Dimension {
  id: string;
  name: string;
  nameFa?: string; // Persian name
  field: string;
  table: string;
  dictTable?: string; // For ClickHouse dict lookups
  level?: number;
  parentDimension?: string;
  children?: Dimension[];
  isVariable?: boolean; // Can be used as dimension selector
}

export interface Metric {
  id: string;
  name: string;
  nameFa?: string;
  field: string;
  aggregation: 'sum' | 'count' | 'avg' | 'countDistinct' | 'none';
  format: 'currency' | 'number' | 'percent' | 'integer';
  decimals?: number;
  prefix?: string;
  suffix?: string;
  isNegative?: boolean; // Display in red (costs)
  category: 'volume' | 'revenue' | 'cost' | 'profit' | 'ratio';
  order?: number; // Display order in P&L
}

export interface CalculatedMetric extends Metric {
  type: 'calculated';
  formula: string;
  dependencies: string[];
  calculate: (row: Record<string, number>) => number;
}

// ============================================
// DIMENSIONS - Based on Basalam Query
// ============================================

// Time Dimensions - Persian Calendar
export const PERSIAN_TIME_DIMENSIONS: Dimension[] = [
  {
    id: 'persian_year',
    name: 'Persian Year',
    nameFa: 'سال شمسی',
    field: 'persianyear',
    table: 'OLAPBasalam.dim_date_dict',
    dictTable: 'OLAPBasalam.dim_date_dict',
    level: 0
  },
  {
    id: 'persian_year_month',
    name: 'Year-Month',
    nameFa: 'سال-ماه',
    field: 'persianyearmonth',
    table: 'OLAPBasalam.dim_date_dict',
    dictTable: 'OLAPBasalam.dim_date_dict',
    level: 1,
    parentDimension: 'persian_year'
  },
  {
    id: 'persian_month',
    name: 'Month',
    nameFa: 'ماه',
    field: 'persianmonthnumber',
    table: 'OLAPBasalam.dim_date_dict',
    dictTable: 'OLAPBasalam.dim_date_dict',
    level: 1,
    parentDimension: 'persian_year'
  },
  {
    id: 'persian_date',
    name: 'Date',
    nameFa: 'تاریخ',
    field: 'persiandate',
    table: 'OLAPBasalam.dim_date_dict',
    dictTable: 'OLAPBasalam.dim_date_dict',
    level: 2,
    parentDimension: 'persian_year_month'
  },
  {
    id: 'persian_season',
    name: 'Season',
    nameFa: 'فصل',
    field: 'persianseason',
    table: 'OLAPBasalam.dim_date_dict',
    dictTable: 'OLAPBasalam.dim_date_dict',
    level: 1,
    parentDimension: 'persian_year'
  },
  {
    id: 'persian_year_season',
    name: 'Year-Season',
    nameFa: 'سال-فصل',
    field: 'persianyearseason',
    table: 'OLAPBasalam.dim_date_dict',
    dictTable: 'OLAPBasalam.dim_date_dict',
    level: 1
  },
  {
    id: 'persian_semester',
    name: 'Semester',
    nameFa: 'نیم‌سال',
    field: 'persiansemester',
    table: 'OLAPBasalam.dim_date_dict',
    dictTable: 'OLAPBasalam.dim_date_dict',
    level: 1
  },
];

// Product/Category Hierarchy
export const CATEGORY_DIMENSIONS: Dimension[] = [
  {
    id: 'cat_lvl1_id',
    name: 'Category L1',
    nameFa: 'دسته‌بندی سطح ۱',
    field: 'cat_lvl1_id',
    table: 'lc',
    level: 0,
    isVariable: true
  },
  {
    id: 'cat_lvl1_title',
    name: 'Category L1 Title',
    nameFa: 'نام دسته‌بندی ۱',
    field: 'cat_lvl1_title',
    table: 'lc',
    level: 0,
    parentDimension: 'cat_lvl1_id',
    isVariable: true
  },
  {
    id: 'cat_lvl2_id',
    name: 'Category L2',
    nameFa: 'دسته‌بندی سطح ۲',
    field: 'cat_lvl2_id',
    table: 'lc',
    level: 1,
    parentDimension: 'cat_lvl1_id',
    isVariable: true
  },
  {
    id: 'cat_lvl2_title',
    name: 'Category L2 Title',
    nameFa: 'نام دسته‌بندی ۲',
    field: 'cat_lvl2_title',
    table: 'lc',
    level: 1,
    parentDimension: 'cat_lvl2_id',
    isVariable: true
  },
  {
    id: 'cat_lvl3_id',
    name: 'Category L3',
    nameFa: 'دسته‌بندی سطح ۳',
    field: 'cat_lvl3_id',
    table: 'lc',
    level: 2,
    parentDimension: 'cat_lvl2_id',
    isVariable: true
  },
  {
    id: 'cat_lvl3_title',
    name: 'Category L3 Title',
    nameFa: 'نام دسته‌بندی ۳',
    field: 'cat_lvl3_title',
    table: 'lc',
    level: 2,
    parentDimension: 'cat_lvl3_id',
    isVariable: true
  },
  {
    id: 'item_id',
    name: 'Item ID',
    nameFa: 'شناسه محصول',
    field: 'item_id',
    table: 'ms',
    level: 3,
    parentDimension: 'cat_lvl3_id'
  },
];

// Geography Dimensions
export const GEOGRAPHY_DIMENSIONS: Dimension[] = [
  {
    id: 'customer_province',
    name: 'Customer Province',
    nameFa: 'استان مشتری',
    field: 'customer_province_title',
    table: 'ms',
    level: 0,
    isVariable: true
  },
  {
    id: 'vendor_province',
    name: 'Vendor Province',
    nameFa: 'استان فروشنده',
    field: 'vendor_province_title',
    table: 'ms',
    level: 0,
    isVariable: true
  },
];

// Customer/Vendor Type Dimensions
export const TYPE_DIMENSIONS: Dimension[] = [
  {
    id: 'customer_type',
    name: 'Customer Type',
    nameFa: 'نوع مشتری',
    field: 'customer_type_id',
    table: 'ms',
    level: 0,
    isVariable: true
  },
  {
    id: 'vendor_type',
    name: 'Vendor Type',
    nameFa: 'نوع فروشنده',
    field: 'vendor_type_id',
    table: 'ms',
    level: 0,
    isVariable: true
  },
];

// All Dimensions Combined
export const ALL_DIMENSIONS: Dimension[] = [
  ...PERSIAN_TIME_DIMENSIONS,
  ...CATEGORY_DIMENSIONS,
  ...GEOGRAPHY_DIMENSIONS,
  ...TYPE_DIMENSIONS,
];

// ============================================
// METRICS - Based on Basalam P&L Query
// ============================================

// Volume Metrics
export const VOLUME_METRICS: Metric[] = [
  {
    id: 'orders',
    name: 'Orders',
    nameFa: 'تعداد سفارش',
    field: 'order_id',
    aggregation: 'countDistinct',
    format: 'integer',
    category: 'volume',
    order: 1,
  },
  {
    id: 'items',
    name: 'Items',
    nameFa: 'تعداد آیتم',
    field: 'item_id',
    aggregation: 'count',
    format: 'integer',
    category: 'volume',
    order: 2,
  },
  {
    id: 'aov',
    name: 'AOV',
    nameFa: 'میانگین سبد',
    field: 'aov',
    aggregation: 'avg',
    format: 'currency',
    decimals: 0,
    category: 'volume',
    order: 3,
  },
];

// GMV & NMV Metrics
export const GMV_METRICS: Metric[] = [
  {
    id: 'gmv',
    name: 'GMV',
    nameFa: 'GMV',
    field: 'gmv',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
    category: 'revenue',
    order: 10,
  },
  {
    id: 'refunds',
    name: 'Refunds',
    nameFa: 'بازگشت وجه',
    field: 'refund_amount',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
    isNegative: true,
    category: 'cost',
    order: 11,
  },
  {
    id: 'delivery_costs',
    name: 'Delivery Costs',
    nameFa: 'هزینه ارسال',
    field: 'delivery_cost',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
    isNegative: true,
    category: 'cost',
    order: 12,
  },
  {
    id: 'vendor_discounts',
    name: 'Vendor Discounts',
    nameFa: 'تخفیف فروشنده',
    field: 'vendor_discount',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
    isNegative: true,
    category: 'cost',
    order: 13,
  },
  {
    id: 'nmv',
    name: 'NMV',
    nameFa: 'NMV',
    field: 'nmv',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
    category: 'revenue',
    order: 14,
  },
];

// Main Revenue Metrics
export const MAIN_REVENUE_METRICS: Metric[] = [
  {
    id: 'commission',
    name: 'Commission',
    nameFa: 'کمیسیون',
    field: 'commission',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
    category: 'revenue',
    order: 20,
  },
  {
    id: 'satisfaction_commission',
    name: 'Satisfaction Commission',
    nameFa: 'کمیسیون رضایت',
    field: 'satisfaction_commission',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
    category: 'revenue',
    order: 21,
  },
  {
    id: 'ads',
    name: 'Ads',
    nameFa: 'درآمد تبلیغات',
    field: 'ads_rev',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
    category: 'revenue',
    order: 22,
  },
  {
    id: 'main_revenue',
    name: 'Main Revenue',
    nameFa: 'درآمد اصلی',
    field: 'main_revenue',
    aggregation: 'none',
    format: 'currency',
    decimals: 0,
    category: 'revenue',
    order: 23,
  },
];

// Cost of Revenue Metrics
export const COR_METRICS: Metric[] = [
  {
    id: 'cost_of_revenue',
    name: 'Cost of Revenue',
    nameFa: 'هزینه درآمد',
    field: 'cost_of_revenue_cost',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
    isNegative: true,
    category: 'cost',
    order: 30,
  },
  {
    id: 'vouchers_crc',
    name: 'Vouchers CRC',
    nameFa: 'وچر CRC',
    field: 'basalam_discount',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
    isNegative: true,
    category: 'cost',
    order: 31,
  },
  {
    id: 'marketing_crc',
    name: 'Marketing CRC',
    nameFa: 'مارکتینگ CRC',
    field: 'marketing_cost',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
    isNegative: true,
    category: 'cost',
    order: 32,
  },
  {
    id: 'vat',
    name: 'VAT',
    nameFa: 'مالیات',
    field: 'vat_cost',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
    isNegative: true,
    category: 'cost',
    order: 33,
  },
];

// Fee Metrics
export const FEE_METRICS: Metric[] = [
  {
    id: 'signup_fee',
    name: 'Signup Fee',
    nameFa: 'درآمد عضویت',
    field: 'vendor_signup_rev',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
    category: 'revenue',
    order: 40,
  },
  {
    id: 'penalty_fee',
    name: 'Penalty Fee',
    nameFa: 'جریمه',
    field: 'penalty',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
    category: 'revenue',
    order: 41,
  },
  {
    id: 'platform_fee',
    name: 'Platform Fee',
    nameFa: 'هزینه پلتفرم',
    field: 'service_fee',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
    category: 'revenue',
    order: 42,
  },
];

// Operating Cost Metrics
export const OP_EX_METRICS: Metric[] = [
  {
    id: 'customer_support_costs',
    name: 'Customer Support',
    nameFa: 'پشتیبانی مشتری',
    field: 'customer_support_cost',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
    isNegative: true,
    category: 'cost',
    order: 50,
  },
  {
    id: 'brand_costs',
    name: 'Brand Costs',
    nameFa: 'هزینه برند',
    field: 'brand_cost',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
    isNegative: true,
    category: 'cost',
    order: 51,
  },
  {
    id: 'ga_costs',
    name: 'G&A Costs',
    nameFa: 'هزینه‌های اداری',
    field: 'g_and_a_cost',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
    isNegative: true,
    category: 'cost',
    order: 52,
  },
  {
    id: 'hr_costs',
    name: 'HR Costs',
    nameFa: 'هزینه منابع انسانی',
    field: 'hr_cost',
    aggregation: 'sum',
    format: 'currency',
    decimals: 0,
    isNegative: true,
    category: 'cost',
    order: 53,
  },
];

// Profit Center Metrics (Calculated)
export const PROFIT_METRICS: CalculatedMetric[] = [
  {
    id: 'pc1',
    name: 'PC1',
    nameFa: 'PC1',
    field: 'pc1',
    aggregation: 'none',
    type: 'calculated',
    format: 'currency',
    decimals: 0,
    category: 'profit',
    order: 60,
    formula: 'Main Revenue + Cost of Revenue + Marketing CRC + VAT',
    dependencies: ['main_revenue', 'cost_of_revenue', 'marketing_crc', 'vat'],
    calculate: (row) => (row.main_revenue || 0) + (row.cost_of_revenue || 0) + (row.marketing_crc || 0) + (row.vat || 0),
  },
  {
    id: 'pc2',
    name: 'PC2',
    nameFa: 'PC2',
    field: 'pc2',
    aggregation: 'none',
    type: 'calculated',
    format: 'currency',
    decimals: 0,
    category: 'profit',
    order: 61,
    formula: 'PC1 + Total Fee + Customer Support Costs',
    dependencies: ['pc1', 'total_fee', 'customer_support_costs'],
    calculate: (row) => (row.pc1 || 0) + (row.total_fee || 0) + (row.customer_support_costs || 0),
  },
  {
    id: 'pc3',
    name: 'PC3',
    nameFa: 'PC3',
    field: 'pc3',
    aggregation: 'none',
    type: 'calculated',
    format: 'currency',
    decimals: 0,
    category: 'profit',
    order: 62,
    formula: 'PC2 + Brand Costs + Marketing NC',
    dependencies: ['pc2', 'brand_costs', 'marketing_nc'],
    calculate: (row) => (row.pc2 || 0) + (row.brand_costs || 0) + (row.marketing_nc || 0),
  },
  {
    id: 'ebitda',
    name: 'EBITDA',
    nameFa: 'EBITDA',
    field: 'ebitda',
    aggregation: 'none',
    type: 'calculated',
    format: 'currency',
    decimals: 0,
    category: 'profit',
    order: 63,
    formula: 'PC3 + G&A Costs + HR Costs',
    dependencies: ['pc3', 'ga_costs', 'hr_costs'],
    calculate: (row) => (row.pc3 || 0) + (row.ga_costs || 0) + (row.hr_costs || 0),
  },
];

// All Metrics Combined
export const ALL_METRICS: (Metric | CalculatedMetric)[] = [
  ...VOLUME_METRICS,
  ...GMV_METRICS,
  ...MAIN_REVENUE_METRICS,
  ...COR_METRICS,
  ...FEE_METRICS,
  ...OP_EX_METRICS,
  ...PROFIT_METRICS,
];

// ============================================
// P&L CONFIGURATION
// ============================================

export interface PnLConfig {
  // Dimension selectors
  dimensionField: string; // Which dimension to group by (cat_lvl1_title, customer_province, etc.)
  dateType: string; // persianyear, persianyearmonth, persianseason, etc.

  // Filters
  filters: {
    catLvl1Title?: string;
    catLvl2Title?: string;
    catLvl3Title?: string;
    customerProvince?: string;
    vendorProvince?: string;
    customerTypeId?: number;
    vendorTypeId?: number;
    persianYear?: number;
  };

  // Metrics to display
  metrics: (Metric | CalculatedMetric)[];

  // View type
  viewType: 'numbers' | 'ratios' | 'both';

  // Display options
  options: {
    showTotals: boolean;
    currencyCode: string;
    language: 'en' | 'fa';
  };
}

// Default configuration
export const DEFAULT_PNL_CONFIG: PnLConfig = {
  dimensionField: 'cat_lvl1_title',
  dateType: 'persianyearmonth',
  filters: {
    persianYear: 1403,
  },
  metrics: [
    VOLUME_METRICS[0], // Orders
    GMV_METRICS[0], // GMV
    GMV_METRICS[4], // NMV
    MAIN_REVENUE_METRICS[3], // Main Revenue
    PROFIT_METRICS[0], // PC1
    PROFIT_METRICS[3], // EBITDA
  ],
  viewType: 'numbers',
  options: {
    showTotals: true,
    currencyCode: 'IRR',
    language: 'fa',
  },
};

// ============================================
// QUERY BUILDER TYPES
// ============================================

export interface QueryBuildOptions {
  withCte?: boolean;
  withRatios?: boolean;
  withTotals?: boolean;
  orderBy?: string[];
}

export interface BuiltQuery {
  sql: string;
  parameters: Record<string, any>;
  description: string;
}
