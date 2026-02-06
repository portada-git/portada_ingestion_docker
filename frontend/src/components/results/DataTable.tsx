/**
 * Data table component with scrolling and pagination
 * Handles large result sets with performance optimization
 */

import React, { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  Download,
  Filter,
} from "lucide-react";
import LoadingSpinner from "../LoadingSpinner";
import clsx from "clsx";

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  filterable?: boolean;
  width?: string;
  align?: "left" | "center" | "right";
  render?: (
    value: unknown,
    row: Record<string, unknown>,
    index: number,
  ) => React.ReactNode;
  format?: (value: unknown) => string;
}

export interface TableProps {
  columns: TableColumn[];
  data: Record<string, unknown>[];
  loading?: boolean;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
  };
  sorting?: {
    column: string;
    direction: "asc" | "desc";
    onSort: (column: string, direction: "asc" | "desc") => void;
  };
  filtering?: {
    filters: Record<string, string>;
    onFilter: (filters: Record<string, string>) => void;
  };
  selection?: {
    selectedRows: string[];
    onSelectionChange: (selectedRows: string[]) => void;
    rowKey: string;
  };
  onRowClick?: (row: Record<string, unknown>, index: number) => void;
  onExport?: () => void;
  emptyMessage?: string;
  className?: string;
}

