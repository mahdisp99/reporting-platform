import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchFilterOptions, fetchPnLReport } from '../../api/pnlApi';
import {
  CALCULATED_PNL_METRICS,
  GEOGRAPHY_HIERARCHY,
  PRODUCT_HIERARCHY,
  STANDARD_PNL_METRICS,
  TIME_HIERARCHY,
} from '../../types/pnl';
import type {
  CalculatedMetric,
  Dimension,
  Filter,
  Metric,
  PnLConfig,
  PnLReport as PnLReportType,
  PnLRow,
} from '../../types/pnl';
import { DimensionSelector } from '../common/DimensionSelector';
import { FilterPanel } from '../common/FilterPanel';
import { MetricSelector } from '../common/MetricSelector';
import { PnLSummary, PnLTable, PnLToolbar } from './PnLTable';

const ALL_DIMENSIONS: Dimension[] = [
  ...PRODUCT_HIERARCHY,
  ...GEOGRAPHY_HIERARCHY,
  ...TIME_HIERARCHY,
];

const ALL_METRICS: (Metric | CalculatedMetric)[] = [
  ...STANDARD_PNL_METRICS,
  ...CALCULATED_PNL_METRICS,
];

const DEFAULT_CONFIG: PnLConfig = {
  rowDimensions: [PRODUCT_HIERARCHY[0]],
  columnDimensions: [TIME_HIERARCHY[1]],
  metrics: [
    STANDARD_PNL_METRICS[0],
    STANDARD_PNL_METRICS[2],
    CALCULATED_PNL_METRICS[0],
    CALCULATED_PNL_METRICS[1],
  ],
  filters: [],
  comparison: {
    enabled: false,
    type: 'yoy',
  },
  options: {
    showTotals: true,
    showSubtotals: false,
    expandAll: false,
    collapseLevel: 0,
    currencyCode: 'IRR',
  },
};

