import React, { useState } from 'react';
import type { Filter, Dimension } from '../../types/pnl';

interface FilterPanelProps {
  dimensions: Dimension[];
  filters: Filter[];
  onChange: (filters: Filter[]) => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  dimensions,
  filters,
  onChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const addFilter = () => {
    if (dimensions.length === 0) return;

    const newFilter: Filter = {
      dimension: dimensions[0],
      operator: 'equals',
      value: '',
    };
    onChange([...filters, newFilter]);
  };

  const updateFilter = (index: number, updates: Partial<Filter>) => {
    const newFilters = [...filters];
    newFilters[index] = { ...newFilters[index], ...updates };
    onChange(newFilters);
  };

  const removeFilter = (index: number) => {
    onChange(filters.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    onChange([]);
  };

  const operators = [
    { value: 'equals', label: 'Equals', inputType: 'single' },
    { value: 'notEquals', label: 'Not Equals', inputType: 'single' },
    { value: 'in', label: 'In List', inputType: 'multiple' },
    { value: 'notIn', label: 'Not In List', inputType: 'multiple' },
    { value: 'greaterThan', label: 'Greater Than', inputType: 'number' },
    { value: 'lessThan', label: 'Less Than', inputType: 'number' },
    { value: 'between', label: 'Between', inputType: 'range' },
  ];

  const getInputType = (operator: string): string => {
    const op = operators.find((o) => o.value === operator);
    return op?.inputType || 'single';
  };

  return (
    <div className="filter-panel">
      <div
        className="filter-header"
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
      >
        <h4>Filters {filters.length > 0 && <span className="badge">{filters.length}</span>}</h4>
        <span className="toggle">{isExpanded ? '▼' : '▶'}</span>
      </div>

      {isExpanded && (
        <div className="filter-content">
          {filters.length === 0 ? (
            <p className="empty-state">No filters applied. Click "Add Filter" to filter your data.</p>
          ) : (
            <div className="filter-list">
              {filters.map((filter, index) => (
                <div key={index} className="filter-item">
                  {/* Dimension selector */}
                  <select
                    value={filter.dimension.id}
                    onChange={(e) => {
                      const dim = dimensions.find((d) => d.id === e.target.value);
                      if (dim) updateFilter(index, { dimension: dim });
                    }}
                  >
                    {dimensions.map((dim) => (
                      <option key={dim.id} value={dim.id}>
                        {dim.name}
                      </option>
                    ))}
                  </select>

                  {/* Operator selector */}
                  <select
                    value={filter.operator}
                    onChange={(e) =>
                      updateFilter(index, {
                        operator: e.target.value as Filter['operator'],
                        value: '',
                      })
                    }
                  >
                    {operators.map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </select>

                  {/* Value input */}
                  {getInputType(filter.operator) === 'single' && (
                    <input
                      type="text"
                      value={filter.value as string}
                      onChange={(e) => updateFilter(index, { value: e.target.value })}
                      placeholder="Value..."
                    />
                  )}

                  {getInputType(filter.operator) === 'multiple' && (
                    <input
                      type="text"
                      value={Array.isArray(filter.value) ? filter.value.join(', ') : filter.value}
                      onChange={(e) =>
                        updateFilter(index, {
                          value: e.target.value.split(',').map((v) => v.trim()),
                        })
                      }
                      placeholder="Comma-separated values..."
                    />
                  )}

                  {getInputType(filter.operator) === 'number' && (
                    <input
                      type="number"
                      value={filter.value as number}
                      onChange={(e) =>
                        updateFilter(index, { value: parseFloat(e.target.value) })
                      }
                    />
                  )}

                  {getInputType(filter.operator) === 'range' && (
                    <div className="range-inputs">
                      <input
                        type="number"
                        value={Array.isArray(filter.value) ? filter.value[0] : ''}
                        onChange={(e) =>
                          updateFilter(index, {
                            value: [
                              parseFloat(e.target.value),
                              Array.isArray(filter.value) ? filter.value[1] || 0 : 0,
                            ],
                          })
                        }
                        placeholder="Min"
                      />
                      <span>to</span>
                      <input
                        type="number"
                        value={Array.isArray(filter.value) ? filter.value[1] : ''}
                        onChange={(e) =>
                          updateFilter(index, {
                            value: [
                              Array.isArray(filter.value) ? filter.value[0] || 0 : 0,
                              parseFloat(e.target.value),
                            ],
                          })
                        }
                        placeholder="Max"
                      />
                    </div>
                  )}

                  <button type="button" className="remove-btn" onClick={() => removeFilter(index)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="filter-actions">
            <button type="button" className="btn-add" onClick={addFilter}>
              + Add Filter
            </button>
            {filters.length > 0 && (
              <button type="button" className="btn-clear" onClick={clearAll}>
                Clear All
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
