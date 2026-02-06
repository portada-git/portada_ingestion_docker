/**
 * Upload status component
 * Displays real-time status updates and feedback for file uploads
 */

import React from 'react';
import { 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  Upload, 
  RefreshCw,
  XCircle
} from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import clsx from 'clsx';

export type UploadStatus = 
  | 'idle'
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface UploadStatusData {
  status: UploadStatus;
  progress: number;
  message: string;
  fileName?: string;
  fileSize?: number;
  recordsProcessed?: number;
  estimatedTotal?: number;
  startTime?: Date;
  endTime?: Date;
  error?: string;
  taskId?: string;
}

interface UploadStatusProps {
  uploadData: UploadStatusData;
  onRetry?: () => void;
  onCancel?: () => void;
  onDismiss?: () => void;
  showDetails?: boolean;
  className?: string;
}

const UploadStatus: React.FC<UploadStatusProps> = ({
  uploadData,
  onRetry,
  onCancel,
  onDismiss,
  showDetails = true,
  className = ''
}) => {
  const getStatusIcon = () => {
    switch (uploadData.status) {
      case 'uploading':
        return <Upload className="w-5 h-5 text-blue-500" />;
      case 'processing':
        return <LoadingSpinner size="sm" className="text-blue-500" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'cancelled':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = () => {
    switch (uploadData.status) {
      case 'uploading':
      case 'processing':
        return 'blue';
      case 'completed':
        return 'green';
      case 'error':
        return 'red';
      case 'cancelled':
        return 'yellow';
      default:
        return 'gray';
    }
  };

  const getProgressBarColor = () => {
    switch (uploadData.status) {
      case 'completed':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      case 'cancelled':
        return 'bg-yellow-500';
      case 'processing':
        return 'bg-yellow-500';
      default:
        return 'bg-blue-500';
    }
  };

  const formatDuration = (start?: Date, end?: Date) => {
    if (!start) return null;
    const endTime = end || new Date();
    const duration = Math.round((endTime.getTime() - start.getTime()) / 1000);
    
    if (duration < 60) return `${duration}s`;
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}m ${seconds}s`;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const color = getStatusColor();

  if (uploadData.status === 'idle') {
    return null;
  }

  return (
    <div className={clsx(
      'bg-white border rounded-lg shadow-sm p-4',
      {
        'border-blue-200': color === 'blue',
        'border-green-200': color === 'green',
        'border-red-200': color === 'red',
        'border-yellow-200': color === 'yellow',
        'border-gray-200': color === 'gray',
      },
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          {getStatusIcon()}
          <div className="ml-3">
            <p className={clsx(
              'text-sm font-medium',
              {
                'text-blue-900': color === 'blue',
                'text-green-900': color === 'green',
                'text-red-900': color === 'red',
                'text-yellow-900': color === 'yellow',
                'text-gray-900': color === 'gray',
              }
            )}>
              {uploadData.message}
            </p>
            {uploadData.fileName && (
              <p className="text-xs text-gray-500">{uploadData.fileName}</p>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {uploadData.status === 'uploading' && onCancel && (
            <button
              onClick={onCancel}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancelar
            </button>
          )}
          
          {uploadData.status === 'error' && onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center text-xs text-blue-600 hover:text-blue-800"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Reintentar
            </button>
          )}
          
          {(uploadData.status === 'completed' || uploadData.status === 'error') && onDismiss && (
            <button
              onClick={onDismiss}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cerrar
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {(uploadData.status === 'uploading' || uploadData.status === 'processing') && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-600">
              {uploadData.status === 'uploading' ? 'Subiendo...' : 'Procesando...'}
            </span>
            <span className="text-xs text-gray-600">{uploadData.progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={clsx('h-2 rounded-full transition-all duration-300', getProgressBarColor())}
              style={{ width: `${Math.min(uploadData.progress, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Details */}
      {showDetails && (
        <div className="space-y-2">
          {/* File Information */}
          {uploadData.fileSize && (
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>Tamaño del archivo:</span>
              <span>{formatFileSize(uploadData.fileSize)}</span>
            </div>
          )}

          {/* Processing Information */}
          {uploadData.recordsProcessed !== undefined && (
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>Registros procesados:</span>
              <span>
                {uploadData.recordsProcessed}
                {uploadData.estimatedTotal && ` / ${uploadData.estimatedTotal}`}
              </span>
            </div>
          )}

          {/* Duration */}
          {uploadData.startTime && (
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>Duración:</span>
              <span>{formatDuration(uploadData.startTime, uploadData.endTime)}</span>
            </div>
          )}

          {/* Task ID */}
          {uploadData.taskId && (
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>ID de tarea:</span>
              <span className="font-mono">{uploadData.taskId}</span>
            </div>
          )}

          {/* Error Details */}
          {uploadData.status === 'error' && uploadData.error && (
            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded">
              <div className="flex">
                <AlertCircle className="w-4 h-4 text-red-400 mr-2 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-red-800">Error:</p>
                  <p className="text-xs text-red-700 mt-1">{uploadData.error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Success Details */}
          {uploadData.status === 'completed' && uploadData.recordsProcessed && (
            <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded">
              <div className="flex">
                <CheckCircle className="w-4 h-4 text-green-400 mr-2 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-green-800">
                    Procesamiento completado exitosamente
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    Se procesaron {uploadData.recordsProcessed} registros correctamente
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UploadStatus;