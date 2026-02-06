/**
 * Specialized file upload component for ingestion
 * Handles extraction data and known entities with specific validation
 */

import React from "react";
import FileUpload from "./FileUpload";
import { useNotificationStore } from "../store/useStore";

export type IngestionType = "extraction_data" | "known_entities";

interface IngestionFileUploadProps {
  ingestionType: IngestionType;
  onFileSelect: (file: File) => void;
  onFileRemove: () => void;
  onUpload?: (file: File, metadata: any) => Promise<void>;
  selectedFile?: File | null;
  isUploading?: boolean;
  uploadProgress?: number;
  uploadResult?: {
    success: boolean;
    message: string;
    records_processed?: number;
  };
  disabled?: boolean;
  className?: string;
}

const IngestionFileUpload: React.FC<IngestionFileUploadProps> = ({
  ingestionType,
  onFileSelect,
  onFileRemove,
  onUpload,
  selectedFile,
  isUploading = false,
  uploadProgress = 0,
  uploadResult,
  disabled = false,
  className = "",
}) => {
  const { addNotification } = useNotificationStore();

  // File type configurations for different ingestion types
  const getFileConfig = (): {
    acceptedFileTypes: Record<string, string[]>;
    title: string;
    description: string;
    maxFileSize: number;
  } => {
    switch (ingestionType) {
      case "extraction_data":
        return {
          acceptedFileTypes: { "application/json": [".json"] },
          title: "Arrastra un archivo JSON o haz clic para seleccionar",
          description: "Formato requerido: JSON con datos de extracción",
          maxFileSize: 50 * 1024 * 1024, // 50MB for extraction data
        };
      case "known_entities":
        return {
          acceptedFileTypes: {
            "application/x-yaml": [".yaml", ".yml"],
            "text/yaml": [".yaml", ".yml"],
            "text/x-yaml": [".yaml", ".yml"],
            "text/plain": [".yaml", ".yml"],
          },
          title: "Arrastra un archivo YAML o haz clic para seleccionar",
          description: "Formato requerido: YAML con entidades conocidas",
          maxFileSize: 10 * 1024 * 1024, // 10MB for entities
        };
      default:
        return {
          acceptedFileTypes: { "application/json": [".json"] },
          title: "Selecciona un archivo",
          description: "Formato no especificado",
          maxFileSize: 10 * 1024 * 1024,
        };
    }
  };

  const config = getFileConfig();

  const handleFileSelect = (file: File) => {
    // Additional validation based on ingestion type
    const fileName = file.name.toLowerCase();

    if (ingestionType === "extraction_data" && !fileName.endsWith(".json")) {
      addNotification({
        type: "error",
        title: "Formato incorrecto",
        message: "Los datos de extracción deben estar en formato JSON",
      });
      return;
    }

    if (
      ingestionType === "known_entities" &&
      !fileName.match(/\.(yaml|yml)$/)
    ) {
      addNotification({
        type: "error",
        title: "Formato incorrecto",
        message: "Las entidades conocidas deben estar en formato YAML",
      });
      return;
    }

    onFileSelect(file);
  };

  const handleUpload = async (file: File) => {
    if (onUpload) {
      const metadata = {
        ingestionType,
        fileName: file.name,
        fileSize: file.size,
        timestamp: new Date().toISOString(),
      };

      await onUpload(file, metadata);
    }
  };

  return (
    <FileUpload
      onFileSelect={handleFileSelect}
      onFileRemove={onFileRemove}
      onUpload={onUpload ? handleUpload : undefined}
      acceptedFileTypes={config.acceptedFileTypes}
      maxFileSize={config.maxFileSize}
      selectedFile={selectedFile}
      isUploading={isUploading}
      uploadProgress={uploadProgress}
      uploadResult={uploadResult}
      title={config.title}
      description={config.description}
      disabled={disabled}
      className={className}
    />
  );
};

export default IngestionFileUpload;
