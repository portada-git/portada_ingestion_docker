/**
 * Process Dashboard View - Vista centralizada de todos los procesos de carga
 * Permite gestionar, monitorear y analizar todos los uploads del sistema
 * Lee datos directamente de Redis con paginación y auto-actualización
 */

import React, { useState, useMemo, useEffect, useCallback } from "react";
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
  History,
  User,
  RefreshCw,
} from "lucide-react";
import { clsx } from "clsx";
import { apiService } from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";

type FilterStatus = "all" | "queue" | "completed" | "error";
type FilterType = "all" | "entry" | "entity";
type TabType = "queue" | "completed";

interface RedisFile {
  file_key?: string; // Nueva estructura: UUID sin extensión
  id?: string; // Mantener para compatibilidad con datos antiguos
  original_filename?: string; // Nueva estructura: nombre original
  filename?: string; // Mantener para compatibilidad con datos antiguos
  stored_filename?: string; // Nueva estructura: nombre con el que se guardó
  file_path: string;
  file_type: string;
  status: number; // 0=en cola, 1=procesado, 2=error
  user: string;
  timestamp: number;
}

interface RedisFilesResponse {
  files: RedisFile[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

const ProcessDashboardView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>("queue");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "name" | "status">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  
  // Redis data state
  const [files, setFiles] = useState<RedisFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalFiles, setTotalFiles] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  
  // Global stats (independent of current page)
  const [globalStats, setGlobalStats] = useState({
    totalTasks: 0,
    activeTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
  });

  // Fetch global stats (all statuses)
  const fetchGlobalStats = useCallback(async () => {
    try {
      // Fetch counts for each status
      const [queueResponse, completedResponse, errorResponse] = await Promise.all([
        apiService.getIngestionFiles({ status: 0, page: 1, page_size: 1 }) as Promise<RedisFilesResponse>,
        apiService.getIngestionFiles({ status: 1, page: 1, page_size: 1 }) as Promise<RedisFilesResponse>,
        apiService.getIngestionFiles({ status: 2, page: 1, page_size: 1 }) as Promise<RedisFilesResponse>,
      ]);
      
      setGlobalStats({
        totalTasks: (queueResponse.total || 0) + (completedResponse.total || 0) + (errorResponse.total || 0),
        activeTasks: queueResponse.total || 0,
        completedTasks: completedResponse.total || 0,
        failedTasks: errorResponse.total || 0,
      });
    } catch (error) {
      console.error("Error fetching global stats:", error);
    }
  }, []);

  // Fetch files from Redis
  const fetchFiles = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    
    try {
      // Determine status filter based on active tab
      let statusFilter: number | undefined;
      if (activeTab === "queue") {
        // Queue: pending (0)
        statusFilter = 0;
      } else {
        // Finalizados: no filter (we'll get all and filter client-side for 1 and 2)
        statusFilter = undefined;
      }
      
      const response = await apiService.getIngestionFiles({
        status: statusFilter,
        page,
        page_size: pageSize,
      }) as RedisFilesResponse;
      
      let fetchedFiles = response.files || [];
      
      // If on completed tab, filter for status 1 or 2 client-side
      if (activeTab === "completed") {
        fetchedFiles = fetchedFiles.filter(f => f.status === 1 || f.status === 2);
      }
      
      setFiles(fetchedFiles);
      setTotalFiles(response.total || 0);
      setTotalPages(response.total_pages || 0);
    } catch (error) {
      console.error("Error fetching files:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeTab, page, pageSize]);

  // Initial fetch and tab change
  useEffect(() => {
    fetchFiles();
    fetchGlobalStats();
  }, [fetchFiles, fetchGlobalStats]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchFiles(true);
      fetchGlobalStats();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [fetchFiles, fetchGlobalStats]);

  // Calculate stats from current files (removed - now using globalStats)
  // const stats = useMemo(() => { ... }, [files, totalFiles]);

  // Filter and sort files
  const filteredFiles = useMemo(() => {
    let filtered = files;

    // Filter by status
    if (filterStatus !== "all") {
      if (filterStatus === "queue") {
        filtered = filtered.filter((file) => file.status === 0);
      } else if (filterStatus === "completed") {
        filtered = filtered.filter((file) => file.status === 1);
      } else if (filterStatus === "error") {
        filtered = filtered.filter((file) => file.status === 2);
      }
    }

    // Filter by type
    if (filterType !== "all") {
      if (filterType === "entry") {
        filtered = filtered.filter((file) => file.file_type === "entry");
      } else if (filterType === "entity") {
        filtered = filtered.filter((file) => file.file_type.startsWith("entity_"));
      }
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(
        (file) =>
          (file.original_filename || file.filename || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          file.user.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "date":
          comparison = a.timestamp - b.timestamp;
          break;
        case "name":
          const aName = a.original_filename || a.filename || "";
          const bName = b.original_filename || b.filename || "";
          comparison = aName.localeCompare(bName);
          break;
        case "status":
          comparison = a.status - b.status;
          break;
      }

      return sortOrder === "desc" ? -comparison : comparison;
    });

    return filtered;
  }, [files, filterStatus, filterType, searchTerm, sortBy, sortOrder]);

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusIcon = (status: number) => {
    switch (status) {
      case 0:
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 1:
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 2:
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: number) => {
    switch (status) {
      case 0:
        return "bg-yellow-100 text-yellow-800";
      case 1:
        return "bg-green-100 text-green-800";
      case 2:
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusLabel = (status: number) => {
    switch (status) {
      case 0:
        return "En Cola";
      case 1:
        return "Procesado";
      case 2:
        return "Error";
      default:
        return "Desconocido";
    }
  };

  const getFileTypeLabel = (fileType: string) => {
    if (fileType === "entry") return "Entrada de Barco";
    if (fileType.startsWith("entity_")) {
      const entityType = fileType.replace("entity_", "");
      return `Entidad: ${entityType}`;
    }
    return fileType;
  };

  const exportData = () => {
    const data = filteredFiles.map((file) => ({
      filename: file.filename,
      status: getStatusLabel(file.status),
      file_type: getFileTypeLabel(file.file_type),
      user: file.user,
      timestamp: formatTime(file.timestamp),
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
          {isRefreshing && (
            <RefreshCw className="w-4 h-4 ml-2 text-blue-500 animate-spin" />
          )}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Monitoreo y gestión centralizada de todos los procesos de carga desde Redis
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => {
              setActiveTab("queue");
              setPage(1);
            }}
            className={clsx(
              "py-2 px-1 border-b-2 font-medium text-sm",
              activeTab === "queue"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
            )}
          >
            <Activity className="w-4 h-4 inline mr-2" />
            En Cola
            {globalStats.activeTasks > 0 && (
              <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full">
                {globalStats.activeTasks}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab("completed");
              setPage(1);
            }}
            className={clsx(
              "py-2 px-1 border-b-2 font-medium text-sm",
              activeTab === "completed"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
            )}
          >
            <History className="w-4 h-4 inline mr-2" />
            Procesos Finalizados
            {(globalStats.completedTasks + globalStats.failedTasks) > 0 && (
              <span className="ml-2 bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full">
                {globalStats.completedTasks + globalStats.failedTasks}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                {globalStats.totalTasks}
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
              <p className="text-sm font-medium text-gray-600">En Cola</p>
              <p className="text-2xl font-bold text-gray-900">
                {globalStats.activeTasks}
              </p>
              <div className="flex items-center mt-1">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse mr-1" />
                <span className="text-xs text-green-600">Auto-actualización</span>
              </div>
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
                {globalStats.completedTasks}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Errores</p>
              <p className="text-2xl font-bold text-gray-900">
                {globalStats.failedTasks}
              </p>
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
                <option value="queue">En Cola</option>
                <option value="completed">Completados</option>
                <option value="error">Errores</option>
              </select>
            </div>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as FilterType)}
              className="input-sm"
            >
              <option value="all">Todos los tipos</option>
              <option value="entry">Entradas de Barco</option>
              <option value="entity">Entidades</option>
            </select>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar archivos o usuarios..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-sm pl-10"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => fetchFiles(true)}
              className="btn btn-secondary btn-sm"
              disabled={isRefreshing}
            >
              <RefreshCw className={clsx("w-4 h-4 mr-2", isRefreshing && "animate-spin")} />
              Actualizar
            </button>
            <button
              onClick={exportData}
              className="btn btn-secondary btn-sm"
              disabled={filteredFiles.length === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </button>
          </div>
        </div>
      </div>

      {/* Files Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">
            {activeTab === "queue" ? "Procesos en Cola" : "Procesos Completados"}{" "}
            ({filteredFiles.length})
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

        {isLoading ? (
          <div className="text-center py-12">
            <LoadingSpinner size="lg" />
            <p className="mt-4 text-gray-600">
              Cargando procesos desde Redis...
            </p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No hay procesos
            </h3>
            <p className="text-gray-600">
              {files.length === 0
                ? activeTab === "queue"
                  ? "No hay procesos en cola actualmente"
                  : "No hay procesos completados"
                : "No hay procesos que coincidan con los filtros aplicados"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Archivo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tipo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Usuario
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fecha
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredFiles.map((file) => (
                    <tr key={file.file_key || file.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {file.file_type === "entry" ? (
                            <FileText className="w-5 h-5 text-blue-500 mr-3" />
                          ) : (
                            <Database className="w-5 h-5 text-purple-500 mr-3" />
                          )}
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {file.original_filename || file.filename}
                            </div>
                            <div className="text-sm text-gray-500">
                              ID: {(file.file_key || file.id)?.substring(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {getFileTypeLabel(file.file_type)}
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <User className="w-4 h-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-900">{file.user}</span>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {getStatusIcon(file.status)}
                          <span
                            className={clsx(
                              "ml-2 px-2 py-1 text-xs font-medium rounded-full",
                              getStatusColor(file.status),
                            )}
                          >
                            {getStatusLabel(file.status)}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatTime(file.timestamp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Mostrar:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="input-sm"
                >
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
                <span className="text-sm text-gray-600">por página</span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="btn btn-secondary btn-sm"
                >
                  Anterior
                </button>
                <span className="text-sm text-gray-600">
                  Página {page} de {totalPages || 1}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="btn btn-secondary btn-sm"
                >
                  Siguiente
                </button>
              </div>

              <div className="text-sm text-gray-600">
                Total: {totalFiles} archivos
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ProcessDashboardView;
