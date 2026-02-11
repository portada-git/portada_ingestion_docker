/**
 * Duplicates Analysis View
 * Modern implementation with enhanced empty states and internationalization
 */

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Search, X, Download } from "lucide-react";
import { apiService } from "../services/api";
import { withErrorHandling } from "../utils/apiErrorHandler";
import { DuplicatesResponse } from "../types";
import AnalysisCard from "../components/AnalysisCard";
import QueryForm from "../components/QueryForm";
import PublicationSelector from "../components/PublicationSelector";
import { ResultsCard, InfoMessage } from "../components/ResultsCard";
import {
  NoDataState,
  NoDuplicatesState,
  SearchState,
} from "../components/EmptyStateCard";

const DuplicatesView: React.FC = () => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<DuplicatesResponse | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedDuplicate, setSelectedDuplicate] = useState<any>(null);
  const [duplicateDetails, setDuplicateDetails] = useState<string[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [formData, setFormData] = useState({
    publication: "",
    start_date: "",
    end_date: "",
  });

  const handlePublicationChange = (value: string) => {
    setFormData((prev) => ({ ...prev, publication: value }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setHasSearched(true);

    const result = await withErrorHandling(async () => {
      return await apiService.getDuplicates({
        publication: formData.publication || undefined,
        start_date: formData.start_date || undefined,
        end_date: formData.end_date || undefined,
      });
    });

    if (result) {
      setResults(result);
    }

    setIsLoading(false);
  };

  const handleRowClick = async (duplicate: any) => {
    setSelectedDuplicate(duplicate);
    setIsLoadingDetails(true);
    
    const details = await withErrorHandling(async () => {
      return await apiService.getDuplicateDetails(duplicate.duplicates_filter);
    });

    if (details && Array.isArray(details)) {
      // Backend returns array of {parsed_text: string}
      setDuplicateDetails(details.map((item: any) => item.parsed_text || ''));
    }
    
    setIsLoadingDetails(false);
  };

  const closeDetails = () => {
    setSelectedDuplicate(null);
    setDuplicateDetails([]);
  };

  const downloadDetailsCSV = () => {
    if (!selectedDuplicate || duplicateDetails.length === 0) return;

    // Generar nombre del archivo
    const date = selectedDuplicate.date;
    const edition = selectedDuplicate.edition.toUpperCase();
    const publication = selectedDuplicate.publication.toUpperCase();
    const total = duplicateDetails.length;
    const fileName = `detalles_duplicados_${publication}_${edition}_${date}_total_${total}.csv`;

    // Crear contenido CSV
    const headers = ["Número", "Texto"];
    const csvContent = [
      headers.join(","),
      ...duplicateDetails.map((text, index) => {
        // Escapar comillas y saltos de línea en el texto
        const escapedText = `"${text.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        return `${index + 1},${escapedText}`;
      }),
    ].join("\n");

    // Crear blob y descargar
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadCSV = () => {
    if (!results || results.duplicates.length === 0) return;

    // Generar nombre del archivo
    const publication = formData.publication ? formData.publication.toUpperCase() : "TODAS";
    const startDate = formData.start_date || "inicio";
    const endDate = formData.end_date || "fin";
    const total = results.total_duplicates;
    const fileName = `duplicados_${publication}_${startDate}_${endDate}_total_${total}.csv`;

    // Crear contenido CSV
    const headers = ["Fecha", "Edición", "Publicación", "Cantidad"];
    const csvContent = [
      headers.join(","),
      ...results.duplicates.map((duplicate) => {
        return [
          duplicate.date,
          duplicate.edition,
          duplicate.publication.toUpperCase(),
          duplicate.duplicate_count,
        ].join(",");
      }),
    ].join("\n");

    // Crear blob y descargar
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderEmptyState = () => {
    // If we haven't searched yet, show the initial search state
    if (!hasSearched) {
      return (
        <SearchState
          title={t("analysis.duplicates.emptyStateTitle")}
          description={t("analysis.duplicates.emptyStateDescription")}
          actionText={t("analysis.duplicates.queryDuplicates")}
          onAction={() => {
            // Trigger the form submission
            const form = document.querySelector("form");
            if (form) {
              form.requestSubmit();
            }
          }}
        />
      );
    }

    // If we searched and got results but no duplicates, show success state
    if (results && results.duplicates.length === 0) {
      // Check if this might be because no data has been processed
      // We can infer this if total_duplicates is 0 and no filters were applied
      const noFiltersApplied = !formData.publication;

      if (noFiltersApplied) {
        return (
          <NoDataState
            title={t("analysis.duplicates.noDataTitle")}
            description={t("analysis.duplicates.noDataDescription")}
            actionText={t("analysis.duplicates.noDataAction")}
            actionPath="/ingestion"
          />
        );
      } else {
        return (
          <NoDuplicatesState
            title={t("analysis.duplicates.noDuplicatesTitle")}
            description={t("analysis.duplicates.noDuplicatesDescription")}
          />
        );
      }
    }

    return null;
  };

  return (
    <div className="space-y-6">
      <AnalysisCard
        title={t("analysis.duplicates.title")}
        subtitle={t("analysis.duplicates.description")}
        icon={Copy}
      >
        <QueryForm
          onSubmit={handleSubmit}
          submitText={t("analysis.duplicates.queryDuplicates")}
          isLoading={isLoading}
          submitColor="orange"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t("analysis.duplicates.publication")}
              </label>
              <PublicationSelector
                value={formData.publication}
                onChange={handlePublicationChange}
                placeholder={t("analysis.duplicates.allPublications")}
                includeAll={true}
                allLabel={t("analysis.duplicates.allPublications")}
                className="md:col-span-2"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t("analysis.duplicates.startDate")} ({t("common.optional")})
                </label>
                <input
                  type="date"
                  name="start_date"
                  value={formData.start_date}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t("analysis.duplicates.endDate")} ({t("common.optional")})
                </label>
                <input
                  type="date"
                  name="end_date"
                  value={formData.end_date}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </QueryForm>
      </AnalysisCard>

      {/* Results */}
      {results && results.duplicates.length > 0 ? (
        <ResultsCard title={t("analysis.duplicates.results")}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-slate-400">
                {results.total_duplicates}{" "}
                {t("analysis.duplicates.duplicatesFound")}
              </p>
              <div className="flex items-center space-x-4">
                <button
                  onClick={downloadCSV}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar CSV</span>
                </button>
                <div className="flex items-center space-x-2 text-sm text-slate-500">
                  <div className="flex items-center space-x-2">
                    <Search className="w-4 h-4" />
                    <span>
                      {formData.publication
                        ? `${t("analysis.duplicates.publication")}: ${formData.publication.toUpperCase()}`
                        : t("analysis.duplicates.allPublications")}
                    </span>
                  </div>
                  {(formData.start_date || formData.end_date) && (
                    <span className="text-slate-400">
                      {formData.start_date && `Desde: ${formData.start_date}`}
                      {formData.start_date && formData.end_date && " • "}
                      {formData.end_date && `Hasta: ${formData.end_date}`}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-600">
                <thead className="bg-slate-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-200 uppercase tracking-wider">
                      {t("analysis.duplicates.date")}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-200 uppercase tracking-wider">
                      {t("analysis.duplicates.edition")}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-200 uppercase tracking-wider">
                      {t("analysis.duplicates.publication")}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-200 uppercase tracking-wider">
                      {t("analysis.duplicates.count")}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {results.duplicates.map((duplicate, index) => (
                    <tr
                      key={index}
                      onClick={() => handleRowClick(duplicate)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-slate-900">
                        {new Date(duplicate.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-900 uppercase">
                        {duplicate.edition}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-900">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {duplicate.publication.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                          {duplicate.duplicate_count}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </ResultsCard>
      ) : (
        renderEmptyState()
      )}

      {/* Details Modal */}
      {selectedDuplicate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-700 flex-shrink-0">
              <div>
                <h3 className="text-xl font-semibold text-white">
                  {t("analysis.duplicates.details")}
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  {new Date(selectedDuplicate.date).toLocaleDateString()} • {selectedDuplicate.edition.toUpperCase()} • {selectedDuplicate.publication.toUpperCase()} • {selectedDuplicate.duplicate_count} {t("analysis.duplicates.duplicatesFound")}
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={downloadDetailsCSV}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                  disabled={isLoadingDetails || duplicateDetails.length === 0}
                >
                  <Download className="w-4 h-4" />
                  <span>CSV</span>
                </button>
                <button
                  onClick={closeDetails}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {isLoadingDetails ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
                </div>
              ) : (
                <div className="space-y-4">
                  {duplicateDetails.length > 0 ? (
                    duplicateDetails.map((text, index) => (
                      <div key={index} className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider">
                            {t("analysis.duplicates.duplicate")} #{index + 1}
                          </span>
                        </div>
                        <p className="text-slate-200 text-sm leading-relaxed">{text}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-400 text-center py-8">
                      {t("analysis.duplicates.noDetails")}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <InfoMessage message={t("analysis.duplicates.info")} />
    </div>
  );
};

export default DuplicatesView;
