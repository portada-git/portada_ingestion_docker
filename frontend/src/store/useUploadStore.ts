/**
 * Upload Store - Gestión persistente de uploads y procesos en segundo plano
 * Mantiene el estado de todos los uploads activos, completados y fallidos
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiService } from '../services/api';

export interface UploadTask {
  id: string;
  taskId: string;
  fileName: string;
  fileSize: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  message: string;
  ingestionType: 'extraction_data' | 'known_entities';
  publication?: string;
  entityName?: string;
  recordsProcessed?: number;
  estimatedTotal?: number;
  startTime: Date;
  endTime?: Date;
  error?: string;
  retryCount: number;
  maxRetries: number;
}

export interface UploadStats {
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalRecordsProcessed: number;
  averageProcessingTime: number;
}

interface UploadState {
  tasks: UploadTask[];
  historyTasks: UploadTask[];
  isPolling: boolean;
  pollInterval: number;
  isLoadingHistory: boolean;
  
  // Actions
  addTask: (task: Omit<UploadTask, 'id' | 'startTime' | 'retryCount'>) => string;
  updateTask: (id: string, updates: Partial<UploadTask>) => void;
  removeTask: (id: string) => void;
  clearCompletedTasks: () => void;
  clearOldHistory: (maxAgeDays?: number) => void;
  clearAllTasks: () => void;
  retryTask: (id: string) => void;
  cancelTask: (id: string) => void;
  fetchHistory: () => Promise<void>;
  
  // Getters
  getTask: (id: string) => UploadTask | undefined;
  getTaskByTaskId: (taskId: string) => UploadTask | undefined;
  getActiveTasks: () => UploadTask[];
  getCompletedTasks: () => UploadTask[];
  getFailedTasks: () => UploadTask[];
  getProcessingHistory: () => UploadTask[];
  getStats: () => UploadStats;
  
  // Polling control
  startPolling: () => void;
  stopPolling: () => void;
  setPollInterval: (interval: number) => void;
}

export const useUploadStore = create<UploadState>()(
  persist(
    (set, get) => ({
      tasks: [],
      historyTasks: [],
      isPolling: false,
      pollInterval: 3000, // 3 seconds
      isLoadingHistory: false,
      
      addTask: (taskData) => {
        const id = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        const task: UploadTask = {
          ...taskData,
          id,
          startTime: new Date(),
          retryCount: 0,
          maxRetries: 3,
        };
        
        set((state) => ({
          tasks: [...state.tasks, task]
        }));
        
        return id;
      },

      fetchHistory: async () => {
        set({ isLoadingHistory: true });
        try {
          const response: any = await apiService.getIngestionHistory({ page_size: 100 });
          if (response.success && response.records) {
            const history = response.records.map((record: any) => ({
              id: `db_${record.id}`,
              taskId: record.id,
              fileName: record.original_filename,
              fileSize: record.file_size,
              status: (record.processing_status === 'uploaded' ? 'completed' : record.processing_status) as any,
              progress: 100,
              message: record.error_message || 'Completado desde el historial',
              ingestionType: (record.metadata?.ingestion_type || 'extraction_data') as any,
              publication: record.metadata?.publication,
              entityName: record.metadata?.entity_name,
              recordsProcessed: record.records_processed,
              startTime: new Date(record.upload_timestamp),
              endTime: record.processing_completed_at ? new Date(record.processing_completed_at) : new Date(record.upload_timestamp),
              retryCount: record.retry_count || 0,
              maxRetries: 3
            }));
            set({ historyTasks: history });
          }
        } catch (error) {
          console.error('[UploadStore] Failed to fetch history:', error);
        } finally {
          set({ isLoadingHistory: false });
        }
      },
      
      updateTask: (id, updates) => {
        set((state) => ({
          tasks: state.tasks.map(task => 
            task.id === id 
              ? { 
                  ...task, 
                  ...updates,
                  // Set end time if status is final
                  endTime: ['completed', 'failed', 'cancelled'].includes(updates.status || task.status) 
                    ? updates.endTime || new Date() 
                    : task.endTime
                }
              : task
          )
        }));
      },
      
      removeTask: (id) => {
        set((state) => ({
          tasks: state.tasks.filter(task => task.id !== id)
        }));
      },
      
      clearCompletedTasks: () => {
        // Instead of removing completed tasks, we'll keep them as history
        // Only remove tasks older than 7 days to prevent unlimited growth
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        set((state) => ({
          tasks: state.tasks.filter(task => {
            // Keep active tasks
            if (['pending', 'uploading', 'processing'].includes(task.status)) {
              return true;
            }
            
            // Keep completed/failed tasks from last 7 days
            if (task.endTime && task.endTime > sevenDaysAgo) {
              return true;
            }
            
            // Remove very old tasks
            return false;
          })
        }));
      },
      
      clearAllTasks: () => {
        set({ tasks: [] });
      },
      
      retryTask: (id) => {
        set((state) => ({
          tasks: state.tasks.map(task => 
            task.id === id 
              ? {
                  ...task,
                  status: 'pending' as const,
                  progress: 0,
                  message: 'Reintentando...',
                  error: undefined,
                  retryCount: task.retryCount + 1,
                  startTime: new Date(),
                  endTime: undefined
                }
              : task
          )
        }));
      },
      
      cancelTask: (id) => {
        set((state) => ({
          tasks: state.tasks.map(task => 
            task.id === id 
              ? {
                  ...task,
                  status: 'cancelled' as const,
                  message: 'Cancelado por el usuario',
                  endTime: new Date()
                }
              : task
          )
        }));
      },
      
      getTask: (id) => {
        return get().tasks.find(task => task.id === id);
      },
      
      getTaskByTaskId: (taskId) => {
        return get().tasks.find(task => task.taskId === taskId);
      },
      
      getActiveTasks: () => {
        return get().tasks.filter(task => 
          ['pending', 'uploading', 'processing'].includes(task.status)
        );
      },
      
      getCompletedTasks: () => {
        return get().tasks.filter(task => task.status === 'completed');
      },
      
      getFailedTasks: () => {
        return get().tasks.filter(task => 
          ['failed', 'cancelled'].includes(task.status)
        );
      },
      
      // Add new method for managing history
      clearOldHistory: (maxAgeDays: number = 7) => {
        const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
        
        set((state) => ({
          tasks: state.tasks.filter(task => {
            // Keep active tasks
            if (['pending', 'uploading', 'processing'].includes(task.status)) {
              return true;
            }
            
            // Keep recent completed/failed tasks
            if (task.endTime && task.endTime > cutoffDate) {
              return true;
            }
            
            // Remove old tasks
            return false;
          })
        }));
      },
      
      // Get processing history (completed and failed tasks)
      getProcessingHistory: () => {
        return get().tasks.filter(task => 
          ['completed', 'failed', 'cancelled'].includes(task.status)
        ).sort((a, b) => {
          // Sort by end time, most recent first
          const aTime = a.endTime?.getTime() || 0;
          const bTime = b.endTime?.getTime() || 0;
          return bTime - aTime;
        });
      },
      
      getStats: () => {
        const tasks = get().tasks;
        const completedTasks = tasks.filter(t => t.status === 'completed');
        
        let averageProcessingTime = 0;
        if (completedTasks.length > 0) {
          const validCompletedTasks = completedTasks.filter(task => 
            task.startTime && task.endTime && 
            !isNaN(task.startTime.getTime()) && !isNaN(task.endTime.getTime())
          );
          
          if (validCompletedTasks.length > 0) {
            const totalTime = validCompletedTasks.reduce((sum, task) => {
              return sum + (task.endTime!.getTime() - task.startTime.getTime());
            }, 0);
            averageProcessingTime = totalTime / validCompletedTasks.length;
          }
        }
        
        // Calculate total records processed safely
        const totalRecordsProcessed = tasks.reduce((sum, t) => {
          const records = t.recordsProcessed || 0;
          return sum + (typeof records === 'number' && !isNaN(records) ? records : 0);
        }, 0);
        
        // Return stats with safe defaults
        const stats = {
          totalTasks: tasks.length || 0,
          activeTasks: tasks.filter(t => ['pending', 'uploading', 'processing'].includes(t.status)).length || 0,
          completedTasks: completedTasks.length || 0,
          failedTasks: tasks.filter(t => ['failed', 'cancelled'].includes(t.status)).length || 0,
          totalRecordsProcessed: totalRecordsProcessed || 0,
          averageProcessingTime: averageProcessingTime || 0
        };
        
        // Final safety check - replace any NaN values with 0
        return {
          totalTasks: isNaN(stats.totalTasks) ? 0 : stats.totalTasks,
          activeTasks: isNaN(stats.activeTasks) ? 0 : stats.activeTasks,
          completedTasks: isNaN(stats.completedTasks) ? 0 : stats.completedTasks,
          failedTasks: isNaN(stats.failedTasks) ? 0 : stats.failedTasks,
          totalRecordsProcessed: isNaN(stats.totalRecordsProcessed) ? 0 : stats.totalRecordsProcessed,
          averageProcessingTime: isNaN(stats.averageProcessingTime) ? 0 : stats.averageProcessingTime
        };
      },
      
      startPolling: () => {
        set({ isPolling: true });
      },
      
      stopPolling: () => {
        set({ isPolling: false });
      },
      
      setPollInterval: (interval) => {
        set({ pollInterval: interval });
      }
    }),
    {
      name: 'upload-storage',
      // Only persist essential data, not functions
      partialize: (state) => ({
        tasks: state.tasks.map(task => ({
          ...task,
          // Convert dates to strings for persistence
          startTime: task.startTime,
          endTime: task.endTime
        })),
        pollInterval: state.pollInterval
      }),
      // Rehydrate dates from strings
      onRehydrateStorage: () => (state) => {
        if (state?.tasks) {
          state.tasks = state.tasks.map(task => ({
            ...task,
            startTime: new Date(task.startTime),
            endTime: task.endTime ? new Date(task.endTime) : undefined
          }));
        }
      }
    }
  )
);