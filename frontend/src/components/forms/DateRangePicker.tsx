/**
 * Date range picker component
 * Provides date range selection with validation
 */

import React, { useState } from 'react';
import { Calendar, X } from 'lucide-react';
import clsx from 'clsx';

export interface DateRange {
  startDate: string;
  endDate: string;
}

interface DateRangePickerProps {
  value?: DateRange;
  onChange: (range: DateRange | null) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  minDate?: string;
  maxDate?: string;
  error?: string;
  className?: string;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  value,
  onChange,
  label = 'Rango de Fechas',
  required = false,
  disabled = false,
  minDate,
  maxDate,
  error,
  className = ''
}) => {
  const [startDate, setStartDate] = useState(value?.startDate || '');
  const [endDate, setEndDate] = useState(value?.endDate || '');

  const handleStartDateChange = (date: string) => {
    setStartDate(date);
    
    // If end date is before start date, clear it
    if (endDate && date && new Date(date) > new Date(endDate)) {
      setEndDate('');
      onChange(date ? { startDate: date, endDate: '' } : null);
    } else {
      onChange(date || endDate ? { startDate: date, endDate } : null);
    }
  };

  const handleEndDateChange = (date: string) => {
    setEndDate(date);
    onChange(startDate || date ? { startDate, endDate: date } : null);
  };

  const clearRange = () => {
    setStartDate('');
    setEndDate('');
    onChange(null);
  };

  const formatDateForDisplay = (date: string) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('es-ES');
  };

  const getMinEndDate = () => {
    return startDate || minDate;
  };

  return (
    <div className={clsx('space-y-2', className)}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className="space-y-3">
        {/* Date Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="startDate" className="block text-xs font-medium text-gray-600 mb-1">
              Fecha de Inicio
            </label>
            <div className="relative">
              <input
                type="date"
                id="startDate"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                min={minDate}
                max={endDate || maxDate}
                disabled={disabled}
                className={clsx(
                  'input pr-10',
                  error && 'border-red-300 focus:border-red-500 focus:ring-red-500',
                  disabled && 'bg-gray-50 cursor-not-allowed'
                )}
              />
              <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label htmlFor="endDate" className="block text-xs font-medium text-gray-600 mb-1">
              Fecha de Fin
            </label>
            <div className="relative">
              <input
                type="date"
                id="endDate"
                value={endDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                min={getMinEndDate()}
                max={maxDate}
                disabled={disabled}
                className={clsx(
                  'input pr-10',
                  error && 'border-red-300 focus:border-red-500 focus:ring-red-500',
                  disabled && 'bg-gray-50 cursor-not-allowed'
                )}
              />
              <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Selected Range Display */}
        {(startDate || endDate) && (
          <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex items-center">
              <Calendar className="w-4 h-4 text-blue-500 mr-2" />
              <span className="text-sm text-blue-800">
                {startDate && endDate ? (
                  <>
                    {formatDateForDisplay(startDate)} - {formatDateForDisplay(endDate)}
                    <span className="ml-2 text-xs text-blue-600">
                      ({Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))} días)
                    </span>
                  </>
                ) : startDate ? (
                  `Desde ${formatDateForDisplay(startDate)}`
                ) : (
                  `Hasta ${formatDateForDisplay(endDate)}`
                )}
              </span>
            </div>
            
            <button
              type="button"
              onClick={clearRange}
              disabled={disabled}
              className="text-blue-500 hover:text-blue-700 p-1"
              title="Limpiar rango"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Quick Range Buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const today = new Date();
              const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
              handleStartDateChange(lastWeek.toISOString().split('T')[0]);
              handleEndDateChange(today.toISOString().split('T')[0]);
            }}
            disabled={disabled}
            className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            Última semana
          </button>
          
          <button
            type="button"
            onClick={() => {
              const today = new Date();
              const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
              handleStartDateChange(lastMonth.toISOString().split('T')[0]);
              handleEndDateChange(today.toISOString().split('T')[0]);
            }}
            disabled={disabled}
            className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            Último mes
          </button>
          
          <button
            type="button"
            onClick={() => {
              const today = new Date();
              const lastYear = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
              handleStartDateChange(lastYear.toISOString().split('T')[0]);
              handleEndDateChange(today.toISOString().split('T')[0]);
            }}
            disabled={disabled}
            className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            Último año
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
};

export default DateRangePicker;