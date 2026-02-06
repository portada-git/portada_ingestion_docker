/**
 * Unified File Upload Component
 * Handles both single and multiple file uploads with batch processing, queue management, and real-time monitoring
 * Integrado con el sistema de monitoreo persistente
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useDropzone } from "react-dropzone";
import { Link, useNavigate } from "react-router-dom";
import {
  FileText,
  X,
  CheckCircle,
  AlertCircle,
  FolderOpen,
  Play,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import { clsx } from "clsx";
import { apiService } from "../services/api";
import { IngestionResponse } from "../types";
import { useUploadIntegration } from "../hooks/useUploadIntegration";

interface FileUploadItem {
  id: string;
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  result?: IngestionResponse;
  error?: string;
  retryCount: number;
  uploadStartTime?: number;
  uploadEndTime?: number;
  uploadId?: string; // ID en el store persistente
}

interface UnifiedFileUploadProps {
  ingestionType: "extraction_data" | "known_entities";
  publication?: string;
  entityName?: string;
  maxConcurrentUploads?: number;
  onUploadComplete?: (stats: any) => void;
  onFileProcessed?: (file: FileUploadItem) => void;
}

const UnifiedFileUpload: React.FC<UnifiedFileUploadProps> = ({
  ingestionType,
  publication,
  entityName,
  maxConcurrentUploads = 5,
  onUploadComplete,
  onFileProcessed,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [files, setFiles] = useState<FileUploadItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const activeUploadsRef = useRef<Set<string>>(new Set());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Integration with persistent upload store
  const { createUploadHandler } = useUploadIntegration({
    ingestionType,
    publication,
    entityName,
  });

  // Calculate basic stats
  const stats = {
    total: files.length,
    pending: files.filter((f) => f.status === "pending").length,
    success: files.filter((f) => f.status === "success").length,
    error: files.filter((f) => f.status === "error").length,
  };

  // Auto-complete callback
  useEffect(() => {
    if (stats.total > 0 && stats.success + stats.error === stats.total) {
      onUploadComplete?.(stats as any);
    }
  }, [stats.success, stats.error, stats.total, onUploadComplete]);

  const generateFileId = () => Math.random().toString(36).substr(2, 9);

  const validateFile = (file: File): string | null => {
    const maxSize = 50 * 1024 * 1024; // 50MB per file
    if (file.size > maxSize) {
      return t("notifications.fileTooLarge", { filename: file.name });
    }

    const validExtensions =
      ingestionType === "extraction_data" ? [".json"] : [".yaml", ".yml"];
    const extension = "." + file.name.split(".").pop()?.toLowerCase();
    if (!validExtensions.includes(extension)) {
      return t("notifications.invalidFormat", {
        filename: file.name,
        expected: validExtensions.join(", "),
      });
    }

    return null;
  };

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const newFiles: FileUploadItem[] = [];
      const errors: string[] = [];

      acceptedFiles.forEach((file) => {
        const error = validateFile(file);
        if (error) {
          errors.push(error);
          return;
        }

        // Check for duplicates
        const isDuplicate = files.some(
          (f) => f.file.name === file.name && f.file.size === file.size,
        );
        if (isDuplicate) {
          errors.push(
            t("notifications.duplicateFile", { filename: file.name }),
          );
          return;
        }

        newFiles.push({
          id: generateFileId(),
          file,
          status: "pending",
          progress: 0,
          retryCount: 0,
        });
      });

      if (errors.length > 0) {
        console.warn(t("notifications.filesRejected"), errors);
      }

      setFiles((prev) => [...prev, ...newFiles]);
    },
    [files, ingestionType],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    accept:
      ingestionType === "extraction_data"
        ? { "application/json": [".json"] }
        : {
            "application/x-yaml": [".yaml", ".yml"],
            "text/yaml": [".yaml", ".yml"],
            "text/x-yaml": [".yaml", ".yml"],
            "text/plain": [".yaml", ".yml"],
          },
    disabled: isProcessing,
  });

  const uploadFile = async (fileItem: FileUploadItem): Promise<void> => {
    const controller = new AbortController();
    abortControllersRef.current.set(fileItem.id, controller);

    try {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileItem.id
            ? { ...f, status: "uploading", uploadStartTime: Date.now() }
            : f,
        ),
      );

      // Use integrated upload handler that connects to persistent store
      const uploadHandler = createUploadHandler(async (file, onProgress) => {
        return await apiService.uploadFile(
          file,
          ingestionType,
          publication,
          entityName,
          undefined,
          onProgress,
        );
      });

      const uploadId = await uploadHandler(fileItem.file);

      // Mark as uploaded and processing - the persistent store will handle status updates
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileItem.id
            ? {
                ...f,
                status: "success", // Local success - file uploaded
                progress: 100,
                uploadEndTime: Date.now(),
                uploadId, // Store the persistent upload ID for reference
              }
            : f,
        ),
      );

      onFileProcessed?.(fileItem);
    } catch (error) {
      let errorMessage = t("notifications.unknownError");

      if (error instanceof Error) {
        // Handle structured error responses from backend
        const apiError = error as any;
        if (apiError.details && apiError.details.error_code) {
          switch (apiError.details.error_code) {
            case "PUBLICATION_REQUIRED":
              errorMessage = t("notifications.publicationRequired");
              break;
            case "FILE_VALIDATION_ERROR":
              errorMessage = apiError.details.errors
                ? apiError.details.errors.join(". ")
                : t("notifications.invalidFormat", {
                    filename: fileItem.file.name,
                  });
              break;
            case "VALIDATION_ERROR":
              errorMessage = apiError.details.errors
                ? apiError.details.errors.join(". ")
                : t("notifications.validationError");
              break;
            default:
              errorMessage = apiError.details.message || error.message;
          }
        } else if (error.message.includes("Publication is required")) {
          errorMessage = t("notifications.publicationRequired");
        } else if (error.message.includes("validation error")) {
          errorMessage = t("notifications.validationError");
        } else {
          errorMessage = error.message;
        }
      }

      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileItem.id
            ? {
                ...f,
                status: "error",
                error: errorMessage,
                uploadEndTime: Date.now(),
              }
            : f,
        ),
      );
    } finally {
      abortControllersRef.current.delete(fileItem.id);
      activeUploadsRef.current.delete(fileItem.id);
    }
  };

  const processQueue = useCallback(async () => {
    if (activeUploadsRef.current.size >= maxConcurrentUploads) {
      return;
    }

    const pendingFiles = files.filter(
      (f) => f.status === "pending" && !activeUploadsRef.current.has(f.id),
    );

    const filesToProcess = pendingFiles.slice(
      0,
      maxConcurrentUploads - activeUploadsRef.current.size,
    );

    for (const file of filesToProcess) {
      activeUploadsRef.current.add(file.id);
      uploadFile(file);
    }
  }, [files, maxConcurrentUploads]);

  useEffect(() => {
    if (isProcessing) {
      processQueue();
    }
  }, [isProcessing, files, processQueue]);

  const startProcessing = async () => {
    setIsProcessing(true);
    // Navigate to processes dashboard after a short delay to let uploads start
    setTimeout(() => {
      navigate("/processes");
    }, 1000);
  };

  const clearAll = () => {
    setIsProcessing(false);
    // Cancel active uploads
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();
    activeUploadsRef.current.clear();
    setFiles([]);
  };

  return (
    <div className="space-y-6">
      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={clsx(
          "upload-zone border-2 border-dashed rounded-xl p-8 text-center cursor-pointer",
          {
            "drag-active": isDragActive,
            "border-gray-300": !isDragActive && !isProcessing,
            "border-gray-200 bg-gray-100 cursor-not-allowed": isProcessing,
          },
        )}
      >
        <input {...getInputProps()} />
        <FolderOpen
          className={clsx(
            "w-16 h-16 mx-auto mb-4",
            isDragActive ? "text-blue-500" : "text-gray-400",
          )}
        />
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          {isDragActive
            ? t("ingestion.dragFilesActive")
            : t("ingestion.fileUpload")}
        </h3>
        <p className="text-gray-600 mb-4">{t("ingestion.dragFiles")}</p>
        {ingestionType === "extraction_data" && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              💡 La publicación se extrae automáticamente de los datos JSON.
              Puedes seleccionar una publicación específica si deseas
              sobrescribir esta información.
            </p>
          </div>
        )}
        <div className="flex justify-center space-x-6 text-sm text-gray-500">
          <span>• {t("ingestion.multipleFiles")}</span>
          <span>• {t("ingestion.maxFileSize")}</span>
          <span>• {t("ingestion.parallelProcessing")}</span>
        </div>
      </div>

      {/* Simple File Summary and Process Button */}
      {files.length > 0 && !isProcessing && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900">
                  {files.length} archivo{files.length !== 1 ? "s" : ""}{" "}
                  seleccionado{files.length !== 1 ? "s" : ""}
                </span>
              </div>

              {stats.error > 0 && (
                <div className="flex items-center space-x-1 text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{stats.error} con errores</span>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={clearAll}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                Limpiar
              </button>

              <button
                onClick={startProcessing}
                disabled={stats.pending === 0}
                className="btn btn-primary flex items-center"
              >
                <Play className="w-4 h-4 mr-2" />
                Procesar Archivos
                <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            </div>
          </div>

          {/* Simple file list */}
          <div className="mt-4 space-y-2">
            {files.map((fileItem) => (
              <div
                key={fileItem.id}
                className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-900">
                    {fileItem.file.name}
                  </span>
                  <span className="text-xs text-gray-500">
                    ({(fileItem.file.size / 1024 / 1024).toFixed(1)} MB)
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  {fileItem.status === "success" && (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  )}
                  {fileItem.status === "error" && (
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  )}
                  <button
                    onClick={() =>
                      setFiles((prev) =>
                        prev.filter((f) => f.id !== fileItem.id),
                      )
                    }
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Processing State */}
      {isProcessing && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="text-blue-900 font-medium">
              Procesando archivos...
            </span>
          </div>

          <p className="text-blue-700 text-sm mb-4">
            Los archivos se están procesando en segundo plano. Serás redirigido
            al dashboard de procesos para ver el progreso en tiempo real.
          </p>

          <Link
            to="/processes"
            className="inline-flex items-center text-blue-600 hover:text-blue-500 font-medium"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Ver Dashboard de Procesos
          </Link>
        </div>
      )}

      {/* Global Monitoring Info - Only show when files are uploaded but not processing */}
      {files.length > 0 && !isProcessing && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <ExternalLink className="w-5 h-5 text-blue-600 mt-0.5" />
            </div>
            <div className="ml-3">
              <h4 className="text-sm font-medium text-blue-900">
                Monitoreo en Tiempo Real
              </h4>
              <p className="text-sm text-blue-700 mt-1">
                Una vez que inicies el procesamiento, podrás monitorear el
                progreso en tiempo real desde el{" "}
                <strong>Dashboard de Procesos</strong>. Los archivos se procesan
                en segundo plano y puedes navegar libremente por la aplicación.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedFileUpload;
