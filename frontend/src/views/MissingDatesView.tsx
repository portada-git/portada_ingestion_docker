/**
 * Missing Dates Analysis View
 * Modern implementation with enhanced empty states and internationalization
 */

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Calendar, Search, Bug, ChevronDown, ChevronUp } from "lucide-react";
import { apiService } from "../services/api";
import { withErrorHandling } from "../utils/apiErrorHandler";
import AnalysisCard from "../components/AnalysisCard";
import QueryForm from "../components/QueryForm";
import PublicationSelector from "../components/PublicationSelector";
import { SelectField, InputField } from "../components/FormField";
import { ResultsCard, InfoMessage } from "../components/ResultsCard";
import { NoDuplicatesState, SearchState } from "../components/EmptyStateCard";

interface MissingDateEntry {
  date: string;
  edition: string;
  gap_duration?: string;
}

interface MissingDatesResponse {
  publication_name: string;
  query_type: string;
  missing_dates: MissingDateEntry[];
  total_missing: number;
  debug_info?: {
    requested_publication: string;
    start_date?: string;
    end_date?: string;
    has_file_list: boolean;
    data_path: string;
    engine: string;
    [key: string]: any;
  };
}

const TechnicalDebugSection: React.FC<{
  info?: MissingDatesResponse["debug_info"];
  queryType?: string;
}> = ({ info, queryType }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!info) return null;

  return (
    <div className="mt-4 border border-amber-200 bg-amber-50 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 text-amber-800 font-medium text-sm hover:bg-amber-100 transition-colors"
      >
        <div className="flex items-center">
          <Bug className="w-4 h-4 mr-2" />
          <span>Información de depuración (Technical Debug)</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>

      {isOpen && (
        <div className="p-4 bg-white border-t border-amber-200 text-xs font-mono space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="text-gray-500">Query Type:</div>
            <div className="font-bold">{queryType || "N/A"}</div>

            <div className="text-gray-500">Publication:</div>
            <div className="font-bold">{info.requested_publication}</div>

            <div className="text-gray-500">Start Date:</div>
            <div className="font-bold">{info.start_date || "None"}</div>

            <div className="text-gray-500">End Date:</div>
            <div className="font-bold">{info.end_date || "None"}</div>

            <div className="text-gray-500">Has File List:</div>
            <div className="font-bold">{info.has_file_list ? "Yes" : "No"}</div>

            <div className="text-gray-500">Data Path:</div>
            <div className="font-bold">{info.data_path}</div>

            <div className="text-gray-500">Engine:</div>
            <div className="font-bold">{info.engine}</div>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-100 text-[10px] text-gray-400">
            * 200 OK significa que la comunicación fue exitosa, pero la librería
            no encontró huecos con estos parámetros.
          </div>
        </div>
      )}
    </div>
  );
};

