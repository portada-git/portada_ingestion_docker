/**
 * Virtual scroll table component
 * Optimized for large datasets with virtual scrolling
 */

import React, { useState } from 'react';
import { TableColumn } from './DataTable';
import LoadingSpinner from '../LoadingSpinner';
import clsx from 'clsx';

interface VirtualScrollTableProps {
  columns: TableColumn[];
  data: Record<string, unknown>[];
  rowHeight?: number;
  height?: number;
  loading?: boolean;
  onRowClick?: (row: Record<string, unknown>, index: number) => void;
  className?: string;
}

const VirtualScrollTable: React.FC<VirtualScrollTableProps> = ({
  columns,
  data,
  rowHeight = 48,
  height = 400,
  loading = false,
  onRowClick,
  className = ''
}) => {
  const [scrollTop, setScrollTop] = useState(0);

  const renderCell = (column: TableColumn, row: Record<string, unknown>, index: number) => {
    const value = row[column.key];
    
    if (column.render) {
      return column.render(value, row, index);
    }
    
    if (column.format) {
      return column.format(value);
    }
    
    return value?.toString() || '';
  };

  const Header = () => (
    <div className="flex items-center bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
      {columns.map(column => (
        <div
          key={column.key}
          className={clsx(
            'px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider flex-shrink-0',
            column.align === 'center' && 'text-center',
            column.align === 'right' && 'text-right'
          )}
          style={{ 
            width: column.width || `${100 / columns.length}%`,
            minWidth: '100px'
          }}
        >
          {column.label}
        </div>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className={clsx('bg-white border border-gray-200 rounded-lg shadow-sm', className)}>
        <div className="flex items-center justify-center py-12" style={{ height }}>
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={clsx('bg-white border border-gray-200 rounded-lg shadow-sm', className)}>
        <Header />
        <div className="flex items-center justify-center py-12 text-gray-500">
          No hay datos disponibles
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden', className)}>
      <Header />
      
      <div 
        className="overflow-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
        style={{ height: height - 48 }}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        {data.map((row, index) => (
          <div
            key={index}
            className={clsx(
              'flex items-center border-b border-gray-200 hover:bg-gray-50',
              onRowClick && 'cursor-pointer'
            )}
            style={{ height: rowHeight }}
            onClick={() => onRowClick?.(row, index)}
          >
            {columns.map((column) => (
              <div
                key={column.key}
                className={clsx(
                  'px-4 py-2 text-sm text-gray-900 flex-shrink-0 overflow-hidden',
                  column.align === 'center' && 'text-center',
                  column.align === 'right' && 'text-right'
                )}
                style={{ 
                  width: column.width || `${100 / columns.length}%`,
                  minWidth: '100px'
                }}
              >
                <div className="truncate" title={renderCell(column, row, index)?.toString()}>
                  {renderCell(column, row, index)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      
      {/* Scroll indicator */}
      {data.length > 0 && (
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
          Mostrando {Math.floor(scrollTop / rowHeight) + 1} - {Math.min(Math.floor(scrollTop / rowHeight) + Math.floor(height / rowHeight), data.length)} de {data.length} registros
        </div>
      )}
    </div>
  );
};

export default VirtualScrollTable;