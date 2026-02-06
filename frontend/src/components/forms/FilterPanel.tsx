/**
 * Filter panel component
 * Provides advanced filtering capabilities for complex queries
 */

import React, { useState } from 'react';
import { Filter, X, Plus, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import DateRangePicker from './DateRangePicker';
import clsx from 'clsx';

export type FilterOperator = 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan' | 'between' | 'in';

export interface FilterCondition {
  id: string;
  field: string;
  operator: FilterOperator;
  value: any;
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect';
}

export interface FilterField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect';
  options?: Array<{ value: string; label: string }>;
  operators?: FilterOperator[];
}

interface FilterPanelProps {
  fields: FilterField[];
  conditions: FilterCondition[];
  onChange: (conditions: FilterCondition[]) => void;
  onApply: () => void;
  onClear: () => void;
  isCollapsed?: boolean;
  className?: string;
}

const FilterPanel: React.FC<FilterPanelProps> = ({
  fields,
  conditions,
  onChange,
  onApply,
  onClear,
  isCollapsed: initialCollapsed = false,
  className = ''
}) => {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  const getOperatorsForType = (type: string): FilterOperator[] => {
    switch (type) {
      case 'text':
        return ['equals', 'contains', 'startsWith', 'endsWith'];
      case 'number':
        return ['equals', 'greaterThan', 'lessThan', 'between'];
      case 'date':
        return ['equals', 'greaterThan', 'lessThan', 'between'];
      case 'select':
        return ['equals', 'in'];
      case 'multiselect':
        return ['in'];
      default:
        return ['equals'];
    }
  };

  const getOperatorLabel = (operator: FilterOperator): string => {
    const labels: Record<FilterOperator, string> = {
      equals: 'Igual a',
      contains: 'Contiene',
      startsWith: 'Comienza con',
      endsWith: 'Termina con',
      greaterThan: 'Mayor que',
      lessThan: 'Menor que',
      between: 'Entre',
      in: 'En'
    };
    return labels[operator];
  };

  const addCondition = () => {
    const newCondition: FilterCondition = {
      id: Date.now().toString(),
      field: fields[0]?.name || '',
      operator: 'equals',
      value: '',
      type: fields[0]?.type || 'text'
    };
    onChange([...conditions, newCondition]);
  };

  const removeCondition = (id: string) => {
    onChange(conditions.filter(c => c.id !== id));
  };

  const updateCondition = (id: string, updates: Partial<FilterCondition>) => {
    onChange(conditions.map(c => 
      c.id === id ? { ...c, ...updates } : c
    ));
  };

  const handleFieldChange = (id: string, fieldName: string) => {
    const field = fields.find(f => f.name === fieldName);
    if (field) {
      const availableOperators = field.operators || getOperatorsForType(field.type);
      updateCondition(id, {
        field: fieldName,
        type: field.type,
        operator: availableOperators[0],
        value: field.type === 'multiselect' ? [] : ''
      });
    }
  };

  const renderValueInput = (condition: FilterCondition) => {
    const field = fields.find(f => f.name === condition.field);
    
    switch (condition.type) {
      case 'select':
        return (
          <select
            value={condition.value}
            onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
            className="input"
          >
            <option value="">Selecciona...</option>
            {field?.options?.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'multiselect':
        return (
          <select
            multiple
            value={condition.value || []}
            onChange={(e) => {
              const values = Array.from(e.target.selectedOptions, option => option.value);
              updateCondition(condition.id, { value: values });
            }}
            className="input min-h-[80px]"
          >
            {field?.options?.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'date':
        if (condition.operator === 'between') {
          return (
            <DateRangePicker
              value={condition.value}
              onChange={(range) => updateCondition(condition.id, { value: range })}
            />
          );
        }
        return (
          <input
            type="date"
            value={condition.value}
            onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
            className="input"
          />
        );

      case 'number':
        if (condition.operator === 'between') {
          return (
            <div className="flex space-x-2">
              <input
                type="number"
                placeholder="Mínimo"
                value={condition.value?.min || ''}
                onChange={(e) => updateCondition(condition.id, { 
                  value: { ...condition.value, min: e.target.value }
                })}
                className="input"
              />
              <input
                type="number"
                placeholder="Máximo"
                value={condition.value?.max || ''}
                onChange={(e) => updateCondition(condition.id, { 
                  value: { ...condition.value, max: e.target.value }
                })}
                className="input"
              />
            </div>
          );
        }
        return (
          <input
            type="number"
            value={condition.value}
            onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
            className="input"
          />
        );

      default:
        return (
          <input
            type="text"
            value={condition.value}
            onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
            className="input"
            placeholder="Ingresa el valor..."
          />
        );
    }
  };

  return (
    <div className={clsx('card', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <Filter className="w-5 h-5 text-gray-400 mr-2" />
          <h3 className="text-lg font-medium text-gray-900">Filtros Avanzados</h3>
          {conditions.length > 0 && (
            <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
              {conditions.length}
            </span>
          )}
        </div>
        
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 text-gray-400 hover:text-gray-600"
        >
          {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="space-y-4">
          {/* Filter Conditions */}
          {conditions.length > 0 && (
            <div className="space-y-3">
              {conditions.map((condition, index) => {
                const field = fields.find(f => f.name === condition.field);
                const availableOperators = field?.operators || getOperatorsForType(condition.type);

                return (
                  <div key={condition.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                    {index > 0 && (
                      <div className="flex items-center text-xs text-gray-500 font-medium mt-2">
                        Y
                      </div>
                    )}
                    
                    {/* Field Selection */}
                    <div className="flex-1">
                      <select
                        value={condition.field}
                        onChange={(e) => handleFieldChange(condition.id, e.target.value)}
                        className="input text-sm"
                      >
                        {fields.map(field => (
                          <option key={field.name} value={field.name}>
                            {field.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Operator Selection */}
                    <div className="flex-1">
                      <select
                        value={condition.operator}
                        onChange={(e) => updateCondition(condition.id, { operator: e.target.value as FilterOperator })}
                        className="input text-sm"
                      >
                        {availableOperators.map(operator => (
                          <option key={operator} value={operator}>
                            {getOperatorLabel(operator)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Value Input */}
                    <div className="flex-2">
                      {renderValueInput(condition)}
                    </div>

                    {/* Remove Button */}
                    <button
                      onClick={() => removeCondition(condition.id)}
                      className="p-2 text-gray-400 hover:text-red-500 mt-1"
                      title="Eliminar filtro"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Condition Button */}
          <button
            onClick={addCondition}
            className="flex items-center text-sm text-blue-600 hover:text-blue-800"
          >
            <Plus className="w-4 h-4 mr-1" />
            Agregar filtro
          </button>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <div className="flex space-x-3">
              <button
                onClick={onApply}
                disabled={conditions.length === 0}
                className="btn btn-primary"
              >
                Aplicar Filtros
              </button>
              
              <button
                onClick={onClear}
                disabled={conditions.length === 0}
                className="btn btn-secondary"
              >
                <Minus className="w-4 h-4 mr-2" />
                Limpiar Todo
              </button>
            </div>
            
            <div className="text-xs text-gray-500">
              {conditions.length === 0 ? 'Sin filtros aplicados' : `${conditions.length} filtro(s) activo(s)`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FilterPanel;