const DataTable: React.FC<TableProps> = ({
  columns,
  data,
  loading = false,
  pagination,
  sorting,
  filtering,
  selection,
  onRowClick,
  onExport,
  emptyMessage = "No hay datos disponibles",
  className = "",
}) => {
  const [localFilters, setLocalFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);

  // Filter data locally if no external filtering is provided
  const filteredData = useMemo(() => {
    if (filtering) return data; // External filtering

    return data.filter((row) => {
      return Object.entries(localFilters).every(([key, value]) => {
        if (!value) return true;
        const cellValue = row[key]?.toString().toLowerCase() || "";
        return cellValue.includes(value.toLowerCase());
      });
    });
  }, [data, localFilters, filtering]);

  const handleSort = (column: string) => {
    if (!sorting) return;

    const newDirection =
      sorting.column === column && sorting.direction === "asc" ? "desc" : "asc";
    sorting.onSort(column, newDirection);
  };

  const handleFilterChange = (column: string, value: string) => {
    if (filtering) {
      filtering.onFilter({ ...filtering.filters, [column]: value });
    } else {
      setLocalFilters((prev) => ({ ...prev, [column]: value }));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (!selection) return;

    if (checked) {
      const allKeys = filteredData.map((row) => String(row[selection.rowKey]));
      selection.onSelectionChange(allKeys);
    } else {
      selection.onSelectionChange([]);
    }
  };

  const handleRowSelect = (rowKey: string, checked: boolean) => {
    if (!selection) return;

    if (checked) {
      selection.onSelectionChange([...selection.selectedRows, rowKey]);
    } else {
      selection.onSelectionChange(
        selection.selectedRows.filter((key) => key !== rowKey),
      );
    }
  };

  const isAllSelected =
    selection &&
    filteredData.length > 0 &&
    filteredData.every((row) =>
      selection.selectedRows.includes(String(row[selection.rowKey])),
    );

  const isIndeterminate =
    selection && selection.selectedRows.length > 0 && !isAllSelected;

  const renderCell = (
    column: TableColumn,
    row: Record<string, unknown>,
    index: number,
  ) => {
    const value = row[column.key];

    if (column.render) {
      return column.render(value, row, index);
    }

    if (column.format) {
      return column.format(value);
    }

    return value?.toString() || "";
  };

  const pageSizeOptions = [10, 25, 50, 100];

  return (
    <div
      className={clsx(
        "bg-white border border-gray-200 rounded-lg shadow-sm",
        className,
      )}
    >
      {/* Table Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-medium text-gray-900">
              Resultados
              {!loading && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({pagination ? pagination.total : filteredData.length}{" "}
                  registros)
                </span>
              )}
            </h3>

            {selection && selection.selectedRows.length > 0 && (
              <span className="text-sm text-blue-600">
                {selection.selectedRows.length} seleccionado(s)
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={clsx(
                "p-2 text-gray-400 hover:text-gray-600 rounded-md",
                showFilters && "bg-gray-100 text-gray-600",
              )}
              title="Mostrar filtros"
            >
              <Filter className="w-4 h-4" />
            </button>

            {onExport && (
              <button
                onClick={onExport}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-md"
                title="Exportar datos"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filters Row */}
      {showFilters && (
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {columns
              .filter((col) => col.filterable)
              .map((column) => (
                <div key={column.key}>
                  <input
                    type="text"
                    placeholder={`Filtrar ${column.label.toLowerCase()}...`}
                    value={
                      filtering?.filters[column.key] ||
                      localFilters[column.key] ||
                      ""
                    }
                    onChange={(e) =>
                      handleFilterChange(column.key, e.target.value)
                    }
                    className="input text-sm"
                  />
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : filteredData.length === 0 ? (
          <div className="text-center py-12">
            <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">{emptyMessage}</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-white">
              <tr>
                {selection && (
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      ref={(input) => {
                        if (input) input.indeterminate = !!isIndeterminate;
                      }}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                  </th>
                )}

                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={clsx(
                      "px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider",
                      column.align === "center" && "text-center",
                      column.align === "right" && "text-right",
                      column.sortable && "cursor-pointer hover:text-gray-700",
                    )}
                    style={{ width: column.width }}
                    onClick={() => column.sortable && handleSort(column.key)}
                  >
                    <div className="flex items-center space-x-1">
                      <span>{column.label}</span>
                      {column.sortable && sorting && (
                        <div className="flex flex-col">
                          <ChevronLeft
                            className={clsx(
                              "w-3 h-3 transform rotate-90",
                              sorting.column === column.key &&
                                sorting.direction === "asc"
                                ? "text-primary-600"
                                : "text-gray-300",
                            )}
                          />
                          <ChevronLeft
                            className={clsx(
                              "w-3 h-3 transform -rotate-90",
                              sorting.column === column.key &&
                                sorting.direction === "desc"
                                ? "text-primary-600"
                                : "text-gray-300",
                            )}
                          />
                        </div>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.map((row, index) => {
                const isSelected = selection?.selectedRows.includes(
                  String(row[selection.rowKey]),
                );

                return (
                  <tr
                    key={
                      selection?.rowKey ? String(row[selection.rowKey]) : index
                    }
                    className={clsx(
                      "hover:bg-gray-50",
                      onRowClick && "cursor-pointer",
                      isSelected && "bg-blue-50",
                    )}
                    onClick={() => onRowClick?.(row, index)}
                  >
                    {selection && (
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) =>
                            handleRowSelect(
                              String(row[selection.rowKey]),
                              e.target.checked,
                            )
                          }
                          onClick={(e) => e.stopPropagation()}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                    )}

                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={clsx(
                          "px-6 py-4 whitespace-nowrap text-sm text-gray-900",
                          column.align === "center" && "text-center",
                          column.align === "right" && "text-right",
                        )}
                      >
                        {renderCell(column, row, index)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination && !loading && (
        <div className="px-6 py-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-700">Mostrar:</span>
                <select
                  value={pagination.pageSize}
                  onChange={(e) =>
                    pagination.onPageSizeChange(Number(e.target.value))
                  }
                  className="input text-sm py-1"
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-gray-700">por página</span>
              </div>

              <div className="text-sm text-gray-700">
                Mostrando {(pagination.page - 1) * pagination.pageSize + 1} a{" "}
                {Math.min(
                  pagination.page * pagination.pageSize,
                  pagination.total,
                )}{" "}
                de {pagination.total} resultados
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => pagination.onPageChange(1)}
                disabled={pagination.page === 1}
                className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>

              <button
                onClick={() => pagination.onPageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-3 py-1 text-sm text-gray-700">
                Página {pagination.page} de{" "}
                {Math.ceil(pagination.total / pagination.pageSize)}
              </span>

              <button
                onClick={() => pagination.onPageChange(pagination.page + 1)}
                disabled={
                  pagination.page >=
                  Math.ceil(pagination.total / pagination.pageSize)
                }
                className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={() =>
                  pagination.onPageChange(
                    Math.ceil(pagination.total / pagination.pageSize),
                  )
                }
                disabled={
                  pagination.page >=
                  Math.ceil(pagination.total / pagination.pageSize)
                }
                className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataTable;