const MissingDatesView: React.FC = () => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<MissingDatesResponse | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [datesFile, setDatesFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    publication: "",
    queryMethod: "date_range",
    startDate: "1820-01-01",
    endDate: "1950-12-31",
  });

  const queryMethods = [
    { value: "date_range", label: t("analysis.missingDates.dateRange") },
    { value: "file_list", label: t("analysis.missingDates.fileList") },
  ];

  const handleQueryMethodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, queryMethod: e.target.value }));
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, startDate: e.target.value }));
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, endDate: e.target.value }));
  };

  const handlePublicationChange = (value: string) => {
    setFormData((prev) => ({ ...prev, publication: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setDatesFile(e.target.files[0]);
    }
  };

  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.publication) return;

    setIsLoading(true);
    setHasSearched(true);

    let fileContent: string | undefined = undefined;
    if (formData.queryMethod === "file_list" && datesFile) {
      try {
        fileContent = await readFileContent(datesFile);
      } catch (error) {
        console.error("Error reading file:", error);
      }
    }

    const result = await withErrorHandling(async () => {
      return await apiService.getMissingDates({
        publication_name: formData.publication,
        start_date:
          formData.queryMethod === "date_range"
            ? formData.startDate || undefined
            : undefined,
        end_date:
          formData.queryMethod === "date_range"
            ? formData.endDate || undefined
            : undefined,
        date_and_edition_list: fileContent,
      });
    });

    if (result) {
      setResults(result);
    }

    setIsLoading(false);
  };

  const renderEmptyState = () => {
    // If no publication is selected, show selection state
    if (!formData.publication) {
      return (
        <SearchState
          title={t("analysis.missingDates.emptyStateTitle")}
          description={t("analysis.missingDates.emptyStateDescription")}
        />
      );
    }

    // If we haven't searched yet, don't show anything
    if (!hasSearched) {
      return null;
    }

    // If we searched and got results but no missing dates, show success state
    if (results && results.missing_dates.length === 0) {
      return (
        <NoDuplicatesState
          title={t("analysis.missingDates.noResultsTitle")}
          description={t("analysis.missingDates.noResultsDescription")}
        />
      );
    }

    return null;
  };

  return (
    <div className="space-y-6">
      <AnalysisCard
        title={t("analysis.missingDates.title")}
        subtitle={t("analysis.missingDates.subtitle")}
        icon={Calendar}
      >
        <QueryForm
          onSubmit={handleSubmit}
          submitText={t("analysis.missingDates.executeQuery")}
          isLoading={isLoading}
          disabled={!formData.publication}
          submitColor="blue"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t("analysis.missingDates.publication")}
              </label>
              <PublicationSelector
                value={formData.publication}
                onChange={handlePublicationChange}
                placeholder={t("analysis.missingDates.selectPublication")}
                includeAll={false}
                required
              />
            </div>

            <SelectField
              label={t("analysis.missingDates.queryMethod")}
              name="queryMethod"
              value={formData.queryMethod}
              onChange={handleQueryMethodChange}
              options={queryMethods}
            />

            {formData.queryMethod === "date_range" && (
              <>
                <InputField
                  label={t("analysis.missingDates.startDate")}
                  description={t("analysis.missingDates.startDateOptional")}
                  name="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={handleStartDateChange}
                  min="1820-01-01"
                  max="1950-12-31"
                />

                <InputField
                  label={t("analysis.missingDates.endDate")}
                  description={t("analysis.missingDates.endDateOptional")}
                  name="endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={handleEndDateChange}
                  min="1820-01-01"
                  max="1950-12-31"
                />
              </>
            )}

            {formData.queryMethod === "file_list" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t("analysis.missingDates.fileList")}
                  </label>
                  <input
                    type="file"
                    accept=".yaml,.yml,.json,.txt"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-gray-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-full file:border-0
                      file:text-sm file:font-semibold
                      file:bg-blue-50 file:text-blue-700
                      hover:file:bg-blue-100"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {t("analysis.missingDates.fileListDesc")}
                  </p>
                </div>
              </div>
            )}
          </div>
        </QueryForm>
      </AnalysisCard>

      {/* Results */}
      {results && results.missing_dates.length > 0 ? (
        <ResultsCard title={t("analysis.missingDates.results")}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <InfoMessage
                message={t("analysis.missingDates.totalMissing", {
                  count: results.total_missing,
                })}
                type="info"
                className="flex-1"
              />
              <div className="flex items-center space-x-2 text-sm text-slate-500 ml-4">
                <Search className="w-4 h-4" />
                <span>
                  {t("analysis.missingDates.publication")}:{" "}
                  {formData.publication.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[600px] overflow-y-auto shadow-sm">
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 font-semibold text-slate-900">
                      {t("analysis.missingDates.date")}
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-900">
                      {t("analysis.missingDates.edition")}
                    </th>
                    {results.missing_dates.some((d) => d.gap_duration) && (
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">
                        {t("analysis.missingDates.duration")}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {results.missing_dates.map((entry, index) => (
                    <tr
                      key={index}
                      className="border-b border-slate-100 hover:bg-slate-50"
                    >
                      <td className="py-3 px-4 text-slate-700 font-mono text-sm">
                        {entry.date}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {entry.edition}
                        </span>
                      </td>
                      {entry.gap_duration && (
                        <td className="py-3 px-4 text-slate-700">
                          {entry.gap_duration}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <TechnicalDebugSection
            info={results.debug_info}
            queryType={results.query_type}
          />
        </ResultsCard>
      ) : (
        <>
          {renderEmptyState()}
          {results && results.missing_dates.length === 0 && (
            <div className="max-w-4xl mx-auto">
              <TechnicalDebugSection
                info={results.debug_info}
                queryType={results.query_type}
              />
            </div>
          )}
        </>
      )}

      <InfoMessage message={t("analysis.missingDates.info")} />
    </div>
  );
};

export default MissingDatesView;
