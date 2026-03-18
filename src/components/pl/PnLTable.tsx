import React, { useCallback, useState } from 'react';
import type { Dimension, PnLReport, PnLRow } from '../../types/pnl';

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

  const toggleExpand = useCallback(
    (row: PnLRow) => {
      if (!row.isExpandable) return;
      const rowKey = String(row.dimensions.rowKey || '');
      if (!rowKey) return;

      setExpandedRows((previous) => {
        const next = new Set(previous);
        if (next.has(rowKey)) {
          next.delete(rowKey);
          onCollapse(rowKey);
        } else {
          next.add(rowKey);
          const currentLevel = row.level;
          const nextDimension = report.config.rowDimensions.find((dimension) => dimension.level === currentLevel + 1);
          if (nextDimension) {
            onDrillDown(row, nextDimension);
          }
        }
        return next;
      });
    },
    [onCollapse, onDrillDown, report.config.rowDimensions]
  );

  const getIndentStyle = (level: number): React.CSSProperties => ({
    paddingLeft: `${level * 24 + 12}px`,
  });

  const renderCell = (cell: PnLRow['cells'][string]) => {
    if (!cell) return <span className="cell-empty">-</span>;
    const isNegative = (cell.value ?? 0) < 0;
    const isVarianceNegative = (cell.variance ?? 0) < 0;

    return (
      <div className="cell-content">
        <span className={`cell-value ${isNegative ? 'negative' : ''}`}>{cell.formattedValue}</span>
        {cell.variance !== undefined && report.config.comparison?.enabled && (
          <span className={`cell-variance ${isVarianceNegative ? 'negative' : 'positive'}`}>
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
        <tr className="header-row">
          <th className="dimension-header" colSpan={rowDimensions.length}>
            {rowDimensions.map((dimension) => dimension.name).join(' / ')}
          </th>
          {report.columns.map((column) => (
            <th key={column.key} className={`metric-header ${column.isTotal ? 'total' : ''}`} colSpan={metrics.length}>
              {column.title}
            </th>
          ))}
        </tr>
        <tr className="header-row metrics">
          {rowDimensions.map((dimension) => (
            <th key={dimension.id} className="sub-header dimension">
              {dimension.name}
            </th>
          ))}
          {report.columns.map((column) =>
            metrics.map((metric) => (
              <th key={`${column.key}-${metric.id}`} className={`sub-header metric ${column.isTotal ? 'total' : ''}`}>
                {metric.name}
              </th>
            ))
          )}
        </tr>
      </thead>
    );
  };

  const renderRow = (row: PnLRow) => {
    const rowKey = String(row.dimensions.rowKey || '');
    const isExpanded = expandedRows.has(rowKey);
    const rowDimensions = report.config.rowDimensions;
    const metrics = report.config.metrics;

    return (
      <React.Fragment key={rowKey}>
        <tr className={`data-row ${row.isTotal ? 'total' : ''} ${row.isSubtotal ? 'subtotal' : ''}`}>
          {rowDimensions.map((dimension, index) => {
            const value = row.dimensions[dimension.id];
            const isFirstColumn = index === 0;

            return (
              <td
                key={`${rowKey}-${dimension.id}`}
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
                    {isExpanded ? 'v' : '>'}
                  </button>
                )}
                <span className="dimension-value">{value}</span>
              </td>
            );
          })}

          {report.columns.map((column) =>
            metrics.map((metric) => {
              const cellKey = `${column.key}_${metric.id}`;
              const cell = row.cells[cellKey];
              return (
                <td key={`${rowKey}-${cellKey}`} className={`metric-cell ${column.isTotal ? 'total' : ''}`}>
                  {cell ? renderCell(cell) : '-'}
                </td>
              );
            })
          )}
        </tr>

        {isExpanded &&
          row.children?.map((childRow) => {
            return renderRow(childRow as unknown as PnLRow);
          })}
      </React.Fragment>
    );
  };

  if (loading) {
    return (
      <div className="pnl-table loading">
        <div className="loading-spinner">Loading PnL data...</div>
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

export const PnLSummary: React.FC<{ report: PnLReport }> = ({ report }) => {
  const totalRow = report.rows.find((row) => row.isTotal);
  if (!totalRow) return null;

  return (
    <div className="pnl-summary">
      <h3>PnL Summary</h3>
      <div className="summary-grid">
        {report.config.metrics.map((metric) => {
          const totalCell = totalRow.cells[`total_${metric.id}`];
          if (!totalCell) return null;
          return (
            <div key={metric.id} className="summary-item">
              <span className="summary-label">{metric.name}</span>
              <span className={`summary-value ${(totalCell.value ?? 0) < 0 ? 'negative' : ''}`}>
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
        <button type="button" className="btn-refresh" onClick={onRefresh} disabled={isLoading}>
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
        <button type="button" className="btn-save" onClick={onSave}>
          Save
        </button>
      </div>
      <div className="toolbar-right">
        <span className="export-label">Export:</span>
        <button type="button" className="btn-export" onClick={() => onExport('csv')}>
          CSV
        </button>
        <button type="button" className="btn-export" onClick={() => onExport('excel')}>
          Excel
        </button>
        <button type="button" className="btn-export" onClick={() => onExport('pdf')}>
          PDF
        </button>
      </div>
    </div>
  );
};
