/**
 * Advanced Filters Component
 * Provides sophisticated filtering capabilities for data analysis
 */

import React, { useState } from 'react';
import { 
  Filter, 
  X, 
  Calendar, 
  Search, 
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

interface DateRange {
  start: string;
  end: string;
}

interface AdvancedFiltersProps {
  isOpen: boolean;
  onToggle: () => void;
  onApply: (filters: FilterState) => void;
  onReset: () => void;
  options: {
    publications?: FilterOption[];
    categories?: FilterOption[];
    types?: FilterOption[];
    users?: FilterOption[];
  };
}

export interface FilterState {
  searchTerm: string;
  publications: string[];
  categories: string[];
  types: string[];
  users: string[];
  dateRange: DateRange;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

const AdvancedFilters: React.FC<AdvancedFiltersProps> = ({
  isOpen,
  onToggle,
  onApply,
  onReset,
  options
}) => {
  const [filters, setFilters] = useState<FilterState>({
    searchTerm: '',
    publications: [],
    categories: [],
    types: [],
    users: [],
    dateRange: { start: '', end: '' },
    sortBy: 'date',
    sortOrder: 'desc'
  });

  const handleInputChange = (field: keyof FilterState, value: any) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleMultiSelectChange = (field: 'publications' | 'categories' | 'types' | 'users', value: string) => {
    setFilters(prev => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter(item => item !== value)
        : [...prev[field], value]
    }));
  };

  const handleApply = () => {
    onApply(filters);
  };

  const handleReset = () => {
    const resetFilters: FilterState = {
      searchTerm: '',
      publications: [],
      categories: [],
      types: [],
      users: [],
      dateRange: { start: '', end: '' },
      sortBy: 'date',
      sortOrder: 'desc'
    };
    setFilters(resetFilters);
    onReset();
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.searchTerm) count++;
    if (filters.publications.length > 0) count++;
    if (filters.categories.length > 0) count++;
    if (filters.types.length > 0) count++;
    if (filters.users.length > 0) count++;
    if (filters.dateRange.start || filters.dateRange.end) count++;
    return count;
  };

  const renderMultiSelect = (
    title: string,
    field: 'publications' | 'categories' | 'types' | 'users',
    options: FilterOption[] = []
  ) => (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{title}</label>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {options.map(option => (
          <label key={option.value} className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters[field].includes(option.value)}
              onChange={() => handleMultiSelectChange(field, option.value)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700 flex-1">{option.label}</span>
            {option.count !== undefined && (
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                {option.count}
              </span>
            )}
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      {/* Filter Toggle Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center space-x-2">
          <Filter className="w-5 h-5 text-gray-500" />
          <span className="font-medium text-gray-900">Filtros Avanzados</span>
          {getActiveFiltersCount() > 0 && (
            <span className="bg-primary-100 text-primary-800 text-xs font-medium px-2 py-1 rounded-full">
              {getActiveFiltersCount()}
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-gray-500" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-500" />
        )}
      </button>

      {/* Filter Content */}
      {isOpen && (
        <div className="border-t border-gray-200 p-4 space-y-6">
          {/* Search Term */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Búsqueda de Texto
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={filters.searchTerm}
                onChange={(e) => handleInputChange('searchTerm', e.target.value)}
                placeholder="Buscar en nombres, descripciones..."
                className="pl-10 input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Publications */}
            {options.publications && renderMultiSelect('Publicaciones', 'publications', options.publications)}

            {/* Categories */}
            {options.categories && renderMultiSelect('Categorías', 'categories', options.categories)}

            {/* Types */}
            {options.types && renderMultiSelect('Tipos', 'types', options.types)}

            {/* Users */}
            {options.users && renderMultiSelect('Usuarios', 'users', options.users)}

            {/* Date Range */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Rango de Fechas
              </label>
              <div className="space-y-2">
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={filters.dateRange.start}
                    onChange={(e) => handleInputChange('dateRange', { ...filters.dateRange, start: e.target.value })}
                    className="pl-10 input"
                    placeholder="Fecha inicio"
                  />
                </div>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={filters.dateRange.end}
                    onChange={(e) => handleInputChange('dateRange', { ...filters.dateRange, end: e.target.value })}
                    className="pl-10 input"
                    placeholder="Fecha fin"
                  />
                </div>
              </div>
            </div>

            {/* Sort Options */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Ordenar Por
              </label>
              <select
                value={filters.sortBy}
                onChange={(e) => handleInputChange('sortBy', e.target.value)}
                className="input"
              >
                <option value="date">Fecha</option>
                <option value="name">Nombre</option>
                <option value="size">Tamaño</option>
                <option value="count">Cantidad</option>
              </select>
              <select
                value={filters.sortOrder}
                onChange={(e) => handleInputChange('sortOrder', e.target.value as 'asc' | 'desc')}
                className="input"
              >
                <option value="desc">Descendente</option>
                <option value="asc">Ascendente</option>
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between items-center pt-4 border-t border-gray-200">
            <button
              onClick={handleReset}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              <X className="w-4 h-4" />
              <span>Limpiar Filtros</span>
            </button>
            
            <div className="flex space-x-3">
              <button
                onClick={onToggle}
                className="btn btn-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={handleApply}
                className="btn btn-primary"
              >
                Aplicar Filtros
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdvancedFilters;