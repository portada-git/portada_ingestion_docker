import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Database,
  Filter,
  Download,
  RefreshCw,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Activity,
} from "lucide-react";
import { apiService } from "../services/api";
import { withErrorHandling } from "../utils/apiErrorHandler";
import { Publication } from "../types";
import AnalysisCard from "../components/AnalysisCard";
import ResultsCard from "../components/ResultsCard";

interface FieldLineage {
  field_name: string;
  source_table: string;
  target_table: string;
  transformation?: string;
  lineage_path: string[];
}

interface StorageMetadataItem {
  log_id: string;
  publication_name?: string;
  table_name: string;
  process_name: string;
  stage: number;
  records_stored: number;
  storage_path: string;
  created_at: string;
  metadata: {
    format: string;
    compression: string;
    schema_version: string;
    partition_columns: string[];
  };
}

interface StorageMetadataResponse {
  storage_records: StorageMetadataItem[];
  total_records: number;
  filters_applied: {
    publication?: string;
    table_name?: string;
    process_name?: string;
    stage?: number;
    start_date?: string;
    end_date?: string;
  };
}

interface FilterState {
  publication: string;
  table_name: string;
  process_name: string;
  stage: string;
  start_date: string;
  end_date: string;
}

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="text-center py-8 text-gray-400">
    <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
    <p>{message}</p>
  </div>
);

