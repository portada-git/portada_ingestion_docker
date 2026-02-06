/**
 * Upload progress indicator component
 * Shows detailed progress information for file uploads
 */

import React from 'react';
import { CheckCircle, AlertCircle, Clock, Upload } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import clsx from 'clsx';

export interface UploadProgressProps {
  isUploading: boolean;
  progress: number;
  fileName?: string;
  fileSize?: number;
  uploadSpeed?: number; // bytes per second
  timeRemaining?: number; // seconds
  status?: 'uploading' | 'processing' | 'completed' | 'error';
  message?: string;
  className?: string;
}

const UploadProgress: React.FC<UploadProgressProps> = ({
  isUploading,
  progress,
  fileName,
  fileSize,
  uploadSpeed,
  timeRemaining,
  status = 'uploading',
  message,
  className = ''
}) => {
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'uploading':
        return <Upload className="w-5 h-5 text-blue-500" />;
      case 'processing':
        return <LoadingSpinner size="sm" className="text-blue-500" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'uploading':
        return 'Subiendo archivo...';
      case 'processing':
        return 'Procesando archivo...';
      case 'completed':
        return 'Archivo procesado exitosamente';
      case 'error':
        return 'Error al procesar archivo';
      default:
        return 'Preparando...';
    }
  };

  const getProgressColor = () => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      case 'processing':
        return 'bg-yellow-500';
      default:
        return 'bg-blue-500';
    }
  };

  if (!isUploading && status !== 'completed' && status !== 'error') {
    return null;
  }

  return (
    <div className={clsx('bg-white border border-gray-200 rounded-lg p-4 shadow-sm', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          {getStatusIcon()}
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-900">
              {getStatusText()}
            </p>
            {fileName && (
              <p className="text-xs text-gray-500">{fileName}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-gray-900">{progress}%</p>
          {fileSize && (
            <p className="text-xs text-gray-500">{formatBytes(fileSize)}</p>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={clsx('h-2 rounded-full transition-all duration-300', getProgressColor())}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>

      {/* Details */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center space-x-4">
          {uploadSpeed && (
            <span>
              {formatBytes(uploadSpeed)}/s
            </span>
          )}
          {timeRemaining && timeRemaining > 0 && (
            <span>
              {formatTime(timeRemaining)} restante
            </span>
          )}
        </div>
        {message && (
          <span className={clsx(
            'font-medium',
            status === 'error' ? 'text-red-600' : 'text-gray-600'
          )}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
};

export default UploadProgress;