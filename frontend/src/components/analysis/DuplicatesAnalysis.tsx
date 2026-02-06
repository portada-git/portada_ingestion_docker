import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Search, Download, Filter } from "lucide-react";
import { useNotificationStore } from "../../store/useStore";
import { apiService } from "../../services/api";
import MasterDetailView from "../results/MasterDetailView";
import DataTable, { TableColumn } from "../results/DataTable";
import DateRangePicker from "../forms/DateRangePicker";
import PublicationSelector from "../PublicationSelector";
import LoadingSpinner from "../LoadingSpinner";

interface DuplicateMetadata extends Record<string, unknown> {
  log_id: string;
  date: string;
  edition: string;
  publication: string;
  uploaded_by: string;
  duplicate_count: number;
  duplicates_filter: string;
  duplicate_ids: string[];
}

interface DuplicateRecord extends Record<string, unknown> {
  id: string;
  title: string;
  date: string;
  publication: string;
  duplicate_group: string;
  similarity_score?: number;
  content_preview?: string;
}

interface DuplicateDetail {
  log_id: string;
  metadata: DuplicateMetadata;
  duplicate_records: DuplicateRecord[];
  total_records: number;
}

const DuplicatesAnalysis: React.FC = () => {
  const { t } = useTranslation();
  const { addNotification } = useNotificationStore();
  const [isLoading, setIsLoading] = useState(false);
  const [masterData, setMasterData] = useState<DuplicateMetadata[]>([]);
  const [filters, setFilters] = useState({
    user: "",
    publication: "",
    startDate: "",
    endDate: "",
  });

  const loadDuplicatesMetadata = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.getDuplicatesMetadata({
        user: filters.user || undefined,
        publication: filters.publication || undefined,
        start_date: filters.startDate || undefined,
        end_date: filters.endDate || undefined,
      });
      setMasterData((response as any).duplicates || []);

      addNotification({
        type: "success",
        title: t("analysis.duplicates.dataLoaded"),
        message: t("analysis.duplicates.foundRecords", {
          count: (response as any).duplicates?.length || 0,
        }),
      });
    } catch (error) {
      addNotification({
        type: "error",
        title: t("analysis.duplicates.loadError"),
        message:
          error instanceof Error ? error.message : t("common.unknownError"),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadDuplicateDetails = async (
    masterRow: Record<string, unknown>,
  ): Promise<DuplicateDetail> => {
    try {
      const logId = String(masterRow.log_id);
      const response = await apiService.getDuplicateDetails(logId);
      return response as DuplicateDetail;
    } catch (error) {
      addNotification({
        type: "error",
        title: t("analysis.duplicates.detailError"),
        message:
          error instanceof Error ? error.message : t("common.unknownError"),
      });
      throw error;
    }
  };

  const handleFilterChange = (field: string, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const applyFilters = () => {
    loadDuplicatesMetadata();
  };

  const handleExportMaster = () => {
    if (masterData.length === 0) return;

    const csvContent = [
      "Log ID,Date,Edition,Publication,Uploaded By,Duplicate Count,Filter",
      ...masterData.map(
        (item) =>
          `${item.log_id},${item.date},${item.edition},${item.publication},${item.uploaded_by},${item.duplicate_count},"${item.duplicates_filter}"`,
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `duplicates_metadata_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportDetails = (detailData: DuplicateDetail) => {
    const detail = detailData;
    if (!detail.duplicate_records || detail.duplicate_records.length === 0)
      return;

    const csvContent = [
      "ID,Title,Date,Publication,Duplicate Group,Similarity Score,Preview",
      ...detail.duplicate_records.map(
        (record) =>
          `${record.id},"${record.title}",${record.date},${record.publication},${record.duplicate_group},${record.similarity_score || ""},"${record.content_preview || ""}"`,
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `duplicates_details_${detail.log_id}_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const masterColumns: TableColumn[] = [
    {
      key: "log_id",
      label: t("analysis.duplicates.logId"),
      width: "200px",
      filterable: true,
      render: (value: unknown) => (
        <span className="font-mono text-xs text-gray-700">
          {String(value).substring(0, 8)}...
        </span>
      ),
    },
    {
      key: "date",
      label: t("analysis.duplicates.date"),
      sortable: true,
      width: "120px",
      format: (value: unknown) => {
        if (typeof value === "string") {
          return value;
        }
        return String(value);
      },
    },
    {
      key: "edition",
      label: t("analysis.duplicates.edition"),
      align: "center" as const,
      width: "100px",
      render: (value: unknown) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          {String(value)}
        </span>
      ),
    },
    {
      key: "publication",
      label: t("analysis.duplicates.publication"),
      sortable: true,
      filterable: true,
      width: "120px",
      format: (value: unknown) => String(value).toUpperCase(),
    },
    {
      key: "uploaded_by",
      label: t("analysis.duplicates.uploadedBy"),
      sortable: true,
      filterable: true,
      width: "150px",
      render: (value: unknown) => (
        <span className="text-sm text-gray-700">{String(value)}</span>
      ),
    },
    {
      key: "duplicate_count",
      label: t("analysis.duplicates.count"),
      align: "center" as const,
      sortable: true,
      width: "100px",
      render: (value: unknown) => {
        const count = Number(value);
        if (isNaN(count) || count <= 0) return <span>-</span>;

        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-amber-100 text-amber-800">
            {count}
          </span>
        );
      },
    },
    {
      key: "duplicates_filter",
      label: t("analysis.duplicates.appliedFilter"),
      render: (value: unknown) => (
        <span
          className="text-xs text-gray-600 max-w-xs truncate block"
          title={String(value)}
        >
          {String(value) || t("analysis.duplicates.noFilter")}
        </span>
      ),
    },
  ];

  const detailColumns: TableColumn[] = [
    {
      key: "id",
      label: "ID",
      width: "100px",
    },
    {
      key: "title",
      label: t("analysis.duplicates.title"),
      render: (value: unknown) => (
        <div className="max-w-xs">
          <p
            className="text-sm font-medium text-gray-900 truncate"
            title={String(value)}
          >
            {String(value)}
          </p>
        </div>
      ),
    },
    {
      key: "date",
      label: t("analysis.duplicates.date"),
      sortable: true,
      format: (value: unknown) => {
        if (typeof value === "string") {
          return new Date(value).toLocaleDateString();
        }
        return String(value);
      },
    },
    {
      key: "publication",
      label: t("analysis.duplicates.publication"),
      format: (value: unknown) => String(value).toUpperCase(),
    },
    {
      key: "duplicate_group",
      label: t("analysis.duplicates.group"),
      render: (value: unknown) => (
        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">
          {String(value)}
        </span>
      ),
    },
    {
      key: "similarity_score",
      label: t("analysis.duplicates.similarity"),
      align: "center" as const,
      render: (value: unknown) => {
        if (value && typeof value === "number") {
          const score = Math.round(value * 100);
          return (
            <span
              className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                score >= 90
                  ? "bg-red-100 text-red-800"
                  : score >= 70
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-green-100 text-green-800"
              }`}
            >
              {score}%
            </span>
          );
        }
        return "-";
      },
    },
    {
      key: "content_preview",
      label: t("analysis.duplicates.preview"),
      render: (value: unknown) => (
        <div className="max-w-xs">
          <p className="text-xs text-gray-600 truncate" title={String(value)}>
            {String(value) || t("analysis.duplicates.notAvailable")}
          </p>
        </div>
      ),
    },
  ];

  const renderDetailView = (detailData: DuplicateDetail) => {
    const detail = detailData;

    if (!detail || !detail.duplicate_records) {
      return (
        <div className="text-center py-8">
          <p className="text-gray-500">
            {t("analysis.duplicates.noDetailRecords")}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-lg font-medium text-gray-900">
              {t("analysis.duplicates.detailTitle")}
            </h4>
            <p className="text-sm text-gray-600">
              {t("analysis.duplicates.foundRecords", {
                count: detail.total_records,
              })}
            </p>
          </div>

          <button
            onClick={() => handleExportDetails(detail)}
            className="btn btn-secondary btn-sm"
          >
            <Download className="w-4 h-4 mr-2" />
            {t("common.export")}
          </button>
        </div>

        <DataTable
          columns={detailColumns}
          data={detail.duplicate_records}
          emptyMessage={t("analysis.duplicates.noDetailRecords")}
        />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t("analysis.duplicates.title")}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          {t("analysis.duplicates.subtitle")}
        </p>
      </div>

      {/* Filters */}
      <div className="card">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          <Filter className="w-5 h-5 inline mr-2" />
          {t("common.searchFilters")}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label
              htmlFor="user"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              {t("common.user")}
            </label>
            <input
              type="text"
              id="user"
              value={filters.user}
              onChange={(e) => handleFilterChange("user", e.target.value)}
              className="input"
              placeholder={t("common.usernamePlaceholder")}
            />
          </div>

          <div>
            <label
              htmlFor="publication"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              {t("common.publication")}
            </label>
            <PublicationSelector
              value={filters.publication}
              onChange={(value) => handleFilterChange("publication", value)}
              placeholder={t("common.allPublications")}
              includeAll={true}
              allLabel={t("common.allPublications")}
            />
          </div>

          <DateRangePicker
            value={{ startDate: filters.startDate, endDate: filters.endDate }}
            onChange={(range) => {
              handleFilterChange("startDate", range?.startDate || "");
              handleFilterChange("endDate", range?.endDate || "");
            }}
            label={t("common.dateRange")}
          />

          <div className="flex items-end space-x-2">
            <button
              onClick={applyFilters}
              disabled={isLoading}
              className="btn btn-primary flex-1"
            >
              {isLoading ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  {t("common.searching")}
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  {t("common.search")}
                </>
              )}
            </button>

            {masterData.length > 0 && (
              <button
                onClick={handleExportMaster}
                className="btn btn-secondary"
                title={t("analysis.duplicates.exportMasterList")}
              >
                <Download className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Master-Detail View */}
      {masterData.length > 0 ? (
        <MasterDetailView
          masterData={masterData as Record<string, unknown>[]}
          masterColumns={masterColumns}
          detailRenderer={(detailData: Record<string, unknown>) =>
            renderDetailView(detailData as unknown as DuplicateDetail)
          }
          onDetailLoad={async (masterRow: Record<string, unknown>) => {
            const result = await loadDuplicateDetails(masterRow);
            return result as unknown as Record<string, unknown>;
          }}
          masterTitle={t("analysis.duplicates.masterTitle")}
          detailTitle={t("analysis.duplicates.detailTitle")}
          expandMode="inline"
          loading={isLoading}
        />
      ) : !isLoading ? (
        <div className="card">
          <div className="text-center py-12">
            <Copy className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {t("analysis.duplicates.noData")}
            </h3>
            <p className="text-gray-600 mb-4">
              {t("analysis.duplicates.useFilters")}
            </p>
            <button onClick={applyFilters} className="btn btn-primary">
              <Search className="w-4 h-4 mr-2" />
              {t("analysis.duplicates.searchDuplicates")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DuplicatesAnalysis;
