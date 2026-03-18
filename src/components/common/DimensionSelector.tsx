import React from 'react';
import type { Dimension } from '../../types/pnl';

interface DimensionSelectorProps {
  title: string;
  availableDimensions: Dimension[];
  selectedDimensions: Dimension[];
  onChange: (dimensions: Dimension[]) => void;
  maxSelections?: number;
  allowHierarchy?: boolean;
}

export const DimensionSelector: React.FC<DimensionSelectorProps> = ({
  title,
  availableDimensions,
  selectedDimensions,
  onChange,
  maxSelections = 5,
  allowHierarchy = true,
}) => {
  const handleToggle = (dimension: Dimension) => {
    const isSelected = selectedDimensions.some((d) => d.id === dimension.id);

    if (isSelected) {
      // Remove dimension
      onChange(selectedDimensions.filter((d) => d.id !== dimension.id));
    } else {
      // Add dimension if under limit
      if (selectedDimensions.length < maxSelections) {
        // If hierarchy is enabled, auto-select parent dimensions
        if (allowHierarchy && dimension.parentDimension) {
          const parent = availableDimensions.find(
            (d) => d.id === dimension.parentDimension
          );
          if (parent && !selectedDimensions.some((d) => d.id === parent.id)) {
            onChange([...selectedDimensions, parent, dimension]);
            return;
          }
        }
        onChange([...selectedDimensions, dimension]);
      }
    }
  };

  const handleReorder = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === selectedDimensions.length - 1)
    ) {
      return;
    }

    const newDimensions = [...selectedDimensions];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [newDimensions[index], newDimensions[swapIndex]] = [
      newDimensions[swapIndex],
      newDimensions[index],
    ];
    onChange(newDimensions);
  };

  const handleRemove = (index: number) => {
    const removedDim = selectedDimensions[index];
    let newDimensions = selectedDimensions.filter((_, i) => i !== index);

    // If hierarchy is enabled, also remove children of removed dimension
    if (allowHierarchy) {
      const childrenIds = getAllChildrenIds(removedDim, availableDimensions);
      newDimensions = newDimensions.filter((d) => !childrenIds.includes(d.id));
    }

    onChange(newDimensions);
  };

  const getAllChildrenIds = (
    parent: Dimension,
    allDims: Dimension[]
  ): string[] => {
    const children = allDims.filter((d) => d.parentDimension === parent.id);
    let ids = children.map((c) => c.id);
    for (const child of children) {
      ids = [...ids, ...getAllChildrenIds(child, allDims)];
    }
    return ids;
  };

  // Group dimensions by hierarchy level for display
  const groupedDimensions = availableDimensions.reduce((acc, dim) => {
    const level = dim.level ?? 0;
    if (!acc[level]) acc[level] = [];
    acc[level].push(dim);
    return acc;
  }, {} as Record<number, Dimension[]>);

  return (
    <div className="dimension-selector">
      <h4 className="selector-title">{title}</h4>

      {/* Selected Dimensions */}
      <div className="selected-dimensions">
        <label>Selected (drag to reorder):</label>
        {selectedDimensions.length === 0 ? (
          <p className="empty-state">No dimensions selected</p>
        ) : (
          <ul className="selected-list">
            {selectedDimensions.map((dim, index) => (
              <li key={dim.id} className="selected-item">
                <span className="dim-name">{dim.name}</span>
                <div className="dim-actions">
                  <button
                    type="button"
                    onClick={() => handleReorder(index, 'up')}
                    disabled={index === 0}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReorder(index, 'down')}
                    disabled={index === selectedDimensions.length - 1}
                    aria-label="Move down"
                  >
                    ↓
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

      {/* Available Dimensions */}
      <div className="available-dimensions">
        <label>Available:</label>
        {Object.entries(groupedDimensions).map(([level, dims]) => (
          <div key={level} className="dimension-group">
            <span className="level-label">Level {level}</span>
            <div className="dimension-buttons">
              {dims.map((dim) => {
                const isSelected = selectedDimensions.some(
                  (d) => d.id === dim.id
                );
                const isDisabled =
                  !isSelected && selectedDimensions.length >= maxSelections;

                return (
                  <button
                    key={dim.id}
                    type="button"
                    className={`dimension-btn ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleToggle(dim)}
                    disabled={isDisabled}
                    style={{
                      marginLeft: `${(dim.level ?? 0) * 16}px`,
                    }}
                  >
                    {dim.name}
                    {isSelected && <span className="check">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