const LineageTable: React.FC<{ lineages: FieldLineage[] }> = ({ lineages }) => {
  const { t } = useTranslation();

  if (lineages.length === 0) {
    return (
      <div className="p-4 text-gray-500 italic">
        No field lineage data found for this record.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg overflow-hidden border border-gray-200 m-2 shadow-sm">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 text-gray-500 text-left border-b border-gray-200">
            <th className="py-2 px-3 font-semibold">
              {t("configuration.storageMetadata.fieldName") || "Field Name"}
            </th>
            <th className="py-2 px-3 font-semibold">
              {t("configuration.storageMetadata.source") || "Source"}
            </th>
            <th className="py-2 px-3 font-semibold">
              {t("configuration.storageMetadata.target") || "Target"}
            </th>
            <th className="py-2 px-3 font-semibold">
              {t("configuration.storageMetadata.transformation") || "Transformation"}
            </th>
          </tr>
        </thead>
        <tbody>
          {lineages.map((lineage, idx) => (
            <tr
              key={idx}
              className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
            >
              <td className="py-2 px-3 text-blue-600 font-medium">
                {lineage.field_name}
              </td>
              <td className="py-2 px-3 text-gray-600">
                {lineage.source_table}
              </td>
              <td className="py-2 px-3 text-gray-600">
                {lineage.target_table}
              </td>
              <td className="py-2 px-3 text-green-600 italic">
                {lineage.transformation || "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const StorageMetadataView: React.FC = () => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<StorageMetadataResponse | null>(null);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [lineageData, setLineageData] = useState<
    Record<string, { data: FieldLineage[]; loading: boolean }>
  >({});

  const [filters, setFilters] = useState<FilterState>({
    publication: "",
    table_name: "",
    process_name: "",
    stage: "0", // Default stage 0 as requested
    start_date: "",
    end_date: "",
  });

  const stages = ["0", "1", "2", "3"];

  // Fetch available publications on mount
  useEffect(() => {
    const fetchPublications = async () => {
      const result = await withErrorHandling(async () => {
        return await apiService.getPublications();
      });

      if (result && result.publications) {
        setPublications(result.publications);
      }
    };

    fetchPublications();
    // Load data automatically on mount
    handleSearch();
  }, []);

  const handleSearch = async () => {
    setIsLoading(true);

    const result = await withErrorHandling(async () => {
      const activeFilters: any = {};

      if (filters.publication) activeFilters.publication = filters.publication;
      if (filters.table_name) activeFilters.table_name = filters.table_name;
      if (filters.process_name)
        activeFilters.process_name = filters.process_name;
      if (filters.start_date) activeFilters.start_date = filters.start_date;
      if (filters.end_date) activeFilters.end_date = filters.end_date;

      // Stage is always sent, defaults to 0
      activeFilters.stage = filters.stage ? parseInt(filters.stage) : 0;

      return await apiService.getStorageMetadata(activeFilters);
    });

    if (result) {
      setResults(result as StorageMetadataResponse);
      setExpandedRows(new Set()); // Reset expanded rows on new search
    }

    setIsLoading(false);
  };

  const toggleRow = async (logId: string) => {
    const newExpandedRows = new Set(expandedRows);

    if (newExpandedRows.has(logId)) {
      newExpandedRows.delete(logId);
    } else {
      newExpandedRows.add(logId);

      // Load lineage data if not already loaded
      if (!lineageData[logId]) {
        setLineageData((prev) => ({
          ...prev,
          [logId]: { data: [], loading: true },
        }));

        const result = await withErrorHandling(async () => {
          return await apiService.getFieldLineage(logId);
        });

        if (result && result.field_lineages) {
          setLineageData((prev) => ({
            ...prev,
            [logId]: { data: result.field_lineages, loading: false },
          }));
        } else {
          setLineageData((prev) => ({
            ...prev,
            [logId]: { data: [], loading: false },
          }));
        }
      }
    }

    setExpandedRows(newExpandedRows);
  };

  const handleFilterChange = (field: keyof FilterState, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const clearFilters = () => {
    setFilters({
      publication: "",
      table_name: "",
      process_name: "",
      stage: "0",
      start_date: "",
      end_date: "",
    });
  };

  const exportData = () => {
    if (!results?.storage_records) return;

    const csv = [
      "Log ID,Publication,Table,Process,Stage,Records,Storage Path,Created At",
      ...results.storage_records.map(
        (item) =>
          `"${item.log_id}","${item.publication_name || ""}","${item.table_name}","${item.process_name}",${item.stage},${item.records_stored},"${item.storage_path}","${item.created_at}"`,
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `storage_metadata_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasActiveFilters =
    filters.publication ||
    filters.table_name ||
    filters.process_name ||
    filters.stage !== "0" ||
    filters.start_date ||
    filters.end_date;

  return (
    <div className="space-y-6">
      {/* Header */}
      <AnalysisCard
        title={t("configuration.storageMetadata.title")}
        subtitle={t("configuration.storageMetadata.description")}
        icon={Database}
      />

      {/* Controls */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                showFilters
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              <Filter className="w-4 h-4" />
              {t("common.filters")}
            </button>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-2 px-3 py-2 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
                {t("common.clearFilters")}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSearch}
              disabled={isLoading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-4 py-2 rounded-lg transition-colors font-medium"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              {t("common.search")}
            </button>

            {results?.storage_records && results.storage_records.length > 0 && (
              <button
                onClick={exportData}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors font-medium"
              >
                <Download className="w-4 h-4" />
                {t("common.export")}
              </button>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="border-t border-gray-700 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  {t("common.publication")}
                </label>
                <select
                  value={filters.publication}
                  onChange={(e) =>
                    handleFilterChange("publication", e.target.value)
                  }
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value="">{t("common.all")}</option>
                  {publications.map((pub) => (
                    <option key={pub.name} value={pub.name}>
                      {pub.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  {t("configuration.storageMetadata.tableName")}
                </label>
                <input
                  type="text"
                  value={filters.table_name}
                  onChange={(e) =>
                    handleFilterChange("table_name", e.target.value)
                  }
                  placeholder="e.g. ship_entries"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  {t("configuration.storageMetadata.processName")}
                </label>
                <input
                  type="text"
                  value={filters.process_name}
                  onChange={(e) =>
                    handleFilterChange("process_name", e.target.value)
                  }
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  {t("configuration.storageMetadata.stage")}
                </label>
                <select
                  value={filters.stage}
                  onChange={(e) => handleFilterChange("stage", e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  {stages.map((s) => (
                    <option key={s} value={s}>
                      Stage {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  {t("common.startDate")}
                </label>
                <input
                  type="date"
                  value={filters.start_date}
                  onChange={(e) =>
                    handleFilterChange("start_date", e.target.value)
                  }
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  {t("common.endDate")}
                </label>
                <input
                  type="date"
                  value={filters.end_date}
                  onChange={(e) =>
                    handleFilterChange("end_date", e.target.value)
                  }
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {results && (
        <ResultsCard title={t("configuration.storageMetadata.results")}>
          {results.storage_records.length === 0 ? (
            <EmptyState message={t("configuration.storageMetadata.noData")} />
          ) : (
            <div className="space-y-4">
              <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-blue-600">
                      {results.storage_records.length}
                    </div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
                      {t("configuration.storageMetadata.totalStorageLogs") ||
                        "Total Storage Logs"}
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      {results.storage_records
                        .reduce((sum, item) => sum + item.records_stored, 0)
                        .toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
                      {t("configuration.storageMetadata.totalRecords") ||
                        "Total Records"}
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-600">
                      {
                        new Set(
                          results.storage_records.map(
                            (item) => item.table_name,
                          ),
                        ).size
                      }
                    </div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
                      {t("configuration.storageMetadata.uniqueTables") ||
                        "Unique Tables"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="w-10 py-3 px-4"></th>
                      <th className="text-left py-3 px-4 font-bold text-gray-600 uppercase tracking-tight text-xs">
                        {t("configuration.storageMetadata.table") || "Table"}
                      </th>
                      <th className="text-left py-3 px-4 font-bold text-gray-600 uppercase tracking-tight text-xs">
                        {t("configuration.storageMetadata.process") || "Process"}
                      </th>
                      <th className="text-right py-3 px-4 font-bold text-gray-600 uppercase tracking-tight text-xs">
                        {t("configuration.storageMetadata.records") || "Records"}
                      </th>
                      <th className="text-left py-3 px-4 font-bold text-gray-600 uppercase tracking-tight text-xs">
                        {t("configuration.storageMetadata.storedAt") || "Stored At"}
                      </th>
                      <th className="text-right py-3 px-4 font-bold text-gray-600 uppercase tracking-tight text-xs">
                        {t("configuration.storageMetadata.logId") || "Log ID"}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {results.storage_records.map((item) => (
                      <React.Fragment key={item.log_id}>
                        <tr
                          onClick={() => toggleRow(item.log_id)}
                          className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                        >
                          <td className="py-3 px-4 text-center">
                            {expandedRows.has(item.log_id) ? (
                              <ChevronDown className="w-4 h-4 text-blue-600" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
                            )}
                          </td>
                          <td className="py-3 px-4 font-semibold text-gray-900">
                            {item.table_name || (
                              <span className="text-gray-400 italic">
                                No disponible
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-gray-600 flex items-center gap-2">
                            <Activity className="w-3 h-3 text-blue-400" />
                            {item.process_name}
                          </td>
                          <td className="py-3 px-4 text-right text-green-700 font-mono font-medium">
                            {item.records_stored.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-gray-500 text-xs">
                            {new Date(item.created_at).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200 text-[10px] font-mono font-medium">
                              {item.log_id.substring(0, 8)}...
                            </span>
                          </td>
                        </tr>
                        {expandedRows.has(item.log_id) && (
                          <tr className="bg-gray-50/50">
                            <td colSpan={6} className="py-0 px-4">
                              <div className="pl-6 border-l-2 border-blue-200 my-2">
                                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-2">
                                  {t("configuration.storageMetadata.fieldChanges") ||
                                    "Changes / Field Lineage"}
                                </h4>
                                {lineageData[item.log_id]?.loading ? (
                                  <div className="flex items-center gap-2 text-gray-400 p-4 text-xs italic">
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    Loading transformation logs...
                                  </div>
                                ) : (
                                  <LineageTable
                                    lineages={
                                      lineageData[item.log_id]?.data || []
                                    }
                                  />
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </ResultsCard>
      )}
    </div>
  );
};

export default StorageMetadataView;
