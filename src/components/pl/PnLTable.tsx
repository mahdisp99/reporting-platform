import React, { useState, useCallback } from 'react';
import type { PnLReport, PnLRow, PnLColumn, Metric, CalculatedMetric, Dimension } from '../../types/pnl';
import { formatMetricValue } from '../../utils/pnlQueryBuilder';

interface PnLTableProps {
  report: PnLReport;
  onDrillDown: (row: PnLRow, dimension: Dimension) => void;
  onCollapse: (rowKey: string) => void;
  loading?: boolean;
}

export const PnLTable: React.FC<PnLTableProps> = ({
  report,
  onDrillDown,
  onCollapse,
  loading = false,
}) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((row: PnLRow) => {
    if (!row.isExpandable) return;

    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(row.dimensions.rowKey as string)) {
        next.delete(row.dimensions.rowKey as string);
        onCollapse(row.dimensions.rowKey as string);
      } else {
        next.add(row.dimensions.rowKey as string);
        // Find next dimension level for drill-down
        const currentLevel = row.level;
        const nextDimension = report.config.rowDimensions.find(
          (d) => d.level === currentLevel + 1
        );
        if (nextDimension) {
          onDrillDown(row, nextDimension);
        }
      }
      return next;
    });
  }, [onDrillDown, onCollapse, report.config.rowDimensions]);

  const getIndentStyle = (level: number): React.CSSProperties => ({
    paddingLeft: `${level * 24 + 12}px`,
  });

  const renderCell = (cell: PnLRow['cells'][string], metric: Metric | CalculatedMetric) => {
    if (!cell) return <span className="cell-empty">-</span>;

    const isNegative = (cell.value ?? 0) < 0;
    const isVarianceNegative = (cell.variance ?? 0) < 0;

    return (
      <div className="cell-content">
        <span className={`cell-value ${isNegative ? 'negative' : ''}`}>
          {cell.formattedValue}
        </span>
        {cell.variance !== undefined && report.config.comparison?.enabled && (
          <span
            className={`cell-variance ${
              isVarianceNegative ? 'negative' : 'positive'
            }`}
          >
            {cell.variance > 0 ? '+' : ''}
            {cell.variancePercent?.toFixed(1)}%
          </span>
        )}
      </div>
    );
  };

  const renderHeader = () => {
    const rowDimensions = report.config.rowDimensions;
    const metrics = report.config.metrics;

    return (
      <thead>
        {/* Top header row - Dimension names */}
        <tr className="header-row">
          <th
            className="dimension-header"
            colSpan={rowDimensions.length}
          >
            {rowDimensions.map((d) => d.name).join(' / ')}
          </th>
          {report.columns.map((col) => (
            <th
              key={col.key}
              className={`metric-header ${col.isTotal ? 'total' : ''}`}
              colSpan={metrics.length}
            >
              {col.title}
            </th>
          ))}
        </tr>

        {/* Second header row - Metric names */}
        <tr className="header-row metrics">
          {rowDimensions.map((dim) => (
            <th key={dim.id} className="sub-header dimension">
              {dim.name}
            </th>
          ))}
          {report.columns.map((col) =>
            metrics.map((metric) => (
              <th
                key={`${col.key}-${metric.id}`}
                className={`sub-header metric ${col.isTotal ? 'total' : ''}`}
              >
                {metric.name}
              </th>
            ))
          )}
        </tr>
      </thead>
    );
  };

  const renderRow = (row: PnLRow) => {
    const isExpanded = expandedRows.has(row.dimensions.rowKey as string);
    const rowDimensions = report.config.rowDimensions;
    const metrics = report.config.metrics;

    return (
      <React.Fragment key={row.dimensions.rowKey as string}>
        <tr
          className={`data-row ${row.isTotal ? 'total' : ''} ${
            row.isSubtotal ? 'subtotal' : ''
          }`}
        >
          {/* Dimension cells */}
          {rowDimensions.map((dim, idx) => {
            const value = row.dimensions[dim.id];
            const isFirstColumn = idx === 0;

            return (
              <td
                key={dim.id}
                className="dimension-cell"
                style={isFirstColumn ? getIndentStyle(row.level) : undefined}
              >
                {isFirstColumn && row.isExpandable && (
                  <button
                    type="button"
                    className="expand-btn"
                    onClick={() => toggleExpand(row)}
                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isExpanded ? '▼' : '▶'}
                  </button>
                )}
                <span className="dimension-value">{value}</span>
              </td>
            );
          })}

          {/* Metric cells */}
          {report.columns.map((col) =>
            metrics.map((metric) => {
              const cellKey = `${col.key}_${metric.id}`;
              const cell = row.cells[cellKey];

              return (
                <td
                  key={cellKey}
                  className={`metric-cell ${col.isTotal ? 'total' : ''}`}
                >
                  {cell ? renderCell(cell, metric) : '-'}
                </td>
              );
            })
          )}
        </tr>

        {/* Child rows if expanded */}
        {isExpanded &&
          row.children?.map((childRow) => renderRow(childRow as unknown as PnLRow))}
      </React.Fragment>
    );
  };

  if (loading) {
    return (
      <div className="pnl-table loading">
        <div className="loading-spinner">Loading P&L data...</div>
      </div>
    );
  }

  if (!report.rows.length) {
    return (
      <div className="pnl-table empty">
        <p>No data available. Adjust your filters or dimensions.</p>
      </div>
    );
  }

  return (
    <div className="pnl-table-container">
      <table className="pnl-table">
        {renderHeader()}
        <tbody>{report.rows.map((row) => renderRow(row))}</tbody>
      </table>
    </div>
  );
};

// Sub-components for the table
export const PnLSummary: React.FC<{
  report: PnLReport;
}> = ({ report }) => {
  const totalRow = report.rows.find((r) => r.isTotal);

  if (!totalRow) return null;

  return (
    <div className="pnl-summary">
      <h3>P&L Summary</h3>
      <div className="summary-grid">
        {report.config.metrics.map((metric) => {
          const totalCell = totalRow.cells[`total_${metric.id}`];
          if (!totalCell) return null;

          return (
            <div key={metric.id} className="summary-item">
              <span className="summary-label">{metric.name}</span>
              <span
                className={`summary-value ${
                  (totalCell.value ?? 0) < 0 ? 'negative' : ''
                }`}
              >
                {totalCell.formattedValue}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const PnLToolbar: React.FC<{
  onRefresh: () => void;
  onExport: (format: 'csv' | 'excel' | 'pdf') => void;
  onSave: () => void;
  isLoading?: boolean;
}> = ({ onRefresh, onExport, onSave, isLoading }) => {
  return (
    <div className="pnl-toolbar">
      <div className="toolbar-left">
        <button
          type="button"
          className="btn-refresh"
          onClick={onRefresh}
          disabled={isLoading}
        >
          {isLoading ? '⟳' : '↻'} Refresh
        </button>
        <button type="button" className="btn-save" onClick={onSave}>
          💾 Save
        </button>
      </div>
      <div className="toolbar-right">
        <span className="export-label">Export:</span>
        <button
          type="button"
          className="btn-export"
          onClick={() => onExport('csv')}
        >
          CSV
        </button>
        <button
          type="button"
          className="btn-export"
          onClick={() => onExport('excel')}
        >
          Excel
        </button>
        <button
          type="button"
          className="btn-export"
          onClick={() => onExport('pdf')}
        >
          PDF
        </button>
      </div>
    </div>
  );
};
