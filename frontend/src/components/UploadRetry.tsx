/**
 * Upload retry component
 * Provides retry functionality for failed uploads with exponential backoff
 */

import React, { useState } from 'react';
import { RefreshCw, AlertCircle, Clock } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import clsx from 'clsx';

interface UploadRetryProps {
  onRetry: () => Promise<void>;
  maxRetries?: number;
  retryDelay?: number; // Initial delay in milliseconds
  error?: string;
  fileName?: string;
  disabled?: boolean;
  className?: string;
}

const UploadRetry: React.FC<UploadRetryProps> = ({
  onRetry,
  maxRetries = 3,
  retryDelay = 1000,
  error,
  fileName,
  disabled = false,
  className = ''
}) => {
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [nextRetryIn, setNextRetryIn] = useState<number | null>(null);

  const calculateDelay = (attempt: number) => {
    // Exponential backoff: 1s, 2s, 4s, 8s, etc.
    return retryDelay * Math.pow(2, attempt);
  };

  const handleRetry = async () => {
    if (retryCount >= maxRetries || isRetrying || disabled) {
      return;
    }

    setIsRetrying(true);
    
    try {
      await onRetry();
      // Reset retry count on successful retry
      setRetryCount(0);
    } catch (error) {
      console.error('Retry failed:', error);
      const newRetryCount = retryCount + 1;
      setRetryCount(newRetryCount);
      
      // If we haven't exceeded max retries, schedule next retry
      if (newRetryCount < maxRetries) {
        const delay = calculateDelay(newRetryCount);
        setNextRetryIn(delay / 1000);
        
        // Countdown timer
        const countdownInterval = setInterval(() => {
          setNextRetryIn(prev => {
            if (prev === null || prev <= 1) {
              clearInterval(countdownInterval);
              return null;
            }
            return prev - 1;
          });
        }, 1000);
        
        // Auto retry after delay
        setTimeout(() => {
          clearInterval(countdownInterval);
          setNextRetryIn(null);
          handleRetry();
        }, delay);
      }
    } finally {
      setIsRetrying(false);
    }
  };

  const canRetry = retryCount < maxRetries && !isRetrying && !disabled;
  const hasExceededRetries = retryCount >= maxRetries;

  return (
    <div className={clsx('bg-red-50 border border-red-200 rounded-lg p-4', className)}>
      <div className="flex">
        <AlertCircle className="w-5 h-5 text-red-400 mr-3 mt-0.5 flex-shrink-0" />
        
        <div className="flex-1">
          <h3 className="text-sm font-medium text-red-800 mb-2">
            Error al procesar archivo
          </h3>
          
          {fileName && (
            <p className="text-xs text-red-600 mb-2">
              Archivo: {fileName}
            </p>
          )}
          
          {error && (
            <p className="text-sm text-red-700 mb-3">
              {error}
            </p>
          )}
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* Retry Button */}
              {canRetry && !nextRetryIn && (
                <button
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="flex items-center text-sm font-medium text-red-800 bg-red-100 hover:bg-red-200 px-3 py-1 rounded-md transition-colors disabled:opacity-50"
                >
                  {isRetrying ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      Reintentando...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Reintentar ({retryCount + 1}/{maxRetries})
                    </>
                  )}
                </button>
              )}
              
              {/* Auto Retry Countdown */}
              {nextRetryIn && (
                <div className="flex items-center text-sm text-red-700">
                  <Clock className="w-4 h-4 mr-2" />
                  Reintentando automáticamente en {nextRetryIn}s...
                </div>
              )}
              
              {/* Max Retries Exceeded */}
              {hasExceededRetries && (
                <div className="text-sm text-red-800 font-medium">
                  Se agotaron los intentos de reintento ({maxRetries}/{maxRetries})
                </div>
              )}
            </div>
            
            {/* Retry Info */}
            <div className="text-xs text-red-600">
              {retryCount > 0 && (
                <span>Intentos: {retryCount}/{maxRetries}</span>
              )}
            </div>
          </div>
          
          {/* Retry Strategy Info */}
          {retryCount > 0 && !hasExceededRetries && (
            <div className="mt-3 text-xs text-red-600">
              <p>
                Próximo intento en {calculateDelay(retryCount) / 1000}s 
                (retraso exponencial)
              </p>
            </div>
          )}
          
          {/* Help Text */}
          <div className="mt-3 text-xs text-red-600">
            <p>
              Si el problema persiste, verifica:
            </p>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>Formato del archivo (JSON para extracción, YAML para entidades)</li>
              <li>Tamaño del archivo (máximo 50MB)</li>
              <li>Conexión a internet</li>
              <li>Estado del servidor</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadRetry;