import React from 'react';
import type { Metric, CalculatedMetric } from '../../types/pnl';

interface MetricSelectorProps {
  title: string;
  availableMetrics: (Metric | CalculatedMetric)[];
  selectedMetrics: (Metric | CalculatedMetric)[];
  onChange: (metrics: (Metric | CalculatedMetric)[]) => void;
  maxSelections?: number;
}

export const MetricSelector: React.FC<MetricSelectorProps> = ({
  title,
  availableMetrics,
  selectedMetrics,
  onChange,
  maxSelections = 10,
}) => {
  const handleToggle = (metric: Metric | CalculatedMetric) => {
    const isSelected = selectedMetrics.some((m) => m.id === metric.id);

    if (isSelected) {
      onChange(selectedMetrics.filter((m) => m.id !== metric.id));
    } else if (selectedMetrics.length < maxSelections) {
      // Auto-select dependencies for calculated metrics
      if ('dependencies' in metric) {
        const depsToAdd = metric.dependencies
          .map((depId) => availableMetrics.find((m) => m.id === depId))
          .filter((m): m is Metric | CalculatedMetric => !!m)
          .filter((m) => !selectedMetrics.some((sm) => sm.id === m.id));

        onChange([...selectedMetrics, ...depsToAdd, metric]);
      } else {
        onChange([...selectedMetrics, metric]);
      }
    }
  };

  const handleReorder = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === selectedMetrics.length - 1)
    ) {
      return;
    }

    const newMetrics = [...selectedMetrics];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [newMetrics[index], newMetrics[swapIndex]] = [
      newMetrics[swapIndex],
      newMetrics[index],
    ];
    onChange(newMetrics);
  };

  const handleRemove = (index: number) => {
    const removedMetric = selectedMetrics[index];
    let newMetrics = selectedMetrics.filter((_, i) => i !== index);

    // Check if any remaining calculated metrics depend on the removed one
    const dependentMetrics = newMetrics.filter((m) =>
      'dependencies' in m ? m.dependencies.includes(removedMetric.id) : false
    );

    // Remove dependent metrics as well
    newMetrics = newMetrics.filter(
      (m) => !dependentMetrics.some((dm) => dm.id === m.id)
    );

    onChange(newMetrics);
  };

  const formatMetricType = (metric: Metric | CalculatedMetric): string => {
    if ('type' in metric && metric.type === 'calculated') {
      return 'Calculated';
    }
    return metric.aggregation.charAt(0).toUpperCase() + metric.aggregation.slice(1);
  };

  const formatMetricFormat = (metric: Metric | CalculatedMetric): string => {
    switch (metric.format) {
      case 'currency':
        return '$';
      case 'percent':
        return '%';
      case 'integer':
        return '#'
      default:
        return '123';
    }
  };

  return (
    <div className="metric-selector">
      <h4 className="selector-title">{title}</h4>

      {/* Selected Metrics */}
      <div className="selected-metrics">
        <label>Selected (reorder to change column order):</label>
        {selectedMetrics.length === 0 ? (
          <p className="empty-state">No metrics selected</p>
        ) : (
          <ul className="selected-list">
            {selectedMetrics.map((metric, index) => (
              <li key={metric.id} className="selected-item">
                <span className="metric-info">
                  <span className="metric-name">{metric.name}</span>
                  <span className="metric-meta">
                    {formatMetricType(metric)} • {formatMetricFormat(metric)}
                  </span>
                </span>
                <div className="metric-actions">
                  <button
                    type="button"
                    onClick={() => handleReorder(index, 'up')}
                    disabled={index === 0}
                    aria-label="Move left"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReorder(index, 'down')}
                    disabled={index === selectedMetrics.length - 1}
                    aria-label="Move right"
                  >
                    →
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(index)}
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Available Metrics */}
      <div className="available-metrics">
        <label>Available:</label>
        <div className="metric-grid">
          {availableMetrics.map((metric) => {
            const isSelected = selectedMetrics.some((m) => m.id === metric.id);
            const isDisabled =
              !isSelected && selectedMetrics.length >= maxSelections;
            const isCalculated =
              'type' in metric && metric.type === 'calculated';

            return (
              <button
                key={metric.id}
                type="button"
                className={`metric-btn ${isSelected ? 'selected' : ''} ${
                  isCalculated ? 'calculated' : ''
                }`}
                onClick={() => handleToggle(metric)}
                disabled={isDisabled}
                title={isCalculated ? `Calculated: ${metric.formula || 'custom'}` : ''}
              >
                <span className="metric-label">{metric.name}</span>
                <span className="metric-format">
                  {formatMetricFormat(metric)}
                </span>
                {isCalculated && <span className="calc-badge">ƒ</span>}
                {isSelected && <span className="check">✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
