/**
 * Hook para integrar uploads con el store persistente
 * Conecta los componentes de upload con el sistema de monitoreo global
 */

import { useCallback } from 'react';
import { useUploadStore } from '../store/useUploadStore';
import { useNotificationStore } from '../store/useStore';
import { IngestionResponse } from '../types';

interface UseUploadIntegrationProps {
  ingestionType: 'extraction_data' | 'known_entities';
  publication?: string;
  entityName?: string;
}

export const useUploadIntegration = ({
  ingestionType,
  publication,
  entityName
}: UseUploadIntegrationProps) => {
  const { addTask, updateTask, getTask } = useUploadStore();
  const { addNotification } = useNotificationStore();
  
  // Register a new upload task
  const registerUpload = useCallback((
    file: File,
    taskId: string
  ): string => {
    const uploadId = addTask({
      taskId,
      fileName: file.name,
      fileSize: file.size,
      status: 'uploading',
      progress: 0,
      message: 'Subiendo archivo...',
      ingestionType,
      publication,
      entityName,
      maxRetries: 3
    });
    
    addNotification({
      type: 'info',
      title: 'Upload iniciado',
      message: `Procesando ${file.name}...`
    });
    
    return uploadId;
  }, [addTask, addNotification, ingestionType, publication, entityName]);
  
  // Update upload progress
  const updateUploadProgress = useCallback((
    uploadId: string,
    progress: number,
    message?: string
  ) => {
    updateTask(uploadId, {
      progress,
      message: message || `Subiendo... ${progress}%`
    });
  }, [updateTask]);
  
  // Handle upload completion
  const handleUploadComplete = useCallback((
    uploadId: string,
    result: IngestionResponse
  ) => {
    updateTask(uploadId, {
      status: 'processing',
      progress: 100,
      message: 'Archivo subido, procesando...',
      recordsProcessed: result.records_processed
    });
  }, [updateTask]);
  
  // Handle upload error
  const handleUploadError = useCallback((
    uploadId: string,
    error: string
  ) => {
    updateTask(uploadId, {
      status: 'failed',
      progress: 0,
      message: 'Error en la subida',
      error,
      endTime: new Date()
    });
    
    const task = getTask(uploadId);
    if (task) {
      addNotification({
        type: 'error',
        title: 'Error en upload',
        message: `${task.fileName}: ${error}`
      });
    }
  }, [updateTask, getTask, addNotification]);
  
  // Create integrated upload handler
  const createUploadHandler = useCallback((
    uploadFunction: (file: File, onProgress?: (progress: number) => void) => Promise<IngestionResponse>
  ) => {
    return async (file: File): Promise<string> => {
      // Register task immediately with a temporary taskId
      const tempTaskId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const uploadId = registerUpload(file, tempTaskId);
      
      try {
        // Start upload with progress tracking
        const result = await uploadFunction(file, (progress) => {
          updateUploadProgress(uploadId, progress);
        });
        
        // Update with real taskId and completion status
        updateTask(uploadId, {
          taskId: result.task_id,
          status: 'processing',
          progress: 100,
          message: 'Archivo subido, procesando...',
          recordsProcessed: result.records_processed
        });
        
        return uploadId;
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        handleUploadError(uploadId, errorMessage);
        throw error;
      }
    };
  }, [registerUpload, updateUploadProgress, updateTask, handleUploadError]);
  
  return {
    registerUpload,
    updateUploadProgress,
    handleUploadComplete,
    handleUploadError,
    createUploadHandler
  };
};