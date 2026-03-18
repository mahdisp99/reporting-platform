// Basalam P&L Query Builder
// Generates SQL matching the e-commerce P&L structure with Persian calendar support

import type {
  PnLConfig,
  Dimension,
  Metric,
  CalculatedMetric,
  BuiltQuery,
  QueryBuildOptions,
} from '../types/basalamPnl';

export class BasalamPnLQueryBuilder {
  private config: PnLConfig;

  constructor(config: PnLConfig) {
    this.config = config;
  }

  /**
   * Build the complete P&L query with all CTEs
   */
  buildQuery(options: QueryBuildOptions = {}): BuiltQuery {
    const { withCte = true, withRatios = false, withTotals = true } = options;

    const parts: string[] = [];

    // Base CTE
    parts.push(this.buildBaseCTE());

    // Prepare CTE
    parts.push(this.buildPrepareCTE());

    // Filter CTE
    parts.push(this.buildFilterCTE());

    // Numbers CTEs
    parts.push(this.buildNumbersDimensionCTE());
    if (withTotals) {
      parts.push(this.buildNumbersTotalCTE());
    }

    // Ratios CTEs (optional)
    if (withRatios) {
      parts.push(this.buildRatiosDimensionCTE());
      if (withTotals) {
        parts.push(this.buildRatiosTotalCTE());
      }
    }

    // Final CTEs and SELECT
    parts.push(this.buildFinalCTE(withRatios, withTotals));
    parts.push(this.buildFinalSelect());

    const sql = parts.join('\n\n');

    return {
      sql,
      parameters: this.buildParameters(),
      description: this.buildDescription(),
    };
  }

  /**
   * Build the base CTE with core joins
   */
  private buildBaseCTE(): string {
    const dateFields = this.getDateFields();

    return `
-- Base CTE: Core data with dimension lookups
with base as (
select
    purchase_date_id as gdate_id
    ,purchase_date as gdate

    -- Gregorian date fields
    ${dateFields.gregorian}

    -- Persian date fields (Jalali calendar)
    ${dateFields.persian}

    ,item_id
    ,order_id
    ,is_cancelled

    -- Customer dimensions
    ,customer_id
    ,case when customer_type_id in (0,1) then 1 else 2 end as customer_type_id
    ,customer_province_title

    -- Vendor dimensions
    ,vendor_id
    ,vendor_user_id
    ,case when vendor_type_id in (0,1) then 1 else 2 end as vendor_type_id
    ,vendor_province_title

    -- Category dimensions
    ,lc.cat_lvl1_id
    ,lc.cat_lvl1_title
    ,lc.cat_lvl2_id
    ,lc.cat_lvl2_title
    ,lc.cat_lvl3_id
    ,lc.cat_lvl3_title

    -- Core metrics
    ,gmv
    ,refund_amount
    ,delivery_cost
    ,coalesce(basalam_discount,0) as basalam_discount
    ,vendor_discount
    ,gmv - refund_amount - delivery_cost - vendor_discount as nmv

    -- Revenue metrics
    ,coalesce(commission,0) as commission
    ,coalesce(satisfaction_commission,0) as satisfaction_commission
    ,coalesce(service_fee,0) as service_fee
    ,coalesce(penalty,0) as penalty

from model_sales as ms
left join {{#71419-kazemi-leaf-category}} as lc on lc.cat_leaf_id = ms.category_id

where true
    and persian_year >= 1403
)`;
  }

  /**
   * Build the prepare CTE with cost allocations
   */
  private buildPrepareCTE(): string {
    return `
-- Prepare CTE: Allocate daily costs to individual items
, prepare as (
select
     dictGet('OLAPBasalam.dim_date_dict' , '${this.config.dateType}', gdate_id) as date_type
    ,base.*
    ,count(1) over(partition by gdate_id) as daily_item_count

    -- Allocate daily costs
    ,ads_rev / daily_item_count as ads_rev
    ,vendor_signup_rev / daily_item_count as vendor_signup_rev
    ,cost_of_revenue_cost / daily_item_count as cost_of_revenue_cost
    ,vat_cost / daily_item_count as vat_cost
    ,coalesce(marketing_cost / daily_item_count,0) as marketing_cost
    ,customer_support_cost / daily_item_count as customer_support_cost
    ,support_cost / daily_item_count as support_cost
    ,brand_cost / daily_item_count as brand_cost
    ,g_and_a_cost / daily_item_count as g_and_a_cost
    ,hr_cost / daily_item_count as hr_cost

from base
global join OLAPBasalam.daily_cost_revenue cr on base.gdate = cr.gregorian_date
)`;
  }

  /**
   * Build the filter CTE with optional filters
   */
  private buildFilterCTE(): string {
    const filters: string[] = [];

    if (this.config.filters.catLvl1Title) {
      filters.push(`    and cat_lvl1_title = '${this.config.filters.catLvl1Title}'`);
    } else {
      filters.push(`    [[and cat_lvl1_title = {{cat_lvl1_title}}]]`);
    }

    if (this.config.filters.catLvl2Title) {
      filters.push(`    and cat_lvl2_title = '${this.config.filters.catLvl2Title}'`);
    } else {
      filters.push(`    [[and cat_lvl2_title = {{cat_lvl2_title}}]]`);
    }

    if (this.config.filters.catLvl3Title) {
      filters.push(`    and cat_lvl3_title = '${this.config.filters.catLvl3Title}'`);
    } else {
      filters.push(`    [[and cat_lvl3_title = {{cat_lvl3_title}}]]`);
    }

    if (this.config.filters.customerProvince) {
      filters.push(`    and customer_province_title = '${this.config.filters.customerProvince}'`);
    } else {
      filters.push(`    [[and customer_province_title = {{customer_province_title}}]]`);
    }

    if (this.config.filters.vendorProvince) {
      filters.push(`    and vendor_province_title = '${this.config.filters.vendorProvince}'`);
    } else {
      filters.push(`    [[and vendor_province_title = {{vendor_province_title}}]]`);
    }

    if (this.config.filters.customerTypeId) {
      filters.push(`    and customer_type_id = ${this.config.filters.customerTypeId}`);
    } else {
      filters.push(`    [[and customer_type_id = {{customer_type_id}}]]`);
    }

    if (this.config.filters.vendorTypeId) {
      filters.push(`    and vendor_type_id = ${this.config.filters.vendorTypeId}`);
    } else {
      filters.push(`    [[and vendor_type_id = {{vendor_type_id}}]]`);
    }

    return `
-- Filter CTE: Apply dimension filters
, filter as (
select * from prepare
where true
${filters.join('\n')}
)`;
  }

  /**
   * Build the numbers_dimension CTE
   */
  private buildNumbersDimensionCTE(): string {
    const dimField = this.config.dimensionField;
    const metrics = this.getSelectedMetricsSql();

    return `
-- Numbers by Dimension CTE
,numbers_dimension as (
select
    ${dimField} as dimension
    ,date_type

    -- Volume metrics
    ,count(distinct order_id) as Orders
    ,count(item_id) as Items
    ,round(sum(gmv)/count(distinct order_id),0) as AOV

    -- GMV & NMV
    ,sum(gmv)::float as GMV
    ,-sum(refund_amount)::float as Refunds
    ,-sum(delivery_cost)::float as "Delivery Costs"
    ,-sum(vendor_discount)::float as "Vendor Discounts"
    ,sum(nmv)::float as NMV

    -- Main Revenue
    ,sum(commission + satisfaction_commission)::float as Commission
    ,sum(ads_rev)::float as Ads
    ,Commission + Ads as "Main Revenue"

    -- Cost of Revenue
    ,-sum(cost_of_revenue_cost)::float as "Cost of Revenue"
    ,-sum(basalam_discount) filter (where customer_type_id = 2)::float as "Vochers CRC"
    ,-sum(marketing_cost) filter (where customer_type_id = 2)::float as "General Cost CRC"
    ,"Vochers CRC" + "General Cost CRC" as "Marketing CRC"
    ,-sum(vat_cost)::float as VAT
    ,"Main Revenue" + "Cost of Revenue" + "Marketing CRC" + VAT as PC1

    -- Fees
    ,sum(vendor_signup_rev)::float as "Signup Fee"
    ,sum(penalty)::float as "Penalty Fee"
    ,sum(coalesce(service_fee,0))::float as "Platform Fee"
    ,"Signup Fee" + "Penalty Fee" + "Platform Fee" as "Total Fee"

    -- PC2
    ,-sum(customer_support_cost + support_cost)::float as "Customer Support Costs"
    ,PC1 + "Total Fee" + "Customer Support Costs" as PC2

    -- PC3
    ,-sum(brand_cost)::float as "Brand Costs"
    ,-sum(basalam_discount) filter (where customer_type_id = 1)::float as "Vochers NC"
    ,-sum(marketing_cost) filter (where customer_type_id = 1)::float as "General Cost NC"
    ,"Vochers NC" + "General Cost NC" as "Marketing NC"
    ,PC2 + "Brand Costs" + "Marketing NC" as PC3

    -- EBITDA
    ,-sum(g_and_a_cost)::float as "G&A Costs"
    ,-sum(hr_cost)::float as "HR Costs"
    ,PC3 + "G&A Costs" + "HR Costs" as EBITDA

from filter
group by 1,2
)`;
  }

  /**
   * Build the numbers_total CTE
   */
  private buildNumbersTotalCTE(): string {
    return `
-- Numbers Total CTE (across all dimensions)
,numbers_total as (
select
    'Total' as dimension
    ,date_type

    -- Volume metrics
    ,count(distinct order_id) as Orders
    ,count(item_id) as Items
    ,round(sum(gmv)/count(distinct order_id),0) as AOV

    -- GMV & NMV
    ,sum(gmv)::float as GMV
    ,-sum(refund_amount)::float as Refunds
    ,-sum(delivery_cost)::float as "Delivery Costs"
    ,-sum(vendor_discount)::float as "Vendor Discounts"
    ,sum(nmv)::float as NMV

    -- Main Revenue
    ,sum(commission + satisfaction_commission)::float as Commission
    ,sum(ads_rev)::float as Ads
    ,Commission + Ads as "Main Revenue"

    -- Cost of Revenue
    ,-sum(cost_of_revenue_cost)::float as "Cost of Revenue"
    ,-sum(basalam_discount) filter (where customer_type_id = 2)::float as "Vochers CRC"
    ,-sum(marketing_cost) filter (where customer_type_id = 2)::float as "General Cost CRC"
    ,"Vochers CRC" + "General Cost CRC" as "Marketing CRC"
    ,-sum(vat_cost)::float as VAT
    ,"Main Revenue" + "Cost of Revenue" + "Marketing CRC" + VAT as PC1

    -- Fees
    ,sum(vendor_signup_rev)::float as "Signup Fee"
    ,sum(penalty)::float as "Penalty Fee"
    ,sum(coalesce(service_fee,0))::float as "Platform Fee"
    ,"Signup Fee" + "Penalty Fee" + "Platform Fee" as "Total Fee"

    -- PC2
    ,-sum(customer_support_cost + support_cost)::float as "Customer Support Costs"
    ,PC1 + "Total Fee" + "Customer Support Costs" as PC2

    -- PC3
    ,-sum(brand_cost)::float as "Brand Costs"
    ,-sum(basalam_discount) filter (where customer_type_id = 1)::float as "Vochers NC"
    ,-sum(marketing_cost) filter (where customer_type_id = 1)::float as "General Cost NC"
    ,"Vochers NC" + "General Cost NC" as "Marketing NC"
    ,PC2 + "Brand Costs" + "Marketing NC" as PC3

    -- EBITDA
    ,-sum(g_and_a_cost)::float as "G&A Costs"
    ,-sum(hr_cost)::float as "HR Costs"
    ,PC3 + "G&A Costs" + "HR Costs" as EBITDA

from prepare
group by 1,2
)`;
  }

  /**
   * Build ratios_dimension CTE
   */
  private buildRatiosDimensionCTE(): string {
    return `
-- Ratios by Dimension CTE (percentages of GMV)
, ratios_dimension as (
select
    date_type
    ,dimension
    ,round(100.00 * (Refunds / GMV),2) as Refunds
    ,round(100.00 * ("Delivery Costs" / GMV),2) as "Delivery Costs"
    ,round(100.00 * ("Vendor Discounts" / GMV),2) as "Vendor Discounts"
    ,round(100.00 * (NMV / GMV),2) as NMV
    ,round(100.00 * ("Main Revenue" / GMV),2) as "Main Revenue"
    ,round(100.00 * (Commission / GMV),2) as Commission
    ,round(100.00 * (Ads / GMV),2) as Ads
    ,round(100.00 * ("Cost of Revenue" / GMV),2) as "Cost of Revenue"
    ,round(100.00 * ("Marketing CRC" / GMV),2) as "Marketing CRC"
    ,round(100.00 * ("Vochers CRC" / GMV),2) as "Vochers CRC"
    ,round(100.00 * ("General Cost CRC" / GMV),2) as "General Cost CRC"
    ,round(100.00 * (VAT / GMV),2) as VAT
    ,round(100.00 * (PC1 / GMV),2) as PC1
    ,round(100.00 * ("Total Fee" / GMV),2) as "Total Fee"
    ,round(100.00 * ("Signup Fee" / GMV),2) as "Signup Fee"
    ,round(100.00 * ("Penalty Fee" / GMV),2) as "Penalty Fee"
    ,round(100.00 * ("Platform Fee" / GMV),2) as "Platform Fee"
    ,round(100.00 * ("Customer Support Costs" / GMV),2) as "Customer Support Costs"
    ,round(100.00 * (PC2 / GMV),2) as PC2
    ,round(100.00 * ("Brand Costs" / GMV),2) as "Brand Costs"
    ,round(100.00 * ("Marketing NC" / GMV),2) as "Marketing NC"
    ,round(100.00 * ("Vochers NC" / GMV),2) as "Vochers NC"
    ,round(100.00 * ("General Cost NC" / GMV),2) as "General Cost NC"
    ,round(100.00 * (PC3 / GMV),2) as PC3
    ,round(100.00 * ("G&A Costs" / GMV),2) as "G&A Costs"
    ,round(100.00 * ("HR Costs" / GMV),2) as "HR Costs"
    ,round(100.00 * (EBITDA / GMV),2) as EBITDA
from numbers_dimension
)`;
  }

  /**
   * Build ratios_total CTE
   */
  private buildRatiosTotalCTE(): string {
    return `
-- Ratios Total CTE
, ratios_total as (
select
    date_type
    ,round(100.00 * (Refunds / GMV),2) as Refunds
    ,round(100.00 * ("Delivery Costs" / GMV),2) as "Delivery Costs"
    ,round(100.00 * ("Vendor Discounts" / GMV),2) as "Vendor Discounts"
    ,round(100.00 * (NMV / GMV),2) as NMV
    ,round(100.00 * ("Main Revenue" / GMV),2) as "Main Revenue"
    ,round(100.00 * (Commission / GMV),2) as Commission
    ,round(100.00 * (Ads / GMV),2) as Ads
    ,round(100.00 * ("Cost of Revenue" / GMV),2) as "Cost of Revenue"
    ,round(100.00 * ("Marketing CRC" / GMV),2) as "Marketing CRC"
    ,round(100.00 * ("Vochers CRC" / GMV),2) as "Vochers CRC"
    ,round(100.00 * ("General Cost CRC" / GMV),2) as "General Cost CRC"
    ,round(100.00 * (VAT / GMV),2) as VAT
    ,round(100.00 * (PC1 / GMV),2) as PC1
    ,round(100.00 * ("Total Fee" / GMV),2) as "Total Fee"
    ,round(100.00 * ("Signup Fee" / GMV),2) as "Signup Fee"
    ,round(100.00 * ("Penalty Fee" / GMV),2) as "Penalty Fee"
    ,round(100.00 * ("Platform Fee" / GMV),2) as "Platform Fee"
    ,round(100.00 * ("Customer Support Costs" / GMV),2) as "Customer Support Costs"
    ,round(100.00 * (PC2 / GMV),2) as PC2
    ,round(100.00 * ("Brand Costs" / GMV),2) as "Brand Costs"
    ,round(100.00 * ("Marketing NC" / GMV),2) as "Marketing NC"
    ,round(100.00 * ("Vochers NC" / GMV),2) as "Vochers NC"
    ,round(100.00 * ("General Cost NC" / GMV),2) as "General Cost NC"
    ,round(100.00 * (PC3 / GMV),2) as PC3
    ,round(100.00 * ("G&A Costs" / GMV),2) as "G&A Costs"
    ,round(100.00 * ("HR Costs" / GMV),2) as "HR Costs"
    ,round(100.00 * (EBITDA / GMV),2) as EBITDA
from numbers_total
)`;
  }

