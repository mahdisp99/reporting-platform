import React, { useState, useCallback, useEffect, useMemo } from 'react';
import type {
  PnLConfig,
  PnLReport as PnLReportType,
  PnLRow,
  Dimension,
  Filter,
  Metric,
  CalculatedMetric,
} from '../../types/pnl';
import {
  PRODUCT_HIERARCHY,
  GEOGRAPHY_HIERARCHY,
  TIME_HIERARCHY,
  STANDARD_PNL_METRICS,
  CALCULATED_PNL_METRICS,
} from '../../types/pnl';
import { PnLQueryBuilder, formatMetricValue, calculateVariance } from '../../utils/pnlQueryBuilder';
import { DimensionSelector } from '../common/DimensionSelector';
import { MetricSelector } from '../common/MetricSelector';
import { FilterPanel } from '../common/FilterPanel';
import { PnLTable, PnLSummary, PnLToolbar } from './PnLTable';

// Combine all available dimensions
const ALL_DIMENSIONS: Dimension[] = [
  ...PRODUCT_HIERARCHY,
  ...GEOGRAPHY_HIERARCHY,
  ...TIME_HIERARCHY,
];

// Combine all available metrics
const ALL_METRICS: (Metric | CalculatedMetric)[] = [...STANDARD_PNL_METRICS, ...CALCULATED_PNL_METRICS];

// Default configuration
const DEFAULT_CONFIG: PnLConfig = {
  rowDimensions: [PRODUCT_HIERARCHY[0]], // Category
  columnDimensions: [TIME_HIERARCHY[1]], // Quarter
  metrics: [
    STANDARD_PNL_METRICS[0], // Revenue
    STANDARD_PNL_METRICS[1], // Cost of Goods
    CALCULATED_PNL_METRICS[0], // Gross Profit
    CALCULATED_PNL_METRICS[1], // Gross Margin
  ],
  filters: [],
  comparison: {
    enabled: true,
    type: 'yoy',
  },
  options: {
    showTotals: true,
    showSubtotals: true,
    expandAll: false,
    collapseLevel: 0,
    currencyCode: 'USD',
  },
};

