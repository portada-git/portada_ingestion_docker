/**
 * Reusable file upload component with drag-and-drop support
 * Implements drag-and-drop, file validation, and progress indication
 */

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, X, CheckCircle, AlertCircle } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import clsx from 'clsx';

export interface FileUploadProps {
  onFileSelect: (file: File) => void;
  onFileRemove: () => void;
  onUpload?: (file: File) => Promise<void>;
  acceptedFileTypes?: Record<string, string[]>;
  maxFileSize?: number; // in bytes
  multiple?: boolean;
  disabled?: boolean;
  isUploading?: boolean;
  uploadProgress?: number;
  uploadResult?: {
    success: boolean;
    message: string;
    records_processed?: number;
  };
  selectedFile?: File | null;
  title?: string;
  description?: string;
  className?: string;
}

const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelect,
  onFileRemove,
  onUpload,
  acceptedFileTypes = {
    'application/json': ['.json'],
    'application/x-yaml': ['.yaml', '.yml'],
    'text/plain': ['.txt']
  },
  maxFileSize = 10 * 1024 * 1024, // 10MB default
  multiple = false,
  disabled = false,
  isUploading = false,
  uploadProgress = 0,
  uploadResult,
  selectedFile,
  title = 'Arrastra un archivo o haz clic para seleccionar',
  description = 'Formatos soportados: JSON, YAML, TXT',
  className = ''
}) => {
  const [dragError, setDragError] = useState<string | null>(null);

  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > maxFileSize) {
      return `El archivo es demasiado grande. Tamaño máximo: ${(maxFileSize / 1024 / 1024).toFixed(1)}MB`;
    }

    // Check file type
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    const isValidType = Object.values(acceptedFileTypes).some(extensions =>
      extensions.includes(fileExtension)
    );

    if (!isValidType) {
      const validExtensions = Object.values(acceptedFileTypes).flat().join(', ');
      return `Formato de archivo no válido. Formatos aceptados: ${validExtensions}`;
    }

    return null;
  };

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    setDragError(null);

    if (rejectedFiles.length > 0) {
      const rejection = rejectedFiles[0];
      if (rejection.errors[0]?.code === 'file-too-large') {
        setDragError(`Archivo demasiado grande. Máximo: ${(maxFileSize / 1024 / 1024).toFixed(1)}MB`);
      } else if (rejection.errors[0]?.code === 'file-invalid-type') {
        setDragError('Formato de archivo no válido');
      } else {
        setDragError('Error al procesar el archivo');
      }
      return;
    }

    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const validationError = validateFile(file);
      
      if (validationError) {
        setDragError(validationError);
        return;
      }

      onFileSelect(file);
    }
  }, [onFileSelect, maxFileSize, acceptedFileTypes]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    multiple,
    disabled: disabled || isUploading,
    accept: acceptedFileTypes,
    maxSize: maxFileSize
  });

  const handleRemoveFile = () => {
    setDragError(null);
    onFileRemove();
  };

  const handleUpload = async () => {
    if (selectedFile && onUpload) {
      try {
        await onUpload(selectedFile);
      } catch (error) {
        console.error('Upload error:', error);
      }
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={clsx('space-y-4', className)}>
      {!selectedFile ? (
        <div>
          <div
            {...getRootProps()}
            className={clsx(
              'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
              {
                'border-primary-400 bg-primary-50': isDragActive && !isDragReject,
                'border-red-400 bg-red-50': isDragReject || dragError,
                'border-gray-300 hover:border-gray-400': !isDragActive && !isDragReject && !dragError && !disabled,
                'border-gray-200 bg-gray-50 cursor-not-allowed': disabled,
              }
            )}
          >
            <input {...getInputProps()} />
            <Upload className={clsx(
              'w-12 h-12 mx-auto mb-4',
              {
                'text-primary-500': isDragActive && !isDragReject,
                'text-red-400': isDragReject || dragError,
                'text-gray-400': !isDragActive && !isDragReject && !dragError,
              }
            )} />
            <p className="text-lg font-medium text-gray-900 mb-2">
              {isDragActive 
                ? (isDragReject ? 'Archivo no válido' : 'Suelta el archivo aquí')
                : title
              }
            </p>
            <p className="text-sm text-gray-600">
              {description}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Tamaño máximo: {(maxFileSize / 1024 / 1024).toFixed(1)}MB
            </p>
          </div>

          {dragError && (
            <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="w-5 h-5 text-red-400 mr-2" />
              <p className="text-sm text-red-700">{dragError}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <FileText className="w-8 h-8 text-primary-600 mr-3" />
              <div>
                <p className="font-medium text-gray-900">{selectedFile.name}</p>
                <p className="text-sm text-gray-600">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
            </div>
            {!isUploading && (
              <button
                onClick={handleRemoveFile}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                title="Remover archivo"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Subiendo archivo...</span>
                <span className="text-sm text-gray-600">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Upload Result */}
          {uploadResult && (
            <div className={clsx(
              'mt-4 p-3 border rounded-md',
              uploadResult.success
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            )}>
              <div className="flex items-center">
                {uploadResult.success ? (
                  <CheckCircle className="w-5 h-5 text-green-400 mr-2" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-400 mr-2" />
                )}
                <div>
                  <p className={clsx(
                    'text-sm font-medium',
                    uploadResult.success ? 'text-green-800' : 'text-red-800'
                  )}>
                    {uploadResult.success ? 'Archivo procesado exitosamente' : 'Error al procesar archivo'}
                  </p>
                  <p className={clsx(
                    'text-sm',
                    uploadResult.success ? 'text-green-700' : 'text-red-700'
                  )}>
                    {uploadResult.message}
                    {uploadResult.records_processed && (
                      ` - ${uploadResult.records_processed} registros procesados`
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Upload Button */}
          {onUpload && !uploadResult && (
            <div className="mt-4">
              <button
                onClick={handleUpload}
                disabled={isUploading}
                className="btn btn-primary w-full"
              >
                {isUploading ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Subiendo archivo...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 mr-2" />
                    Subir archivo
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FileUpload;