/**
 * Upload Monitor - Componente persistente que monitorea uploads en segundo plano
 * Se mantiene activo independientemente de la vista actual
 */

import React, { useEffect, useCallback, useRef } from "react";
import { X, RotateCcw, Minimize2, Maximize2 } from "lucide-react";
import { clsx } from "clsx";
import { useUploadStore, UploadTask } from "../store/useUploadStore";
import { useNotificationStore } from "../store/useStore";
import { useGlobalProcesses } from "../hooks/useGlobalProcesses";
import { apiService } from "../services/api";
import LoadingSpinner from "./LoadingSpinner";

interface UploadMonitorProps {
  className?: string;
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  minimized?: boolean;
  onToggleMinimize?: () => void;
}

const UploadMonitor: React.FC<UploadMonitorProps> = ({
  className = "",
  position = "bottom-right",
  minimized = false,
  onToggleMinimize,
}) => {
  const { addNotification } = useNotificationStore();

  const {
    tasks,
    isPolling,
    pollInterval,
    updateTask,
    removeTask,
    retryTask,
    cancelTask,
    getActiveTasks,
    getStats,
    startPolling,
    stopPolling,
  } = useUploadStore();

  // Global processes sync
  const { isGlobalSyncActive } = useGlobalProcesses();

  const pollTimeoutRef = useRef<number>();
  const activeTasks = getActiveTasks();
  const stats = getStats();

  // Polling function
  const pollTaskStatus = useCallback(
    async (task: UploadTask) => {
      // Skip polling for tasks with temporary taskIds
      if (task.taskId.startsWith("temp_")) {
        console.log(
          `[UploadMonitor] Skipping polling for temp task: ${task.fileName}`,
        );
        return;
      }

      console.log(
        `[UploadMonitor] Polling task: ${task.fileName} (${task.taskId})`,
      );

      try {
        const response = await apiService.getIngestionStatus(task.taskId);
        console.log(
          `[UploadMonitor] Poll response for ${task.fileName}:`,
          response,
        );

        const newStatus =
          response.status === "completed"
            ? "completed"
            : response.status === "failed"
              ? "failed"
              : response.status === "processing"
                ? "processing"
                : "uploading";

        const updates: Partial<UploadTask> = {
          status: newStatus,
          progress: response.progress_percentage || task.progress,
          message: response.message || task.message,
          recordsProcessed: response.records_processed || task.recordsProcessed,
          estimatedTotal: response.estimated_total || task.estimatedTotal,
        };

        console.log(
          `[UploadMonitor] Updating task ${task.fileName} with:`,
          updates,
        );

        // Handle completion
        if (response.status === "completed") {
          updates.endTime = new Date();
          addNotification({
            type: "success",
            title: "Archivo procesado",
            message: `${task.fileName}: ${response.records_processed} registros procesados`,
          });
        }

        // Handle failure
        if (response.status === "failed") {
          updates.endTime = new Date();
          updates.error = response.message || "Error desconocido";
          addNotification({
            type: "error",
            title: "Error en procesamiento",
            message: `${task.fileName}: ${updates.error}`,
          });
        }

        updateTask(task.id, updates);
      } catch (error: any) {
        console.error(
          `[UploadMonitor] Error polling task ${task.fileName}:`,
          error,
        );

        // Handle authentication errors - stop polling
        if (error.status === 401) {
          console.warn(
            "[UploadMonitor] Authentication error - stopping polling",
          );
          stopPolling();
          addNotification({
            type: "warning",
            title: "Sesión expirada",
            message:
              "Por favor, inicia sesión nuevamente para continuar monitoreando los procesos",
          });
          return;
        }

        // Handle 404 - task not found (backend restarted or task expired)
        if (error.status === 404) {
          console.warn(
            `[UploadMonitor] Task not found (404) - removing from store: ${task.fileName}`,
          );
          removeTask(task.id);
          addNotification({
            type: "info",
            title: "Tarea no encontrada",
            message: `La tarea "${task.fileName}" ya no existe en el servidor`,
          });
          return;
        }

        // If we can't get status, mark as failed after several attempts
        if (task.retryCount >= 3) {
          updateTask(task.id, {
            status: "failed",
            error: "No se pudo obtener el estado del procesamiento",
            endTime: new Date(),
          });
        }
      }
    },
    [updateTask, addNotification, stopPolling, removeTask],
  );

  // Main polling loop
  const pollAllActiveTasks = useCallback(async () => {
    const currentActiveTasks = getActiveTasks();

    if (currentActiveTasks.length === 0) {
      stopPolling();
      return;
    }

    // Poll each active task
    await Promise.all(currentActiveTasks.map((task) => pollTaskStatus(task)));

    // Schedule next poll
    if (isPolling) {
      pollTimeoutRef.current = window.setTimeout(
        pollAllActiveTasks,
        pollInterval,
      );
    }
  }, [getActiveTasks, pollTaskStatus, isPolling, pollInterval, stopPolling]);

  // Start polling when there are active tasks
  useEffect(() => {
    if (activeTasks.length > 0 && !isPolling) {
      startPolling();
    }
  }, [activeTasks.length, isPolling, startPolling]);

  // Handle polling lifecycle
  useEffect(() => {
    if (isPolling && activeTasks.length > 0) {
      pollAllActiveTasks();
    }

    return () => {
      if (pollTimeoutRef.current) {
        window.clearTimeout(pollTimeoutRef.current);
      }
    };
  }, [isPolling, pollAllActiveTasks, activeTasks.length]);

  // Auto-stop polling when no active tasks
  useEffect(() => {
    if (isPolling && activeTasks.length === 0) {
      stopPolling();
    }
  }, [activeTasks.length, isPolling, stopPolling]);

  const handleRetry = (taskId: string) => {
    retryTask(taskId);
    if (!isPolling) {
      startPolling();
    }
  };

  const handleCancel = async (task: UploadTask) => {
    try {
      await apiService.cancelTask(task.taskId);
      cancelTask(task.id);
      addNotification({
        type: "info",
        title: "Procesamiento cancelado",
        message: `${task.fileName} ha sido cancelado`,
      });
    } catch (error) {
      console.error("Error cancelling task:", error);
      addNotification({
        type: "error",
        title: "Error al cancelar",
        message: "No se pudo cancelar el procesamiento",
      });
    }
  };

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatFileSize = (bytes: number): string => {
    const sizes = ["B", "KB", "MB", "GB"];
    if (bytes === 0) return "0 B";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  // Don't render if no tasks or only old completed/failed tasks
  const hasActiveTasks = activeTasks.length > 0;
  const recentCompletedTasks = tasks.filter((task) => {
    if (!["completed", "failed", "cancelled"].includes(task.status))
      return false;
    if (!task.endTime) return false;

    // Show completed/failed tasks for 30 seconds after completion
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
    return task.endTime > thirtySecondsAgo;
  });

  // Only show if there are active tasks or recent completed tasks
  if (!hasActiveTasks && recentCompletedTasks.length === 0) {
    return null;
  }

  const positionClasses = {
    "bottom-right": "bottom-4 right-4",
    "bottom-left": "bottom-4 left-4",
    "top-right": "top-4 right-4",
    "top-left": "top-4 left-4",
  };

  return (
    <div
      className={clsx(
        "fixed z-50 max-w-md w-full",
        positionClasses[position],
        className,
      )}
    >
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1">
                {activeTasks.length > 0 && <LoadingSpinner size="sm" />}
                <h3 className="font-medium text-gray-900">Procesos de Carga</h3>
              </div>
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                {isNaN(stats.activeTasks) ? 0 : stats.activeTasks} activos
              </span>
              {isGlobalSyncActive && (
                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                  🌐 Global
                </span>
              )}
            </div>

            <div className="flex items-center space-x-1">
              <button
                onClick={onToggleMinimize}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                title={minimized ? "Expandir" : "Minimizar"}
              >
                {minimized ? (
                  <Maximize2 className="w-4 h-4" />
                ) : (
                  <Minimize2 className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Stats */}
          {!minimized && (
            <div className="mt-2 flex items-center space-x-4 text-xs text-gray-600">
              <span>
                Total: {isNaN(stats.totalTasks) ? 0 : stats.totalTasks}
              </span>
              <span>
                Completados:{" "}
                {isNaN(stats.completedTasks) ? 0 : stats.completedTasks}
              </span>
              <span>
                Fallidos: {isNaN(stats.failedTasks) ? 0 : stats.failedTasks}
              </span>
              {stats.totalRecordsProcessed &&
                !isNaN(stats.totalRecordsProcessed) &&
                stats.totalRecordsProcessed > 0 && (
                  <span>
                    Registros: {stats.totalRecordsProcessed.toLocaleString()}
                  </span>
                )}
            </div>
          )}
        </div>

        {/* Task List */}
        {!minimized && (
          <div className="max-h-96 overflow-y-auto">
            {tasks
              .slice(-10)
              .reverse()
              .map((task) => (
                <div
                  key={task.id}
                  className="p-3 border-b border-gray-100 last:border-b-0"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <div
                          className={clsx(
                            "w-2 h-2 rounded-full flex-shrink-0",
                            {
                              "bg-yellow-400": task.status === "pending",
                              "bg-blue-500": [
                                "uploading",
                                "processing",
                              ].includes(task.status),
                              "bg-green-500": task.status === "completed",
                              "bg-red-500": ["failed", "cancelled"].includes(
                                task.status,
                              ),
                            },
                          )}
                        />

                        <p className="text-sm font-medium text-gray-900 truncate">
                          {task.fileName}
                        </p>
                      </div>

                      <div className="mt-1 flex items-center space-x-3 text-xs text-gray-500">
                        <span>{formatFileSize(task.fileSize)}</span>
                        <span className="capitalize">{task.status}</span>
                        {task.recordsProcessed && (
                          <span>{task.recordsProcessed} registros</span>
                        )}
                      </div>

                      {/* Progress Bar */}
                      {["uploading", "processing"].includes(task.status) && (
                        <div className="mt-2">
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Message */}
                      <p className="mt-1 text-xs text-gray-600 truncate">
                        {task.message}
                      </p>

                      {/* Error */}
                      {task.error && (
                        <p className="mt-1 text-xs text-red-600 truncate">
                          {task.error}
                        </p>
                      )}

                      {/* Time info */}
                      {task.endTime && (
                        <p className="mt-1 text-xs text-gray-500">
                          Duración:{" "}
                          {formatTime(
                            task.endTime.getTime() - task.startTime.getTime(),
                          )}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-1 ml-2">
                      {task.status === "failed" &&
                        task.retryCount < task.maxRetries && (
                          <button
                            onClick={() => handleRetry(task.id)}
                            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                            title="Reintentar"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}

                      {["uploading", "processing"].includes(task.status) && (
                        <button
                          onClick={() => handleCancel(task)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          title="Cancelar"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}

                      {["completed", "failed", "cancelled"].includes(
                        task.status,
                      ) && (
                        <button
                          onClick={() => removeTask(task.id)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          title="Eliminar"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Footer with polling status */}
        {!minimized && (isPolling || isGlobalSyncActive) && (
          <div className="bg-gray-50 px-4 py-2 border-t border-gray-200">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span>
                  {isGlobalSyncActive
                    ? "Sincronizando con todos los usuarios"
                    : "Monitoreando procesos activos"}
                </span>
              </div>
              <span>
                {isGlobalSyncActive
                  ? "Cada 5s"
                  : `Cada ${pollInterval / 1000}s`}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadMonitor;