export const PnLReport: React.FC = () => {
  const [config, setConfig] = useState<PnLConfig>(DEFAULT_CONFIG);
  const [report, setReport] = useState<PnLReportType | null>(null);
  const [loading, setLoading] = useState(false);
  const [drillDownData, setDrillDownData] = useState<Record<string, PnLRow[]>>({});

  // Generate query based on current config
  const queryBuilder = useMemo(() => new PnLQueryBuilder(config), [config]);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const query = queryBuilder.buildQuery();
      console.log('Generated SQL:', query);

      // Simulate API call - replace with actual API
      // const response = await fetch('/api/pnl', {
      //   method: 'POST',
      //   body: JSON.stringify({ query, config }),
      // });
      // const data = await response.json();

      // Mock data for demonstration
      const mockData = generateMockData(config);
      setReport(mockData);
    } catch (error) {
      console.error('Failed to fetch P&L data:', error);
    } finally {
      setLoading(false);
    }
  }, [config, queryBuilder]);

  // Fetch on mount and config change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle drill-down
  const handleDrillDown = useCallback(
    async (row: PnLRow, dimension: Dimension) => {
      const rowKey = row.dimensions.rowKey as string;

      // Check if already loaded
      if (drillDownData[rowKey]) {
        return;
      }

      try {
        // Build drill-down query
        const query = queryBuilder.buildDrillDownQuery(row.dimensions, dimension);
        console.log('Drill-down SQL:', query);

        // Simulate API call
        // const response = await fetch('/api/pnl/drilldown', {
        //   method: 'POST',
        //   body: JSON.stringify({ query, parentRow: row, dimension }),
        // });
        // const data = await response.json();

        // Mock drill-down data
        const mockChildren = generateMockDrillDownData(row, dimension, config);
        setDrillDownData((prev) => ({ ...prev, [rowKey]: mockChildren }));
      } catch (error) {
        console.error('Failed to fetch drill-down data:', error);
      }
    },
    [config, queryBuilder, drillDownData]
  );

  // Handle collapse
  const handleCollapse = useCallback((rowKey: string) => {
    // Optional: Clean up drill-down data when collapsed
    // setDrillDownData((prev) => {
    //   const next = { ...prev };
    //   delete next[rowKey];
    //   return next;
    // });
  }, []);

  // Handle export
  const handleExport = useCallback((format: 'csv' | 'excel' | 'pdf') => {
    if (!report) return;

    switch (format) {
      case 'csv':
        exportToCSV(report);
        break;
      case 'excel':
        exportToExcel(report);
        break;
      case 'pdf':
        exportToPDF(report);
        break;
    }
  }, [report]);

  // Configuration updaters
  const updateRowDimensions = useCallback((dims: Dimension[]) => {
    setConfig((prev) => ({ ...prev, rowDimensions: dims }));
  }, []);

  const updateColumnDimensions = useCallback((dims: Dimension[]) => {
    setConfig((prev) => ({ ...prev, columnDimensions: dims }));
  }, []);

  const updateMetrics = useCallback((metrics: (Metric | CalculatedMetric)[]) => {
    setConfig((prev) => ({ ...prev, metrics }));
  }, []);

  const updateFilters = useCallback((filters: Filter[]) => {
    setConfig((prev) => ({ ...prev, filters }));
  }, []);

  return (
    <div className="pnl-report">
      <header className="report-header">
        <h1>Profit & Loss Report</h1>
        <p className="report-subtitle">
          Analyze revenue, costs, and profitability across dimensions
        </p>
      </header>

      <div className="report-layout">
        {/* Configuration Panel */}
        <aside className="config-panel">
          <div className="config-section">
            <h3>Configuration</h3>

            <DimensionSelector
              title="Row Dimensions (Drill-down)"
              availableDimensions={ALL_DIMENSIONS}
              selectedDimensions={config.rowDimensions}
              onChange={updateRowDimensions}
              maxSelections={4}
              allowHierarchy={true}
            />

            <DimensionSelector
              title="Column Dimensions (Periods)"
              availableDimensions={TIME_HIERARCHY}
              selectedDimensions={config.columnDimensions}
              onChange={updateColumnDimensions}
              maxSelections={2}
              allowHierarchy={false}
            />

            <MetricSelector
              title="Metrics"
              availableMetrics={ALL_METRICS}
              selectedMetrics={config.metrics}
              onChange={updateMetrics}
              maxSelections={8}
            />

            <FilterPanel
              dimensions={ALL_DIMENSIONS}
              filters={config.filters}
              onChange={updateFilters}
            />

            <div className="comparison-toggle">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={config.comparison?.enabled}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      comparison: {
                        ...prev.comparison,
                        enabled: e.target.checked,
                      },
                    }))
                  }
                />
                Enable YoY Comparison
              </label>
            </div>
          </div>
        </aside>

        {/* Report Display */}
        <main className="report-content">
          <PnLToolbar
            onRefresh={fetchData}
            onExport={handleExport}
            onSave={() => console.log('Save report config', config)}
            isLoading={loading}
          />

          {report && <PnLSummary report={report} />}

          {report && (
            <PnLTable
              report={report}
              onDrillDown={handleDrillDown}
              onCollapse={handleCollapse}
              loading={loading}
            />
          )}

          <div className="report-footer">
            {report?.metadata && (
              <span className="meta">
                Generated: {new Date(report.metadata.generatedAt).toLocaleString()}
                {report.metadata.totalRows > 0 && ` • ${report.metadata.totalRows.toLocaleString()} rows`}
              </span>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

// Mock data generators
function generateMockData(config: PnLConfig): PnLReportType {
  const now = new Date().toISOString();

  const rows: PnLRow[] = [
    {
      dimensions: { rowKey: 'row-1', category_l1: 'Electronics', category_l2: '', category_l3: '' },
      level: 0,
      isExpandable: true,
      isExpanded: false,
      cells: {
        'q1_revenue': { value: 150000, formattedValue: '$150,000', isCalculated: false, isTotal: false, variance: 15000, variancePercent: 10 },
        'q1_cost_of_goods': { value: 90000, formattedValue: '$90,000', isCalculated: false, isTotal: false },
        'q1_gross_profit': { value: 60000, formattedValue: '$60,000', isCalculated: true, isTotal: false },
        'q1_gross_margin': { value: 40, formattedValue: '40.00%', isCalculated: true, isTotal: false },
        'q2_revenue': { value: 175000, formattedValue: '$175,000', isCalculated: false, isTotal: false, variance: 25000, variancePercent: 14.3 },
        'q2_cost_of_goods': { value: 105000, formattedValue: '$105,000', isCalculated: false, isTotal: false },
        'q2_gross_profit': { value: 70000, formattedValue: '$70,000', isCalculated: true, isTotal: false },
        'q2_gross_margin': { value: 40, formattedValue: '40.00%', isCalculated: true, isTotal: false },
        'total_revenue': { value: 325000, formattedValue: '$325,000', isCalculated: false, isTotal: true },
        'total_cost_of_goods': { value: 195000, formattedValue: '$195,000', isCalculated: false, isTotal: true },
        'total_gross_profit': { value: 130000, formattedValue: '$130,000', isCalculated: true, isTotal: true },
        'total_gross_margin': { value: 40, formattedValue: '40.00%', isCalculated: true, isTotal: true },
      },
    },
    {
      dimensions: { rowKey: 'row-2', category_l1: 'Clothing', category_l2: '', category_l3: '' },
      level: 0,
      isExpandable: true,
      isExpanded: false,
      cells: {
        'q1_revenue': { value: 80000, formattedValue: '$80,000', isCalculated: false, isTotal: false, variance: -5000, variancePercent: -5.9 },
        'q1_cost_of_goods': { value: 40000, formattedValue: '$40,000', isCalculated: false, isTotal: false },
        'q1_gross_profit': { value: 40000, formattedValue: '$40,000', isCalculated: true, isTotal: false },
        'q1_gross_margin': { value: 50, formattedValue: '50.00%', isCalculated: true, isTotal: false },
        'q2_revenue': { value: 95000, formattedValue: '$95,000', isCalculated: false, isTotal: false, variance: 15000, variancePercent: 15.8 },
        'q2_cost_of_goods': { value: 47500, formattedValue: '$47,500', isCalculated: false, isTotal: false },
        'q2_gross_profit': { value: 47500, formattedValue: '$47,500', isCalculated: true, isTotal: false },
        'q2_gross_margin': { value: 50, formattedValue: '50.00%', isCalculated: true, isTotal: false },
        'total_revenue': { value: 175000, formattedValue: '$175,000', isCalculated: false, isTotal: true },
        'total_cost_of_goods': { value: 87500, formattedValue: '$87,500', isCalculated: false, isTotal: true },
        'total_gross_profit': { value: 87500, formattedValue: '$87,500', isCalculated: true, isTotal: true },
        'total_gross_margin': { value: 50, formattedValue: '50.00%', isCalculated: true, isTotal: true },
      },
    },
    {
      dimensions: { rowKey: 'row-total', category_l1: 'Total', category_l2: '', category_l3: '' },
      level: 0,
      isExpandable: false,
      isExpanded: false,
      isTotal: true,
      cells: {
        'q1_revenue': { value: 230000, formattedValue: '$230,000', isCalculated: false, isTotal: true },
        'q1_cost_of_goods': { value: 130000, formattedValue: '$130,000', isCalculated: false, isTotal: true },
        'q1_gross_profit': { value: 100000, formattedValue: '$100,000', isCalculated: true, isTotal: true },
        'q1_gross_margin': { value: 43.48, formattedValue: '43.48%', isCalculated: true, isTotal: true },
        'q2_revenue': { value: 270000, formattedValue: '$270,000', isCalculated: false, isTotal: true },
        'q2_cost_of_goods': { value: 152500, formattedValue: '$152,500', isCalculated: false, isTotal: true },
        'q2_gross_profit': { value: 117500, formattedValue: '$117,500', isCalculated: true, isTotal: true },
        'q2_gross_margin': { value: 43.52, formattedValue: '43.52%', isCalculated: true, isTotal: true },
        'total_revenue': { value: 500000, formattedValue: '$500,000', isCalculated: false, isTotal: true },
        'total_cost_of_goods': { value: 282500, formattedValue: '$282,500', isCalculated: false, isTotal: true },
        'total_gross_profit': { value: 217500, formattedValue: '$217,500', isCalculated: true, isTotal: true },
        'total_gross_margin': { value: 43.5, formattedValue: '43.50%', isCalculated: true, isTotal: true },
      },
    },
  ];

  const columns = [
    { key: 'q1', title: 'Q1 2024', dimensionValues: { quarter: 1 }, isTotal: false },
    { key: 'q2', title: 'Q2 2024', dimensionValues: { quarter: 2 }, isTotal: false },
    { key: 'total', title: 'Total', dimensionValues: {}, isTotal: true },
  ];

  return {
    config,
    rows,
    columns,
    metadata: {
      generatedAt: now,
      periodStart: '2024-01-01',
      periodEnd: '2024-06-30',
      totalRows: rows.length,
      currencyCode: 'USD',
    },
  };
}

function generateMockDrillDownData(parentRow: PnLRow, dimension: Dimension, config: PnLConfig): PnLRow[] {
  const category = parentRow.dimensions.category_l1 as string;

  if (dimension.id === 'category_l2') {
    if (category === 'Electronics') {
      return [
        {
          dimensions: { rowKey: `${parentRow.dimensions.rowKey}-1`, category_l1: category, category_l2: 'Phones', category_l3: '' },
          level: 1,
          isExpandable: true,
          isExpanded: false,
          cells: generateMockCells(config, 80000, 48000),
        },
        {
          dimensions: { rowKey: `${parentRow.dimensions.rowKey}-2`, category_l1: category, category_l2: 'Laptops', category_l3: '' },
          level: 1,
          isExpandable: true,
          isExpanded: false,
          cells: generateMockCells(config, 70000, 42000),
        },
      ];
    } else if (category === 'Clothing') {
      return [
        {
          dimensions: { rowKey: `${parentRow.dimensions.rowKey}-1`, category_l1: category, category_l2: 'Shirts', category_l3: '' },
          level: 1,
          isExpandable: true,
          isExpanded: false,
          cells: generateMockCells(config, 40000, 20000),
        },
        {
          dimensions: { rowKey: `${parentRow.dimensions.rowKey}-2`, category_l1: category, category_l2: 'Pants', category_l3: '' },
          level: 1,
          isExpandable: true,
          isExpanded: false,
          cells: generateMockCells(config, 40000, 20000),
        },
      ];
    }
  }

  return [];
}

function generateMockCells(config: PnLConfig, revenue: number, cost: number): Record<string, any> {
  const cells: Record<string, any> = {};

  for (const col of ['q1', 'q2', 'total']) {
    for (const metric of config.metrics) {
      const key = `${col}_${metric.id}`;

      if (metric.id === 'revenue') {
        cells[key] = { value: revenue, formattedValue: `$${revenue.toLocaleString()}`, isCalculated: false, isTotal: col === 'total' };
      } else if (metric.id === 'cost_of_goods') {
        cells[key] = { value: cost, formattedValue: `$${cost.toLocaleString()}`, isCalculated: false, isTotal: col === 'total' };
      } else if (metric.id === 'gross_profit') {
        cells[key] = { value: revenue - cost, formattedValue: `$${(revenue - cost).toLocaleString()}`, isCalculated: true, isTotal: col === 'total' };
      } else if (metric.id === 'gross_margin') {
        const margin = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0;
        cells[key] = { value: margin, formattedValue: `${margin.toFixed(2)}%`, isCalculated: true, isTotal: col === 'total' };
      }
    }
  }

  return cells;
}

// Export functions
function exportToCSV(report: PnLReportType) {
  let csv = 'data:text/csv;charset=utf-8,';

  // Headers
  const rowDimNames = report.config.rowDimensions.map((d) => d.name).join(',');
  const metricHeaders = report.columns
    .flatMap((col) => report.config.metrics.map((m) => `${col.title} - ${m.name}`))
    .join(',');
  csv += `${rowDimNames},${metricHeaders}\n`;

  // Rows
  for (const row of report.rows) {
    const dimValues = report.config.rowDimensions.map((d) => row.dimensions[d.id]).join(',');
    const metricValues = report.columns
      .flatMap((col) =>
        report.config.metrics.map((m) => {
          const cell = row.cells[`${col.key}_${m.id}`];
          return cell ? cell.value : '';
        })
      )
      .join(',');
    csv += `${dimValues},${metricValues}\n`;
  }

  const encodedUri = encodeURI(csv);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', 'pnl_report.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportToExcel(report: PnLReportType) {
  // Use a library like xlsx or sheetjs for proper Excel export
  console.log('Export to Excel:', report);
  alert('Excel export - integrate with xlsx library');
}

function exportToPDF(report: PnLReportType) {
  // Use a library like jspdf or puppeteer for PDF export
  console.log('Export to PDF:', report);
  alert('PDF export - integrate with jspdf library');
}

export default PnLReport;
