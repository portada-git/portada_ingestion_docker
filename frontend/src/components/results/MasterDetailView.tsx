/**
 * Master-detail view component
 * Displays master list with expandable detail views
 */

import React, { useState } from "react";
import { ChevronRight, ChevronDown, Eye, X } from "lucide-react";
import { TableColumn } from "./DataTable";
import LoadingSpinner from "../LoadingSpinner";
import clsx from "clsx";

export interface MasterDetailProps {
  masterData: Record<string, unknown>[];
  masterColumns: TableColumn[];
  detailRenderer: (masterRow: Record<string, unknown>) => React.ReactNode;
  onDetailLoad?: (
    masterRow: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  masterTitle?: string;
  detailTitle?: string;
  expandMode?: "inline" | "modal" | "sidebar";
  loading?: boolean;
  className?: string;
}

const MasterDetailView: React.FC<MasterDetailProps> = ({
  masterData,
  masterColumns,
  detailRenderer,
  onDetailLoad,
  masterTitle = "Lista Principal",
  detailTitle = "Detalles",
  expandMode = "inline",
  loading = false,
  className = "",
}: MasterDetailProps) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedRow, setSelectedRow] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [detailData, setDetailData] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  const getRowKey = (row: Record<string, unknown>, index: number): string => {
    return String(row.id || row.log_id || row.key || index);
  };

  const toggleExpanded = async (
    row: Record<string, unknown>,
    index: number,
  ) => {
    const rowKey = getRowKey(row, index);
    const newExpanded = new Set(expandedRows);

    if (expandMode === "modal") {
      setSelectedRow(row);
      setShowModal(true);
      if (onDetailLoad) {
        await loadDetailData(row, rowKey);
      }
      return;
    }

    if (expandMode === "sidebar") {
      setSelectedRow(row);
      setShowSidebar(true);
      if (onDetailLoad) {
        await loadDetailData(row, rowKey);
      }
      return;
    }

    // Inline mode
    if (newExpanded.has(rowKey)) {
      newExpanded.delete(rowKey);
    } else {
      newExpanded.add(rowKey);
      if (onDetailLoad && !detailData[rowKey]) {
        await loadDetailData(row, rowKey);
      }
    }

    setExpandedRows(newExpanded);
  };

  const loadDetailData = async (
    row: Record<string, unknown>,
    rowKey: string,
  ) => {
    if (!onDetailLoad) return;

    setLoadingDetails((prev) => new Set(prev).add(rowKey));

    try {
      const data = await onDetailLoad(row);
      setDetailData((prev) => ({ ...prev, [rowKey]: data }));
    } catch (error) {
      console.error("Error loading detail data:", error);
    } finally {
      setLoadingDetails((prev) => {
        const newSet = new Set(prev);
        newSet.delete(rowKey);
        return newSet;
      });
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedRow(null);
  };

  const closeSidebar = () => {
    setShowSidebar(false);
    setSelectedRow(null);
  };

  // Enhanced master columns with expand button
  const enhancedMasterColumns: TableColumn[] = [
    {
      key: "_expand",
      label: "",
      width: "50px",
      render: (_, row: Record<string, unknown>, index: number) => {
        const rowKey = getRowKey(row, index);
        const isExpanded = expandedRows.has(rowKey);
        const isLoading = loadingDetails.has(rowKey);

        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded(row, index);
            }}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            title={
              expandMode === "inline"
                ? isExpanded
                  ? "Contraer"
                  : "Expandir"
                : "Ver detalles"
            }
          >
            {isLoading ? (
              <LoadingSpinner size="sm" />
            ) : expandMode === "inline" ? (
              isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        );
      },
    },
    ...masterColumns,
  ];

  const renderDetailContent = (
    row: Record<string, unknown>,
    rowKey?: string,
  ) => {
    if (onDetailLoad && rowKey) {
      const data = detailData[rowKey];
      if (!data && loadingDetails.has(rowKey)) {
        return (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner size="lg" />
          </div>
        );
      }
      return detailRenderer(data || row);
    }
    return detailRenderer(row);
  };

  return (
    <div className={clsx("space-y-4", className)}>
      {/* Master Table */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">{masterTitle}</h3>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-white">
                <tr>
                  {enhancedMasterColumns.map((column) => (
                    <th
                      key={column.key}
                      className={clsx(
                        "px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider",
                        column.align === "center" && "text-center",
                        column.align === "right" && "text-right",
                      )}
                      style={{ width: column.width }}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="bg-white divide-y divide-gray-200">
                {masterData.map((row, index) => {
                  const rowKey = getRowKey(row, index);
                  const isExpanded = expandedRows.has(rowKey);

                  return (
                    <React.Fragment key={rowKey}>
                      {/* Master Row */}
                      <tr className="hover:bg-gray-50">
                        {enhancedMasterColumns.map((column) => (
                          <td
                            key={column.key}
                            className={clsx(
                              "px-6 py-4 whitespace-nowrap text-sm text-gray-900",
                              column.align === "center" && "text-center",
                              column.align === "right" && "text-right",
                            )}
                          >
                            {column.render
                              ? column.render(row[column.key], row, index)
                              : column.format
                                ? column.format(row[column.key])
                                : row[column.key]?.toString() || ""}
                          </td>
                        ))}
                      </tr>

                      {/* Inline Detail Row */}
                      {expandMode === "inline" && isExpanded && (
                        <tr>
                          <td
                            colSpan={enhancedMasterColumns.length}
                            className="px-6 py-4 bg-gray-50"
                          >
                            <div className="border border-gray-200 rounded-lg bg-white p-4">
                              <h4 className="text-md font-medium text-gray-900 mb-3">
                                {detailTitle}
                              </h4>
                              {renderDetailContent(row, rowKey)}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal Detail View */}
      {expandMode === "modal" && showModal && selectedRow && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
              onClick={closeModal}
            />

            <div className="inline-block w-full max-w-4xl p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  {detailTitle}
                </h3>
                <button
                  onClick={closeModal}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-md"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {renderDetailContent(selectedRow, getRowKey(selectedRow, 0))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar Detail View */}
      {expandMode === "sidebar" && showSidebar && selectedRow && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
              <div className="w-screen max-w-md">
                <div className="flex flex-col h-full bg-white shadow-xl">
                  <div className="px-4 py-6 bg-gray-50 sm:px-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-medium text-gray-900">
                        {detailTitle}
                      </h2>
                      <button
                        onClick={closeSidebar}
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-md"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 px-4 py-6 overflow-y-auto sm:px-6">
                    {renderDetailContent(
                      selectedRow,
                      getRowKey(selectedRow, 0),
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterDetailView;
