/**
 * Upload status tracker component
 * Tracks and displays real-time upload status with polling
 */

import React, { useState, useEffect, useCallback } from "react";
import { apiService } from "../services/api";
import UploadStatus, { UploadStatusData } from "./UploadStatus";
import { useNotificationStore } from "../store/useStore";

interface UploadStatusTrackerProps {
  taskId: string;
  fileName?: string;
  fileSize?: number;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
  pollInterval?: number;
  maxPollAttempts?: number;
  className?: string;
}

const UploadStatusTracker: React.FC<UploadStatusTrackerProps> = ({
  taskId,
  fileName,
  fileSize,
  onComplete,
  onError,
  onCancel,
  pollInterval = 5000, // 5 seconds (increased from 2 seconds)
  maxPollAttempts = 150, // 5 minutes max
  className = "",
}) => {
  const [statusData, setStatusData] = useState<UploadStatusData>({
    status: "uploading",
    progress: 0,
    message: "Iniciando subida...",
    fileName,
    fileSize,
    taskId,
    startTime: new Date(),
  });

  const [pollAttempts, setPollAttempts] = useState(0);
  const [isPolling, setIsPolling] = useState(true);
  const { addNotification } = useNotificationStore();

  const pollStatus = useCallback(async () => {
    if (!isPolling || pollAttempts >= maxPollAttempts) {
      return;
    }

    try {
      const response = await apiService.getIngestionStatus(taskId);

      const newStatusData: UploadStatusData = {
        status:
          response.status === "completed"
            ? "completed"
            : response.status === "failed"
              ? "error"
              : response.status === "processing"
                ? "processing"
                : "uploading",
        progress: response.progress_percentage || 0,
        message: response.message || "Procesando...",
        fileName,
        fileSize,
        recordsProcessed: response.records_processed,
        estimatedTotal: response.estimated_total,
        startTime: statusData.startTime,
        taskId,
      };

      // Update end time if completed or failed
      if (response.status === "completed" || response.status === "failed") {
        newStatusData.endTime = new Date();
        setIsPolling(false);
      }

      // Handle error status
      if (response.status === "failed") {
        newStatusData.error =
          response.message || "Error desconocido durante el procesamiento";
        if (onError) {
          onError(newStatusData.error || "Unknown error");
        }
      }

      // Handle completion
      if (response.status === "completed") {
        if (onComplete) {
          onComplete(response);
        }

        addNotification({
          type: "success",
          title: "Archivo procesado exitosamente",
          message: `Se procesaron ${response.records_processed} registros`,
        });
      }

      setStatusData(newStatusData);
      setPollAttempts((prev) => prev + 1);
    } catch (error: any) {
      console.error("Error polling status:", error);

      // Handle authentication errors specifically
      if (error.status === 401) {
        setStatusData((prev) => ({
          ...prev,
          status: "error",
          message: "Sesión expirada. Por favor, inicia sesión nuevamente.",
          error: "Authentication required",
          endTime: new Date(),
        }));

        setIsPolling(false);

        if (onError) {
          onError("Sesión expirada. Por favor, inicia sesión nuevamente.");
        }
        return;
      }

      // Handle 404 - task not found (backend restarted or task expired)
      if (error.status === 404) {
        console.warn(`[UploadStatusTracker] Task not found (404): ${taskId}`);
        setStatusData((prev) => ({
          ...prev,
          status: "error",
          message:
            "La tarea ya no existe en el servidor (posible reinicio del backend)",
          error: "Task not found",
          endTime: new Date(),
        }));

        setIsPolling(false);

        if (onError) {
          onError("La tarea ya no existe en el servidor");
        }
        return;
      }

      // If we've made several attempts and still getting errors, stop polling
      if (pollAttempts > 5) {
        setStatusData((prev) => ({
          ...prev,
          status: "error",
          message: "Error al obtener el estado del procesamiento",
          error: error instanceof Error ? error.message : "Error de conexión",
          endTime: new Date(),
        }));

        setIsPolling(false);

        if (onError) {
          onError(error instanceof Error ? error.message : "Error de conexión");
        }
      } else {
        setPollAttempts((prev) => prev + 1);
      }
    }
  }, [
    taskId,
    isPolling,
    pollAttempts,
    maxPollAttempts,
    fileName,
    fileSize,
    statusData.startTime,
    onComplete,
    onError,
    addNotification,
  ]);

  // Start polling
  useEffect(() => {
    if (isPolling) {
      const interval = setInterval(pollStatus, pollInterval);
      return () => clearInterval(interval);
    }
  }, [pollStatus, pollInterval, isPolling]);

  // Initial poll
  useEffect(() => {
    pollStatus();
  }, []);

  const handleCancel = async () => {
    try {
      await apiService.cancelTask(taskId);
      setStatusData((prev) => ({
        ...prev,
        status: "cancelled",
        message: "Procesamiento cancelado",
        endTime: new Date(),
      }));
      setIsPolling(false);

      if (onCancel) {
        onCancel();
      }

      addNotification({
        type: "info",
        title: "Procesamiento cancelado",
        message: "La tarea ha sido cancelada exitosamente",
      });
    } catch (error) {
      console.error("Error cancelling task:", error);
      addNotification({
        type: "error",
        title: "Error al cancelar",
        message: "No se pudo cancelar la tarea",
      });
    }
  };

  const handleRetry = () => {
    setStatusData((prev) => ({
      ...prev,
      status: "uploading",
      progress: 0,
      message: "Reintentando...",
      error: undefined,
      startTime: new Date(),
      endTime: undefined,
    }));
    setPollAttempts(0);
    setIsPolling(true);
  };

  const handleDismiss = () => {
    setIsPolling(false);
  };

  return (
    <UploadStatus
      uploadData={statusData}
      onCancel={
        statusData.status === "uploading" || statusData.status === "processing"
          ? handleCancel
          : undefined
      }
      onRetry={statusData.status === "error" ? handleRetry : undefined}
      onDismiss={
        statusData.status === "completed" || statusData.status === "error"
          ? handleDismiss
          : undefined
      }
      className={className}
    />
  );
};

export default UploadStatusTracker;
