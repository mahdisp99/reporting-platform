import React, { useState } from 'react';
import type { Dimension, Filter } from '../../types/pnl';

interface FilterPanelProps {
  dimensions: Dimension[];
  filters: Filter[];
  onChange: (filters: Filter[]) => void;
  filterOptions?: Record<string, Array<string | number>>;
}

type OperatorConfig = {
  value: Filter['operator'];
  label: string;
  inputType: 'single' | 'multiple' | 'number' | 'range';
};

const OPERATORS: OperatorConfig[] = [
  { value: 'equals', label: 'Equals', inputType: 'single' },
  { value: 'notEquals', label: 'Not Equals', inputType: 'single' },
  { value: 'in', label: 'In List', inputType: 'multiple' },
  { value: 'notIn', label: 'Not In List', inputType: 'multiple' },
  { value: 'greaterThan', label: 'Greater Than', inputType: 'number' },
  { value: 'lessThan', label: 'Less Than', inputType: 'number' },
  { value: 'between', label: 'Between', inputType: 'range' },
];

const toText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value);
};

const toTextArray = (value: Filter['value']): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => toText(item));
  }
  const text = toText(value);
  return text ? [text] : [];
};

export const FilterPanel: React.FC<FilterPanelProps> = ({
  dimensions,
  filters,
  onChange,
  filterOptions = {},
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
    const next = [...filters];
    next[index] = { ...next[index], ...updates };
    onChange(next);
  };

  const removeFilter = (index: number) => {
    onChange(filters.filter((_, currentIndex) => currentIndex !== index));
  };

  const clearAll = () => onChange([]);

  const getInputType = (operator: Filter['operator']): OperatorConfig['inputType'] => {
    return OPERATORS.find((item) => item.value === operator)?.inputType || 'single';
  };

  const getDimensionOptions = (dimensionId: string): string[] => {
    const values = filterOptions[dimensionId] || [];
    return values.map((value) => toText(value));
  };

  return (
    <div className="filter-panel">
      <div
        className="filter-header"
        onClick={() => setIsExpanded((value) => !value)}
        role="button"
        tabIndex={0}
      >
        <h4>Filters {filters.length > 0 && <span className="badge">{filters.length}</span>}</h4>
        <span className="toggle">{isExpanded ? 'v' : '>'}</span>
      </div>

      {isExpanded && (
        <div className="filter-content">
          {filters.length === 0 ? (
            <p className="empty-state">No filters applied. Click "Add Filter" to filter your data.</p>
          ) : (
            <div className="filter-list">
              {filters.map((filter, index) => {
                const inputType = getInputType(filter.operator);
                const dimensionOptions = getDimensionOptions(filter.dimension.id);
                const optionKey = `${filter.dimension.id}-${index}`;

                return (
                  <div key={optionKey} className="filter-item">
                    <select
                      value={filter.dimension.id}
                      onChange={(event) => {
                        const nextDimension = dimensions.find((dimension) => dimension.id === event.target.value);
                        if (!nextDimension) return;
                        updateFilter(index, { dimension: nextDimension, value: '' });
                      }}
                    >
                      {dimensions.map((dimension) => (
                        <option key={dimension.id} value={dimension.id}>
                          {dimension.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={filter.operator}
                      onChange={(event) =>
                        updateFilter(index, {
                          operator: event.target.value as Filter['operator'],
                          value: '',
                        })
                      }
                    >
                      {OPERATORS.map((operator) => (
                        <option key={operator.value} value={operator.value}>
                          {operator.label}
                        </option>
                      ))}
                    </select>

                    {inputType === 'single' && dimensionOptions.length > 0 && (
                      <select
                        value={toText(filter.value)}
                        onChange={(event) => updateFilter(index, { value: event.target.value })}
                      >
                        <option value="">Select value...</option>
                        {dimensionOptions.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    )}

                    {inputType === 'single' && dimensionOptions.length === 0 && (
                      <input
                        type="text"
                        value={toText(filter.value)}
                        onChange={(event) => updateFilter(index, { value: event.target.value })}
                        placeholder="Value..."
                      />
                    )}

                    {inputType === 'multiple' && dimensionOptions.length > 0 && (
                      <select
                        multiple
                        value={toTextArray(filter.value)}
                        onChange={(event) => {
                          const values = Array.from(event.target.selectedOptions).map((option) => option.value);
                          updateFilter(index, { value: values });
                        }}
                      >
                        {dimensionOptions.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    )}

                    {inputType === 'multiple' && dimensionOptions.length === 0 && (
                      <input
                        type="text"
                        value={toTextArray(filter.value).join(', ')}
                        onChange={(event) =>
                          updateFilter(index, {
                            value: event.target.value
                              .split(',')
                              .map((item) => item.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="Comma-separated values..."
                      />
                    )}

                    {inputType === 'number' && (
                      <input
                        type="number"
                        value={toText(filter.value)}
                        onChange={(event) => updateFilter(index, { value: event.target.value })}
                        placeholder="Number..."
                      />
                    )}

                    {inputType === 'range' && (
                      <div className="range-inputs">
                        <input
                          type="number"
                          value={toText(Array.isArray(filter.value) ? filter.value[0] : '')}
                          onChange={(event) => {
                            const maxValue = toText(Array.isArray(filter.value) ? filter.value[1] : '');
                            updateFilter(index, { value: [event.target.value, maxValue] });
                          }}
                          placeholder="Min"
                        />
                        <span>to</span>
                        <input
                          type="number"
                          value={toText(Array.isArray(filter.value) ? filter.value[1] : '')}
                          onChange={(event) => {
                            const minValue = toText(Array.isArray(filter.value) ? filter.value[0] : '');
                            updateFilter(index, { value: [minValue, event.target.value] });
                          }}
                          placeholder="Max"
                        />
                      </div>
                    )}

                    <button type="button" className="remove-btn" onClick={() => removeFilter(index)}>
                      x
                    </button>
                  </div>
                );
              })}
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
