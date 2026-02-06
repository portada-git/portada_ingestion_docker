/**
 * Daily Entries Analysis component
 * Visualizes daily entry counts with multiple chart types
 */

import React, { useState, useMemo } from 'react';
import { BarChart3, Calendar, TrendingUp, Download, Search, Filter } from 'lucide-react';
import { useNotificationStore } from '../../store/useStore';
import { apiService } from '../../services/api';
import PublicationSelector from '../PublicationSelector';
import DateRangePicker from '../forms/DateRangePicker';
import LoadingSpinner from '../LoadingSpinner';

interface DailyEntry {
  date: string;
  count: number;
  publication: string;
}

interface DailyEntriesData {
  publication: string;
  daily_counts: DailyEntry[];
  total_entries: number;
  date_range: {
    start_date: string;
    end_date: string;
  };
}

const DailyEntriesAnalysis: React.FC = () => {
  const { addNotification } = useNotificationStore();
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<DailyEntriesData | null>(null);
  const [filters, setFilters] = useState({
    publication: '',
    startDate: '',
    endDate: ''
  });

  const loadDailyEntries = async () => {
    if (!filters.publication) {
      addNotification({
        type: 'warning',
        title: 'Publicación requerida',
        message: 'Por favor selecciona una publicación'
      });
      return;
    }

    try {
      setIsLoading(true);
      const response = await apiService.getDailyEntries({
        publication: filters.publication,
        start_date: filters.startDate || undefined,
        end_date: filters.endDate || undefined
      });
      setData(response as DailyEntriesData);
      
      addNotification({
        type: 'success',
        title: 'Datos cargados',
        message: `Se encontraron ${response.total_entries} entradas en ${response.daily_counts.length} días`
      });
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Error al cargar datos',
        message: error instanceof Error ? error.message : 'Error desconocido'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilterChange = (field: string, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleExport = () => {
    if (!data || data.daily_counts.length === 0) return;
    
    const csvContent = [
      'Fecha,Cantidad,Publicación',
      ...data.daily_counts.map(item => 
        `${item.date},${item.count},${item.publication}`
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `entradas_diarias_${data.publication}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Calculate statistics
  const stats = useMemo(() => {
    if (!data || data.daily_counts.length === 0) return null;

    const counts = data.daily_counts.map(d => d.count);
    const total = data.total_entries;
    const days = data.daily_counts.length;
    const avg = Math.round(total / days);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    
    return { total, days, avg, max, min };
  }, [data]);

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!data || data.daily_counts.length === 0) return null;

    // Find max value for scaling
    const maxCount = Math.max(...data.daily_counts.map(d => d.count));
    
    return data.daily_counts.map(entry => ({
      ...entry,
      percentage: (entry.count / maxCount) * 100
    }));
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cantidad de Entradas Diarias</h1>
        <p className="mt-1 text-sm text-gray-600">
          Analizar la distribución de entradas por fecha
        </p>
      </div>

      {/* Filters */}
      <div className="card">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          <Filter className="w-5 h-5 inline mr-2" />
          Filtros de Búsqueda
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="publication" className="block text-sm font-medium text-gray-700 mb-2">
              Publicación *
            </label>
            <PublicationSelector
              value={filters.publication}
              onChange={(value) => handleFilterChange('publication', value)}
              placeholder="Selecciona una publicación"
              includeAll={false}
            />
          </div>
          
          <DateRangePicker
            value={{ startDate: filters.startDate, endDate: filters.endDate }}
            onChange={(range) => {
              handleFilterChange('startDate', range?.startDate || '');
              handleFilterChange('endDate', range?.endDate || '');
            }}
            label="Rango de Fechas (Opcional)"
          />
          
          <div className="flex items-end space-x-2">
            <button
              onClick={loadDailyEntries}
              disabled={isLoading || !filters.publication}
              className="btn btn-primary flex-1"
            >
              {isLoading ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Cargando...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Consultar Entradas
                </>
              )}
            </button>
            
            {data && (
              <button
                onClick={handleExport}
                className="btn btn-secondary"
                title="Exportar datos"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="card bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">Total Entradas</p>
                <p className="text-2xl font-bold text-blue-900">{stats.total.toLocaleString()}</p>
              </div>
              <BarChart3 className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          
          <div className="card bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">Días con Datos</p>
                <p className="text-2xl font-bold text-green-900">{stats.days}</p>
              </div>
              <Calendar className="w-8 h-8 text-green-500" />
            </div>
          </div>
          
          <div className="card bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600">Promedio/Día</p>
                <p className="text-2xl font-bold text-purple-900">{stats.avg}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-purple-500" />
            </div>
          </div>
          
          <div className="card bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-600">Máximo</p>
                <p className="text-2xl font-bold text-orange-900">{stats.max}</p>
              </div>
              <div className="text-orange-500 text-xl font-bold">↑</div>
            </div>
          </div>
          
          <div className="card bg-gradient-to-br from-red-50 to-red-100 border-red-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-600">Mínimo</p>
                <p className="text-2xl font-bold text-red-900">{stats.min}</p>
              </div>
              <div className="text-red-500 text-xl font-bold">↓</div>
            </div>
          </div>
        </div>
      )}

      {/* Bar Chart */}
      {chartData && chartData.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                📊 Gráfico de Entradas Diarias
              </h3>
              <p className="text-sm text-gray-600">
                Publicación: <span className="font-semibold">{data?.publication.toUpperCase()}</span>
                {data?.date_range && (
                  <span className="ml-2">
                    | Período: {data.date_range.start_date} a {data.date_range.end_date}
                  </span>
                )}
              </p>
            </div>
          </div>
          
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {chartData.map((entry, index) => (
              <div key={index} className="flex items-center space-x-3">
                <div className="w-24 text-sm text-gray-600 font-mono">
                  {entry.date}
                </div>
                <div className="flex-1 flex items-center space-x-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-8 relative overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                      style={{ width: `${entry.percentage}%` }}
                    >
                      {entry.percentage > 15 && (
                        <span className="text-white text-xs font-bold">
                          {entry.count}
                        </span>
                      )}
                    </div>
                  </div>
                  {entry.percentage <= 15 && (
                    <span className="text-sm font-semibold text-gray-700 w-8">
                      {entry.count}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data Table */}
      {data && data.daily_counts.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            📋 Resultados de Entradas Diarias
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Total de entradas: <span className="font-bold text-green-600">{data.total_entries}</span>
          </p>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cantidad
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Publicación
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.daily_counts.map((entry, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                      {entry.date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-800">
                        {entry.count}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-900">
                      {entry.publication.toUpperCase()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!data && !isLoading && (
        <div className="card">
          <div className="text-center py-12">
            <BarChart3 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No hay datos para mostrar
            </h3>
            <p className="text-gray-600 mb-4">
              Selecciona una publicación y haz clic en "Consultar Entradas" para ver los datos
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyEntriesAnalysis;