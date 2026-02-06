/**
 * Upload feedback component
 * Provides user feedback for upload operations with success/error messages
 */

import React from 'react';
import { CheckCircle, AlertCircle, Info, XCircle, X } from 'lucide-react';
import clsx from 'clsx';

export type FeedbackType = 'success' | 'error' | 'warning' | 'info';

export interface FeedbackData {
  type: FeedbackType;
  title: string;
  message: string;
  details?: string[];
  recordsProcessed?: number;
  fileName?: string;
  timestamp?: Date;
  actionLabel?: string;
  onAction?: () => void;
}

interface UploadFeedbackProps {
  feedback: FeedbackData;
  onDismiss?: () => void;
  autoHide?: boolean;
  autoHideDelay?: number;
  className?: string;
}

const UploadFeedback: React.FC<UploadFeedbackProps> = ({
  feedback,
  onDismiss,
  autoHide = false,
  autoHideDelay = 5000,
  className = ''
}) => {
  React.useEffect(() => {
    if (autoHide && onDismiss) {
      const timer = setTimeout(onDismiss, autoHideDelay);
      return () => clearTimeout(timer);
    }
  }, [autoHide, autoHideDelay, onDismiss]);

  const getIcon = () => {
    switch (feedback.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-400" />;
      case 'info':
        return <Info className="w-5 h-5 text-blue-400" />;
    }
  };

  const getColorClasses = () => {
    switch (feedback.type) {
      case 'success':
        return {
          container: 'bg-green-50 border-green-200',
          title: 'text-green-800',
          message: 'text-green-700',
          details: 'text-green-600',
          button: 'bg-green-100 text-green-800 hover:bg-green-200',
          dismiss: 'text-green-400 hover:text-green-600'
        };
      case 'error':
        return {
          container: 'bg-red-50 border-red-200',
          title: 'text-red-800',
          message: 'text-red-700',
          details: 'text-red-600',
          button: 'bg-red-100 text-red-800 hover:bg-red-200',
          dismiss: 'text-red-400 hover:text-red-600'
        };
      case 'warning':
        return {
          container: 'bg-yellow-50 border-yellow-200',
          title: 'text-yellow-800',
          message: 'text-yellow-700',
          details: 'text-yellow-600',
          button: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200',
          dismiss: 'text-yellow-400 hover:text-yellow-600'
        };
      case 'info':
        return {
          container: 'bg-blue-50 border-blue-200',
          title: 'text-blue-800',
          message: 'text-blue-700',
          details: 'text-blue-600',
          button: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
          dismiss: 'text-blue-400 hover:text-blue-600'
        };
    }
  };

  const colors = getColorClasses();

  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className={clsx(
      'border rounded-lg p-4 shadow-sm',
      colors.container,
      className
    )}>
      <div className="flex">
        <div className="flex-shrink-0">
          {getIcon()}
        </div>
        
        <div className="ml-3 flex-1">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className={clsx('text-sm font-medium', colors.title)}>
                {feedback.title}
              </h3>
              
              {feedback.fileName && (
                <p className="text-xs text-gray-500 mt-1">
                  Archivo: {feedback.fileName}
                </p>
              )}
            </div>
            
            {onDismiss && (
              <button
                onClick={onDismiss}
                className={clsx(
                  'ml-4 inline-flex rounded-md p-1.5 transition-colors',
                  colors.dismiss
                )}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Message */}
          <div className="mt-2">
            <p className={clsx('text-sm', colors.message)}>
              {feedback.message}
            </p>
            
            {feedback.recordsProcessed !== undefined && (
              <p className={clsx('text-sm mt-1', colors.message)}>
                Registros procesados: <span className="font-medium">{feedback.recordsProcessed}</span>
              </p>
            )}
          </div>

          {/* Details */}
          {feedback.details && feedback.details.length > 0 && (
            <div className="mt-3">
              <ul className={clsx('text-sm list-disc list-inside space-y-1', colors.details)}>
                {feedback.details.map((detail, index) => (
                  <li key={index}>{detail}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {feedback.onAction && feedback.actionLabel && (
                <button
                  onClick={feedback.onAction}
                  className={clsx(
                    'text-sm font-medium px-3 py-1 rounded-md transition-colors',
                    colors.button
                  )}
                >
                  {feedback.actionLabel}
                </button>
              )}
            </div>
            
            {feedback.timestamp && (
              <span className="text-xs text-gray-500">
                {formatTimestamp(feedback.timestamp)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadFeedback;