/**
 * File upload component for analysis queries
 * Handles date files and other analysis-specific uploads
 */

import React from 'react';
import FileUpload from './FileUpload';

export type AnalysisFileType = 'dates' | 'general';

interface AnalysisFileUploadProps {
  fileType: AnalysisFileType;
  onFileSelect: (file: File) => void;
  onFileRemove: () => void;
  onUpload?: (file: File) => Promise<void>;
  selectedFile?: File | null;
  isUploading?: boolean;
  uploadProgress?: number;
  uploadResult?: {
    success: boolean;
    message: string;
    data?: any;
  };
  disabled?: boolean;
  className?: string;
}

const AnalysisFileUpload: React.FC<AnalysisFileUploadProps> = ({
  fileType,
  onFileSelect,
  onFileRemove,
  onUpload,
  selectedFile,
  isUploading = false,
  uploadProgress = 0,
  uploadResult,
  disabled = false,
  className = ''
}) => {
  // File type configurations for different analysis types
  const getFileConfig = (): {
    acceptedFileTypes: Record<string, string[]>;
    title: string;
    description: string;
    maxFileSize: number;
  } => {
    switch (fileType) {
      case 'dates':
        return {
          acceptedFileTypes: {
            'application/json': ['.json'],
            'application/x-yaml': ['.yaml', '.yml'],
            'text/yaml': ['.yaml', '.yml'],
            'text/plain': ['.txt']
          },
          title: 'Arrastra un archivo con fechas o haz clic para seleccionar',
          description: 'Formatos soportados: JSON, YAML, TXT con fechas',
          maxFileSize: 5 * 1024 * 1024, // 5MB for date files
        };
      case 'general':
      default:
        return {
          acceptedFileTypes: {
            'application/json': ['.json'],
            'application/x-yaml': ['.yaml', '.yml'],
            'text/yaml': ['.yaml', '.yml'],
            'text/plain': ['.txt'],
            'text/csv': ['.csv']
          },
          title: 'Arrastra un archivo o haz clic para seleccionar',
          description: 'Formatos soportados: JSON, YAML, TXT, CSV',
          maxFileSize: 10 * 1024 * 1024, // 10MB for general files
        };
    }
  };

  const config = getFileConfig();

  const handleUpload = async (file: File) => {
    if (onUpload) {
      await onUpload(file);
    }
  };

  return (
    <FileUpload
      onFileSelect={onFileSelect}
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

export default AnalysisFileUpload;