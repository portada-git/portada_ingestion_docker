/**
 * Process Metadata Analysis View
 * Modern implementation with dark theme and internationalization
 * Updated to use new /api/metadata/process endpoint
 */

import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Settings } from "lucide-react";
import { apiService } from "../services/api";
import { withErrorHandling } from "../utils/apiErrorHandler";
import { Publication } from "../types";
import AnalysisCard from "../components/AnalysisCard";
import QueryForm from "../components/QueryForm";
import { SelectField } from "../components/FormField";
import {
  ResultsCard,
  InfoMessage,
  EmptyState,
} from "../components/ResultsCard";

interface ProcessMetadataItem {
  process_log_id: string;
  publication_name: string;
  processed_at: string;
  records_processed: number;
  status: string;
}

interface ProcessMetadataResponse {
  process_metadata: ProcessMetadataItem[];
  total_count: number;
}

const ProcessMetadataView: React.FC = () => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<ProcessMetadataResponse | null>(null);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [formData, setFormData] = useState({
    publication: "",
  });

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
  }, []);

  const publicationOptions = [
    {
      value: "",
      label:
        t("configuration.processMetadata.allPublications") ||
        "All Publications",
    },
    ...publications.map((pub) => ({
      value: pub.code,
      label: pub.name || pub.code,
    })),
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsLoading(true);

    const result = await withErrorHandling(async () => {
      return await apiService.getProcessMetadata({
        publication: formData.publication || undefined,
      });
    });

    if (result) {
      setResults(result as ProcessMetadataResponse);
    }

    setIsLoading(false);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
      case "success":
        return "bg-green-100 text-green-800 border border-green-200";
      case "running":
      case "processing":
        return "bg-blue-100 text-blue-800 border border-blue-200";
      case "failed":
      case "error":
        return "bg-red-100 text-red-800 border border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border border-gray-200";
    }
  };

  return (
    <div className="space-y-6">
      <AnalysisCard
        title={t("configuration.processMetadata.title")}
        subtitle={t("configuration.processMetadata.subtitle")}
        icon={Settings}
      >
        <QueryForm
          onSubmit={handleSubmit}
          submitText={t("configuration.processMetadata.queryProcesses")}
          isLoading={isLoading}
          submitColor="purple"
        >
          <SelectField
            label={
              t("configuration.processMetadata.publication") || "Publication"
            }
            description={
              t("configuration.processMetadata.publicationDesc") ||
              "Filter by publication name"
            }
            name="publication"
            value={formData.publication}
            onChange={handleInputChange}
            options={publicationOptions}
            className="md:col-span-2"
          />
        </QueryForm>
      </AnalysisCard>

      {/* Results */}
      {results && (
        <ResultsCard title={t("configuration.processMetadata.results")}>
          {!results.process_metadata ||
          results.process_metadata.length === 0 ? (
            <EmptyState
              message={t("configuration.processMetadata.noResults")}
            />
          ) : (
            <div className="space-y-4">
              <InfoMessage
                message={`Total de procesos encontrados: ${results.total_count}`}
                type="success"
              />

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">
                        Process Log ID
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">
                        Publicación
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">
                        Estado
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">
                        Registros Procesados
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">
                        Fecha de Procesamiento
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {results.process_metadata.map((process, index) => (
                      <tr
                        key={index}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="py-3 px-4 text-slate-700 font-mono text-xs">
                          {process.process_log_id.substring(0, 8)}...
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-medium">
                          {process.publication_name}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(process.status)}`}
                          >
                            {process.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-mono">
                          {process.records_processed.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-slate-700 text-sm">
                          {new Date(process.processed_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </ResultsCard>
      )}

      {/* Info Message */}
      <InfoMessage
        message={t("configuration.processMetadata.infoMessage")}
        type="info"
      />
    </div>
  );
};

export default ProcessMetadataView;
