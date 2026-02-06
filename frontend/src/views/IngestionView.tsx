/**
 * Ingestion view component
 * Handles unified file uploads for extraction data and known entities
 * Supports both single and multiple file uploads with internationalization
 */

import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { FileText, Database, AlertCircle, Clock } from "lucide-react";
import { useNotificationStore } from "../store/useStore";
import UnifiedFileUpload from "../components/BulkFileUpload";
import clsx from "clsx";

type IngestionType = "extraction_data" | "known_entities";

const IngestionView: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { addNotification } = useNotificationStore();

  const [selectedType, setSelectedType] = useState<IngestionType>(
    (searchParams.get("type") as IngestionType) || "extraction_data",
  );
  const [formData, setFormData] = useState({
    publication: "",
    entityName: "flag",
    dataPathDeltaLake: "ship_entries",
  });

  const handleTypeChange = (type: IngestionType) => {
    setSelectedType(type);
    setSearchParams({ type });
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleUploadComplete = useCallback(
    (stats: any) => {
      addNotification({
        type: "success",
        title: t("notifications.bulkUploadComplete"),
        message: t("notifications.bulkUploadStats", {
          success: stats.success,
          total: stats.total,
          records: stats.totalRecordsProcessed,
        }),
      });
    },
    [addNotification, t],
  );

  const handleFileProcessed = useCallback((file: any) => {
    // Optional: Handle individual file completion
    console.log("Archivo procesado:", file.file.name);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t("ingestion.title")}
        </h1>
        <p className="mt-1 text-sm text-gray-600">{t("ingestion.subtitle")}</p>
      </div>

      {/* Type Selection */}
      <div className="card">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          {t("ingestion.typeSelection")}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => handleTypeChange("extraction_data")}
            className={clsx(
              "p-4 border-2 rounded-lg text-left transition-colors",
              selectedType === "extraction_data"
                ? "border-primary-500 bg-primary-50"
                : "border-gray-200 hover:border-gray-300",
            )}
          >
            <div className="flex items-center">
              <FileText
                className={clsx(
                  "w-6 h-6 mr-3",
                  selectedType === "extraction_data"
                    ? "text-primary-600"
                    : "text-gray-400",
                )}
              />
              <div>
                <h3 className="font-medium text-gray-900">
                  {t("ingestion.extractionData")}
                </h3>
                <p className="text-sm text-gray-600">
                  {t("ingestion.extractionDataDesc")}
                </p>
              </div>
            </div>
          </button>

          <button
            onClick={() => handleTypeChange("known_entities")}
            className={clsx(
              "p-4 border-2 rounded-lg text-left transition-colors",
              selectedType === "known_entities"
                ? "border-primary-500 bg-primary-50"
                : "border-gray-200 hover:border-gray-300",
            )}
          >
            <div className="flex items-center">
              <Database
                className={clsx(
                  "w-6 h-6 mr-3",
                  selectedType === "known_entities"
                    ? "text-primary-600"
                    : "text-gray-400",
                )}
              />
              <div>
                <h3 className="font-medium text-gray-900">
                  {t("ingestion.knownEntities")}
                </h3>
                <p className="text-sm text-gray-600">
                  {t("ingestion.knownEntitiesDesc")}
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>

      {selectedType === "known_entities" && (
        <div className="card">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            {t("ingestion.entitiesConfig")}
          </h2>
          <div>
            <label
              htmlFor="entityName"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              {t("ingestion.entityName")}
            </label>
            <select
              id="entityName"
              name="entityName"
              value={formData.entityName}
              onChange={handleInputChange}
              className="input"
            >
              <option value="flag">{t("ingestion.entity_flag")}</option>
              <option value="comodity">{t("ingestion.entity_comodity")}</option>
              <option value="ship_type">
                {t("ingestion.entity_ship_type")}
              </option>
              <option value="unit">{t("ingestion.entity_unit")}</option>
              <option value="port">{t("ingestion.entity_port")}</option>
              <option value="master_role">
                {t("ingestion.entity_master_role")}
              </option>
            </select>
          </div>
        </div>
      )}

      {/* Unified File Upload */}
      <div className="card">
        <UnifiedFileUpload
          ingestionType={selectedType}
          publication={
            selectedType === "extraction_data"
              ? formData.publication && formData.publication.trim()
                ? formData.publication
                : undefined
              : undefined
          }
          entityName={
            selectedType === "known_entities" ? formData.entityName : undefined
          }
          maxConcurrentUploads={5}
          onUploadComplete={handleUploadComplete}
          onFileProcessed={handleFileProcessed}
        />
      </div>

      {/* Information */}
      <div className="card">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          {t("ingestion.information")}
        </h2>
        <div className="space-y-3 text-sm text-gray-600">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-yellow-500 mr-2 mt-0.5 flex-shrink-0" />
            <p>{t("ingestion.separateProcesses")}</p>
          </div>
          <div className="flex items-start">
            <Clock className="w-5 h-5 text-blue-500 mr-2 mt-0.5 flex-shrink-0" />
            <p>{t("ingestion.asyncProcessing")}</p>
          </div>
          <div className="flex items-start">
            <FileText className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
            <p>{t("ingestion.temporaryStorage")}</p>
          </div>
          <div className="flex items-start">
            <Database className="w-5 h-5 text-purple-500 mr-2 mt-0.5 flex-shrink-0" />
            <p>{t("ingestion.bulkUpload")}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IngestionView;