export const PnLReport: React.FC = () => {
  const [config, setConfig] = useState<PnLConfig>(DEFAULT_CONFIG);
  const [report, setReport] = useState<PnLReportType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<Record<string, Array<string | number>>>({});
  const requestCounter = useRef(0);

  const loadFilterOptions = useCallback(async () => {
    try {
      const options = await fetchFilterOptions();
      setFilterOptions(options);
    } catch (loadError) {
      console.error(loadError);
      setError('Failed to load filter options from backend.');
    }
  }, []);

  const fetchData = useCallback(async () => {
    const requestId = ++requestCounter.current;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPnLReport(config);
      if (requestId !== requestCounter.current) return;
      setReport(data);
    } catch (fetchError) {
      console.error(fetchError);
      if (requestId !== requestCounter.current) return;
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      setError(message);
      setReport(null);
    } finally {
      if (requestId === requestCounter.current) {
        setLoading(false);
      }
    }
  }, [config]);

  useEffect(() => {
    void loadFilterOptions();
  }, [loadFilterOptions]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const updateRowDimensions = useCallback((dimensions: Dimension[]) => {
    setConfig((previous) => ({ ...previous, rowDimensions: dimensions }));
  }, []);

  const updateColumnDimensions = useCallback((dimensions: Dimension[]) => {
    setConfig((previous) => ({ ...previous, columnDimensions: dimensions }));
  }, []);

  const updateMetrics = useCallback((metrics: (Metric | CalculatedMetric)[]) => {
    setConfig((previous) => ({ ...previous, metrics }));
  }, []);

  const updateFilters = useCallback((filters: Filter[]) => {
    setConfig((previous) => ({ ...previous, filters }));
  }, []);

  const handleDrillDown = useCallback((_row: PnLRow, _dimension: Dimension) => {
    // Backend currently returns flat grouped rows; drill-down can be added later.
  }, []);

  const handleCollapse = useCallback((_rowKey: string) => {
    // No-op for flat grouped rows.
  }, []);

  const handleExport = useCallback((format: 'csv' | 'excel' | 'pdf') => {
    if (!report) return;
    if (format !== 'csv') {
      alert(`${format.toUpperCase()} export is not implemented yet.`);
      return;
    }
    exportToCSV(report);
  }, [report]);

  const visibleReport = useMemo(() => report, [report]);

  return (
    <div className="pnl-report">
      <header className="report-header">
        <h1>Profit and Loss Report</h1>
        <p className="report-subtitle">Connected to ClickHouse via backend API</p>
      </header>

      <div className="report-layout">
        <aside className="config-panel">
          <div className="config-section">
            <h3>Configuration</h3>

            <DimensionSelector
              title="Row Dimensions"
              availableDimensions={ALL_DIMENSIONS}
              selectedDimensions={config.rowDimensions}
              onChange={updateRowDimensions}
              maxSelections={4}
              allowHierarchy={true}
            />

            <DimensionSelector
              title="Column Dimension"
              availableDimensions={TIME_HIERARCHY}
              selectedDimensions={config.columnDimensions}
              onChange={updateColumnDimensions}
              maxSelections={1}
              allowHierarchy={false}
            />

            <MetricSelector
              title="Metrics"
              availableMetrics={ALL_METRICS}
              selectedMetrics={config.metrics}
              onChange={updateMetrics}
              maxSelections={10}
            />

            <FilterPanel
              dimensions={ALL_DIMENSIONS}
              filters={config.filters}
              onChange={updateFilters}
              filterOptions={filterOptions}
            />

            <div className="comparison-toggle">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={Boolean(config.comparison?.enabled)}
                  onChange={(event) =>
                    setConfig((previous) => ({
                      ...previous,
                      comparison: {
                        enabled: event.target.checked,
                        type: previous.comparison?.type || 'yoy',
                        previousPeriodOffset: previous.comparison?.previousPeriodOffset,
                      },
                    }))
                  }
                />
                Enable comparison
              </label>
            </div>
          </div>
        </aside>

        <main className="report-content">
          <PnLToolbar
            onRefresh={() => {
              void fetchData();
            }}
            onExport={handleExport}
            onSave={() => console.log('Save config', config)}
            isLoading={loading}
          />

          {error && <div className="report-error">{error}</div>}

          {visibleReport && <PnLSummary report={visibleReport} />}

          {visibleReport && (
            <PnLTable
              report={visibleReport}
              onDrillDown={handleDrillDown}
              onCollapse={handleCollapse}
              loading={loading}
            />
          )}

          <div className="report-footer">
            {visibleReport?.metadata && (
              <span className="meta">
                Generated: {new Date(visibleReport.metadata.generatedAt).toLocaleString()}
                {visibleReport.metadata.totalRows > 0 &&
                  ` | ${visibleReport.metadata.totalRows.toLocaleString()} rows`}
              </span>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

function exportToCSV(report: PnLReportType) {
  let csv = 'data:text/csv;charset=utf-8,';
  const rowDimensionHeaders = report.config.rowDimensions.map((dimension) => dimension.name).join(',');
  const metricHeaders = report.columns
    .flatMap((column) => report.config.metrics.map((metric) => `${column.title} - ${metric.name}`))
    .join(',');
  csv += `${rowDimensionHeaders},${metricHeaders}\n`;

  for (const row of report.rows) {
    const dimensionValues = report.config.rowDimensions
      .map((dimension) => row.dimensions[dimension.id] ?? '')
      .join(',');
    const metricValues = report.columns
      .flatMap((column) =>
        report.config.metrics.map((metric) => {
          const cell = row.cells[`${column.key}_${metric.id}`];
          return cell ? cell.value : '';
        })
      )
      .join(',');
    csv += `${dimensionValues},${metricValues}\n`;
  }

  const encodedUri = encodeURI(csv);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', 'pnl_report.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default PnLReport;
