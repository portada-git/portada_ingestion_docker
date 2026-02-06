/**
 * Process Dashboard View - Vista centralizada de todos los procesos de carga
 * Permite gestionar, monitorear y analizar todos los uploads del sistema
 * Incluye pestañas para procesos activos e historial completo
 */

import React, { useState, useMemo } from "react";
import {
  Activity,
  CheckCircle,
  AlertCircle,
  Clock,
  Download,
  Filter,
  Search,
  BarChart3,
  FileText,
  Database,
  Zap,
  TrendingUp,
  History,
} from "lucide-react";
import { clsx } from "clsx";
import { useUploadStore, UploadTask } from "../store/useUploadStore";
import { useGlobalProcesses } from "../hooks/useGlobalProcesses";
import LoadingSpinner from "../components/LoadingSpinner";

type FilterStatus = "all" | "active" | "completed" | "failed";
type FilterType = "all" | "extraction_data" | "known_entities";
type TabType = "active" | "history";

const ProcessDashboardView: React.FC = () => {
  const {
    tasks,
    historyTasks,
    isLoadingHistory,
    getStats,
    fetchHistory,
    getProcessingHistory,
  } = useUploadStore();

  // Enable global process syncing for this view
  const { isGlobalSyncActive } = useGlobalProcesses({ enabled: true });

  const [activeTab, setActiveTab] = useState<TabType>("active");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "name" | "status">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Fetch history when history tab is clicked
  React.useEffect(() => {
    if (activeTab === "history") {
      fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  const stats = getStats();

  // Get tasks based on active tab
  const currentTasks = useMemo(() => {
    if (activeTab === "active") {
      return tasks.filter((task) =>
        ["pending", "uploading", "processing"].includes(task.status),
      );
    } else {
      // Combine local history with DB history, avoiding duplicates by taskId
      const localHistory = tasks.filter((t) =>
        ["completed", "failed", "cancelled"].includes(t.status),
      );

      const dbHistory = historyTasks || [];

      // Map to avoid duplicates, prioritizing local state for recent tasks
      const combinedMap = new Map<string, UploadTask>();

      dbHistory.forEach((task) => {
        combinedMap.set(task.taskId, task);
      });

      localHistory.forEach((task) => {
        combinedMap.set(task.taskId, task);
      });

      return Array.from(combinedMap.values());
    }
  }, [activeTab, tasks, historyTasks]);

  // Filter and sort tasks
  const filteredTasks = useMemo(() => {
    let filtered = currentTasks;

    // Filter by status
    if (filterStatus !== "all") {
      if (filterStatus === "active") {
        filtered = filtered.filter((task) =>
          ["pending", "uploading", "processing"].includes(task.status),
        );
      } else if (filterStatus === "completed") {
        filtered = filtered.filter((task) => task.status === "completed");
      } else if (filterStatus === "failed") {
        filtered = filtered.filter((task) =>
          ["failed", "cancelled"].includes(task.status),
        );
      }
    }

    // Filter by type
    if (filterType !== "all") {
      filtered = filtered.filter((task) => task.ingestionType === filterType);
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(
        (task) =>
          task.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          task.publication?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          task.message.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "date":
          // For history tab, sort by end time; for active tab, sort by start time
          const aTime =
            activeTab === "history"
              ? a.endTime?.getTime() || 0
              : a.startTime.getTime();
          const bTime =
            activeTab === "history"
              ? b.endTime?.getTime() || 0
              : b.startTime.getTime();
          comparison = aTime - bTime;
          break;
        case "name":
          comparison = a.fileName.localeCompare(b.fileName);
          break;
        case "status":
          comparison = a.status.localeCompare(b.status);
          break;
      }

      return sortOrder === "desc" ? -comparison : comparison;
    });

    return filtered;
  }, [
    currentTasks,
    filterStatus,
    filterType,
    searchTerm,
    sortBy,
    sortOrder,
    activeTab,
  ]);

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

  const getStatusIcon = (status: UploadTask["status"]) => {
    switch (status) {
      case "pending":
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case "uploading":
      case "processing":
        return <LoadingSpinner size="sm" />;
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "failed":
      case "cancelled":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: UploadTask["status"]) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "uploading":
      case "processing":
        return "bg-blue-100 text-blue-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "failed":
      case "cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusLabel = (status: UploadTask["status"]) => {
    switch (status) {
      case "pending":
      case "uploading":
      case "processing":
        return "En cola";
      case "completed":
        return "Procesado";
      case "failed":
        return "Fallido";
      case "cancelled":
        return "Cancelado";
      default:
        return status;
    }
  };

  const exportData = () => {
    const data = filteredTasks.map((task) => ({
      fileName: task.fileName,
      status: task.status,
      ingestionType: task.ingestionType,
      publication: task.publication,
      recordsProcessed: task.recordsProcessed,
      startTime: task.startTime.toISOString(),
      endTime: task.endTime?.toISOString(),
      duration: task.endTime
        ? task.endTime.getTime() - task.startTime.getTime()
        : null,
      error: task.error,
    }));

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `process-dashboard-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Activity className="w-6 h-6 mr-2" />
          Dashboard de Procesos
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Monitoreo y gestión centralizada de todos los procesos de carga
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("active")}
            className={clsx(
              "py-2 px-1 border-b-2 font-medium text-sm",
              activeTab === "active"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
            )}
          >
            <Activity className="w-4 h-4 inline mr-2" />
            Procesos Activos
            {stats.activeTasks &&
              !isNaN(stats.activeTasks) &&
              stats.activeTasks > 0 && (
                <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full">
                  {stats.activeTasks}
                </span>
              )}
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={clsx(
              "py-2 px-1 border-b-2 font-medium text-sm",
              activeTab === "history"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
            )}
          >
            <History className="w-4 h-4 inline mr-2" />
            Historial Completo
            {currentTasks.length > 0 && activeTab === "history" && (
              <span className="ml-2 bg-gray-100 text-gray-800 text-xs font-medium px-2 py-1 rounded-full">
                {currentTasks.length}
              </span>
            )}
            {activeTab === "active" && getProcessingHistory().length > 0 && (
              <span className="ml-2 bg-gray-100 text-gray-500 text-xs font-medium px-2 py-1 rounded-full">
                {getProcessingHistory().length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <BarChart3 className="w-8 h-8 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">
                Total Procesos
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {isNaN(stats.totalTasks) ? 0 : stats.totalTasks || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Zap className="w-8 h-8 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Activos</p>
              <p className="text-2xl font-bold text-gray-900">
                {isNaN(stats.activeTasks) ? 0 : stats.activeTasks || 0}
              </p>
              {isGlobalSyncActive && (
                <div className="flex items-center mt-1">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse mr-1" />
                  <span className="text-xs text-green-600">Sincronizando</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Completados</p>
              <p className="text-2xl font-bold text-gray-900">
                {isNaN(stats.completedTasks) ? 0 : stats.completedTasks || 0}
              </p>
              {stats.totalTasks &&
                !isNaN(stats.totalTasks) &&
                stats.totalTasks > 0 && (
                  <p className="text-xs text-gray-500">
                    {Math.round(
                      ((isNaN(stats.completedTasks)
                        ? 0
                        : stats.completedTasks) /
                        stats.totalTasks) *
                        100,
                    )}
                    % éxito
                  </p>
                )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Fallidos</p>
              <p className="text-2xl font-bold text-gray-900">
                {isNaN(stats.failedTasks) ? 0 : stats.failedTasks || 0}
              </p>
              {stats.totalTasks &&
                !isNaN(stats.totalTasks) &&
                stats.totalTasks > 0 && (
                  <p className="text-xs text-gray-500">
                    {Math.round(
                      ((isNaN(stats.failedTasks) ? 0 : stats.failedTasks) /
                        stats.totalTasks) *
                        100,
                    )}
                    % fallos
                  </p>
                )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <TrendingUp className="w-8 h-8 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Registros</p>
              <p className="text-2xl font-bold text-gray-900">
                {(isNaN(stats.totalRecordsProcessed)
                  ? 0
                  : stats.totalRecordsProcessed || 0
                ).toLocaleString()}
              </p>
              {stats.averageProcessingTime &&
                !isNaN(stats.averageProcessingTime) &&
                stats.averageProcessingTime > 0 && (
                  <p className="text-xs text-gray-500">
                    Promedio: {formatTime(stats.averageProcessingTime)}
                  </p>
                )}
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="card">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          {/* Filters */}
          <div className="flex flex-wrap items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={filterStatus}
                onChange={(e) =>
                  setFilterStatus(e.target.value as FilterStatus)
                }
                className="input-sm"
              >
                <option value="all">Todos los estados</option>
                <option value="active">Activos</option>
                <option value="completed">Completados</option>
                <option value="failed">Fallidos</option>
              </select>
            </div>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as FilterType)}
              className="input-sm"
            >
              <option value="all">Todos los tipos</option>
              <option value="extraction_data">Datos de Extracción</option>
              <option value="known_entities">Entidades Conocidas</option>
            </select>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar archivos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-sm pl-10"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-2">
            <button
              onClick={exportData}
              className="btn btn-secondary btn-sm"
              disabled={filteredTasks.length === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </button>
          </div>
        </div>
      </div>

      {/* Tasks Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">
            {activeTab === "active" ? "Procesos Activos" : "Historial Completo"}{" "}
            ({filteredTasks.length})
          </h3>

          {/* Sort Controls */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Ordenar por:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="input-sm"
            >
              <option value="date">Fecha</option>
              <option value="name">Nombre</option>
              <option value="status">Estado</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              className="btn btn-secondary btn-sm"
            >
              {sortOrder === "asc" ? "↑" : "↓"}
            </button>
          </div>
        </div>

        {isLoadingHistory && activeTab === "history" ? (
          <div className="text-center py-12">
            <LoadingSpinner size="lg" />
            <p className="mt-4 text-gray-600">
              Cargando historial desde el servidor...
            </p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No hay procesos
            </h3>
            <p className="text-gray-600">
              {currentTasks.length === 0
                ? activeTab === "active"
                  ? "No se han iniciado procesos de carga aún"
                  : "No hay historial de procesamiento disponible"
                : "No hay procesos que coincidan con los filtros aplicados"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Archivo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTasks.map((task) => (
                  <tr key={task.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {task.ingestionType === "extraction_data" ? (
                          <FileText className="w-5 h-5 text-blue-500 mr-3" />
                        ) : (
                          <Database className="w-5 h-5 text-purple-500 mr-3" />
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {task.fileName}
                          </div>
                          <div className="text-sm text-gray-500">
                            {formatFileSize(task.fileSize)}
                            {task.publication && ` • ${task.publication}`}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getStatusIcon(task.status)}
                        <span
                          className={clsx(
                            "ml-2 px-2 py-1 text-xs font-medium rounded-full",
                            getStatusColor(task.status),
                          )}
                        >
                          {getStatusLabel(task.status)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProcessDashboardView;