  /**
   * Build final CTEs
   */
  private buildFinalCTE(withRatios: boolean, withTotals: boolean): string {
    let parts: string[] = [];

    if (withRatios) {
      parts.push(`
-- Final Dimension (Numbers + Ratios)
,final_dimension as (
    select 'Numbers' as index, * from numbers_dimension
    union all
    select 'Ratio' as index
        ,dimension
        ,date_type
        ,0 as Orders, 0 as Items, 0 as AOV, 0 as GMV
        ,* EXCEPT(date_type, dimension)
    from ratios_dimension
)`);

      if (withTotals) {
        parts.push(`
-- Final Total (Numbers + Ratios)
,final_total as (
    select 'Numbers' as index, 'Total' as dimension, * from numbers_total
    union all
    select 'Ratio' as index, 'Total' as dimension
        ,date_type
        ,0 as Orders, 0 as Items, 0 as AOV, 0 as GMV
        ,* EXCEPT(date_type)
    from ratios_total
)`);
      }
    }

    if (withTotals) {
      parts.push(`
-- Final Union
, final as (
    select * from final_total
    union all
    select * from final_dimension
)`);
    } else {
      parts.push(`
-- Final
, final as (
    select 'Numbers' as index, * from numbers_dimension
)`);
    }

    return parts.join('\n');
  }

  /**
   * Build final SELECT
   */
  private buildFinalSelect(): string {
    return `
-- Final Output
select * from final order by 2,3,1`;
  }

  /**
   * Get date fields based on dateType
   */
  private getDateFields(): { gregorian: string; persian: string } {
    return {
      gregorian: `
    ,dictGet('OLAPBasalam.dim_date_dict' , 'englishyear', purchase_date_id) as gyear
    ,dictGet('OLAPBasalam.dim_date_dict' , 'englishmonthnumber', purchase_date_id) as gmonth`,

      persian: `
    ,dictGet('OLAPBasalam.dim_date_dict' , 'persianyear', purchase_date_id) as jyear
    ,dictGet('OLAPBasalam.dim_date_dict' , 'persianyearmonth', purchase_date_id) as jyearmonth
    ,dictGet('OLAPBasalam.dim_date_dict' , 'persianmonthnumber', purchase_date_id) as jmonth
    ,dictGet('OLAPBasalam.dim_date_dict' , 'persiandate', purchase_date_id) as jdate
    ,dictGet('OLAPBasalam.dim_date_dict' , 'persianyearseason', purchase_date_id) as persianyearseason
    ,dictGet('OLAPBasalam.dim_date_dict' , 'persianseason', purchase_date_id) as persianseason
    ,dictGet('OLAPBasalam.dim_date_dict' , 'persianyearsemester', purchase_date_id) as persianyearsemester
    ,dictGet('OLAPBasalam.dim_date_dict' , 'persiansemester', purchase_date_id) as persiansemester`,
    };
  }

  /**
   * Get selected metrics as SQL
   */
  private getSelectedMetricsSql(): string {
    const selected = this.config.metrics.map((m) => m.id);
    return selected.join(', ');
  }

  /**
   * Build query parameters
   */
  private buildParameters(): Record<string, any> {
    return {
      DateType: this.config.dateType,
      cat_lvl1_title: this.config.filters.catLvl1Title || null,
      cat_lvl2_title: this.config.filters.catLvl2Title || null,
      cat_lvl3_title: this.config.filters.catLvl3Title || null,
      customer_province_title: this.config.filters.customerProvince || null,
      vendor_province_title: this.config.filters.vendorProvince || null,
      customer_type_id: this.config.filters.customerTypeId || null,
      vendor_type_id: this.config.filters.vendorTypeId || null,
    };
  }

  /**
   * Build query description
   */
  private buildDescription(): string {
    const dimName = ALL_DIMENSIONS.find((d) => d.field === this.config.dimensionField)?.name ||
      this.config.dimensionField;
    return `P&L Report by ${dimName}, grouped by ${this.config.dateType}`;
  }

  /**
   * Build a simplified query for drill-down
   */
  buildDrillDownQuery(parentDimension: string, parentValue: string, childDimension: string): BuiltQuery {
    const drillConfig: PnLConfig = {
      ...this.config,
      filters: {
        ...this.config.filters,
        [this.getFilterKey(parentDimension)]: parentValue,
      },
    };

    const builder = new BasalamPnLQueryBuilder(drillConfig);
    return builder.buildQuery({ withRatios: false, withTotals: false });
  }

  /**
   * Get filter key from dimension field
   */
  private getFilterKey(field: string): string {
    const mapping: Record<string, string> = {
      cat_lvl1_title: 'catLvl1Title',
      cat_lvl2_title: 'catLvl2Title',
      cat_lvl3_title: 'catLvl3Title',
      customer_province_title: 'customerProvince',
      vendor_province_title: 'vendorProvince',
      customer_type_id: 'customerTypeId',
      vendor_type_id: 'vendorTypeId',
    };
    return mapping[field] || field;
  }
}

// Import ALL_DIMENSIONS for description
import { ALL_DIMENSIONS } from '../types/basalamPnl';

/**
 * Format a metric value based on its configuration
 */
export function formatBasalamMetric(
  value: number,
  metric: Metric | CalculatedMetric,
  language: 'en' | 'fa' = 'en'
): string {
  if (value === null || value === undefined) return language === 'fa' ? '-' : '-';

  const decimals = metric.decimals ?? 0;

  // Persian number formatting
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const toPersian = (str: string) =>
    str.replace(/\d/g, (d) => persianDigits[parseInt(d)]);

  let formatted: string;

  switch (metric.format) {
    case 'currency':
      // Iranian Rial formatting
      formatted = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(Math.abs(value));

      if (language === 'fa') {
        formatted = toPersian(formatted) + ' ریال';
      } else {
        formatted = (value < 0 ? '-' : '') + 'IRR ' + formatted;
      }
      break;

    case 'percent':
      formatted = value.toFixed(decimals) + '%';
      if (language === 'fa') {
        formatted = toPersian(formatted);
      }
      break;

    case 'integer':
      formatted = Math.round(value).toLocaleString('en-US');
      if (language === 'fa') {
        formatted = toPersian(formatted);
      }
      break;

    case 'number':
    default:
      formatted = value.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      if (language === 'fa') {
        formatted = toPersian(formatted);
      }
  }

  return formatted;
}

/**
 * Calculate variance between current and previous period
 */
export function calculateVariance(
  current: number,
  previous: number
): { value: number; percent: number; formatted: string } {
  const value = current - previous;
  const percent = previous !== 0 ? (value / Math.abs(previous)) * 100 : 0;

  return {
    value,
    percent,
    formatted: `${value >= 0 ? '+' : ''}${percent.toFixed(1)}%`,
  };
}
