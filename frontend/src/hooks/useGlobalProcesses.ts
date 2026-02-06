/**
 * Hook para sincronizar procesos globalmente entre todos los usuarios
 * Implementa polling simple y eficiente
 */

import { useEffect, useRef } from 'react';
import { useUploadStore } from '../store/useUploadStore';
import { apiService } from '../services/api';

interface GlobalProcess {
  task_id: string;
  file_name: string;
  file_size: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress_percentage: number;
  message: string;
  records_processed: number;
  user_id: string;
  user_name: string;
  started_at: string;
  updated_at: string;
}

export const useGlobalProcesses = (options?: { enabled?: boolean }) => {
  const { tasks, updateTask } = useUploadStore();
  const intervalRef = useRef<number>();
  const finalStatusCheckedRef = useRef<Set<string>>(new Set());
  const enabled = options?.enabled !== false;
  
  useEffect(() => {
    if (!enabled) return;
    
    // Función de polling
    const poll = async () => {
      // Solo hacer polling si hay tareas activas
      const activeTasks = tasks.filter(t => 
        ['pending', 'uploading', 'processing'].includes(t.status) &&
        !t.taskId.startsWith('temp_')
      );
      
      if (activeTasks.length === 0) {
        // No hay tareas activas, detener polling
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = undefined;
          console.log('[GlobalProcesses] No active tasks, stopped polling');
        }
        return;
      }
      
      try {
        // Obtener tareas activas del servidor
        const response: any = await apiService.getIngestionTasks('active');
        const serverTasks: GlobalProcess[] = response.data || [];
        const serverTaskMap = new Map(serverTasks.map(t => [t.task_id, t]));
        
        // Actualizar cada tarea activa
        for (const task of activeTasks) {
          const serverTask = serverTaskMap.get(task.taskId);
          
          if (serverTask) {
            // Tarea aún activa en el servidor
            const newStatus = serverTask.status === 'completed' ? 'completed' : 
                             serverTask.status === 'failed' ? 'failed' : 
                             serverTask.status === 'processing' ? 'processing' : 'uploading';
            
            updateTask(task.id, {
              status: newStatus,
              progress: serverTask.progress_percentage,
              message: serverTask.message,
              recordsProcessed: serverTask.records_processed,
              endTime: ['completed', 'failed'].includes(serverTask.status) ? new Date() : undefined
            });
            
            finalStatusCheckedRef.current.delete(task.taskId);
            
          } else if (!finalStatusCheckedRef.current.has(task.taskId)) {
            // Tarea no está en lista activa, verificar estado final una sola vez
            finalStatusCheckedRef.current.add(task.taskId);
            
            try {
              const status = await apiService.getIngestionStatus(task.taskId);
              updateTask(task.id, {
                status: status.status === 'failed' ? 'failed' : 'completed',
                progress: status.progress_percentage || 100,
                message: status.message || 'Completado',
                recordsProcessed: status.records_processed,
                endTime: new Date()
              });
            } catch {
              // Si falla (404), marcar como completado
              updateTask(task.id, {
                status: 'completed',
                progress: 100,
                message: 'Completado',
                endTime: new Date()
              });
            }
          }
        }
      } catch (error: any) {
        if (error.status === 401) {
          // Error de autenticación, detener polling
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = undefined;
          }
        }
      }
    };
    
    // Iniciar polling solo si hay tareas activas y no está ya corriendo
    const activeTasks = tasks.filter(t => 
      ['pending', 'uploading', 'processing'].includes(t.status) &&
      !t.taskId.startsWith('temp_')
    );
    
    if (activeTasks.length > 0 && !intervalRef.current) {
      console.log('[GlobalProcesses] Starting polling for', activeTasks.length, 'tasks');
      poll(); // Ejecutar inmediatamente
      intervalRef.current = window.setInterval(poll, 4000);
    }
    
    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
    };
  }, [enabled]); // Solo depende de enabled, no de tasks
  
  return {
    isGlobalSyncActive: !!intervalRef.current
  };
};