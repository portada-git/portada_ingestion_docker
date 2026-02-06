/**
 * Data Export Component
 * Provides functionality to export data in various formats
 */

import React, { useState } from 'react';
import { 
  Download, 
  FileText, 
  Table, 
  Code, 
  Loader2,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { clsx } from 'clsx';

interface ExportFormat {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  extension: string;
}

interface DataExportProps {
  data: any[];
  filename?: string;
  title?: string;
  onExport?: (format: string, data: any[]) => Promise<void>;
  className?: string;
}

const DataExport: React.FC<DataExportProps> = ({
  data,
  filename = 'export',
  title = 'Exportar Datos',
  onExport,
  className
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [selectedFormat, setSelectedFormat] = useState<string>('csv');

  const formats: ExportFormat[] = [
    {
      id: 'csv',
      name: 'CSV',
      description: 'Valores separados por comas',
      icon: <Table className="w-5 h-5" />,
      extension: 'csv'
    },
    {
      id: 'json',
      name: 'JSON',
      description: 'JavaScript Object Notation',
      icon: <Code className="w-5 h-5" />,
      extension: 'json'
    },
    {
      id: 'txt',
      name: 'TXT',
      description: 'Texto plano',
      icon: <FileText className="w-5 h-5" />,
      extension: 'txt'
    }
  ];

  const convertToCSV = (data: any[]): string => {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvHeaders = headers.join(',');
    
    const csvRows = data.map(row => 
      headers.map(header => {
        const value = row[header];
        // Escape commas and quotes in CSV
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    );
    
    return [csvHeaders, ...csvRows].join('\n');
  };

  const convertToJSON = (data: any[]): string => {
    return JSON.stringify(data, null, 2);
  };

  const convertToTXT = (data: any[]): string => {
    return data.map(item => 
      Object.entries(item)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n')
    ).join('\n\n');
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    if (data.length === 0) {
      setExportStatus('error');
      setTimeout(() => setExportStatus('idle'), 3000);
      return;
    }

    setIsExporting(true);
    setExportStatus('idle');

    try {
      const format = formats.find(f => f.id === selectedFormat);
      if (!format) throw new Error('Formato no válido');

      let content: string;
      let mimeType: string;

      switch (selectedFormat) {
        case 'csv':
          content = convertToCSV(data);
          mimeType = 'text/csv;charset=utf-8;';
          break;
        case 'json':
          content = convertToJSON(data);
          mimeType = 'application/json;charset=utf-8;';
          break;
        case 'txt':
          content = convertToTXT(data);
          mimeType = 'text/plain;charset=utf-8;';
          break;
        default:
          throw new Error('Formato no soportado');
      }

      // If custom export handler is provided, use it
      if (onExport) {
        await onExport(selectedFormat, data);
      } else {
        // Default download behavior
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const fullFilename = `${filename}_${timestamp}.${format.extension}`;
        downloadFile(content, fullFilename, mimeType);
      }

      setExportStatus('success');
      setTimeout(() => setExportStatus('idle'), 3000);
    } catch (error) {
      console.error('Error exporting data:', error);
      setExportStatus('error');
      setTimeout(() => setExportStatus('idle'), 3000);
    } finally {
      setIsExporting(false);
    }
  };

  const getStatusIcon = () => {
    switch (exportStatus) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusMessage = () => {
    switch (exportStatus) {
      case 'success':
        return 'Exportación completada';
      case 'error':
        return 'Error en la exportación';
      default:
        return null;
    }
  };

  return (
    <div className={clsx('bg-white border border-gray-200 rounded-lg p-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <Download className="w-5 h-5 mr-2" />
          {title}
        </h3>
        <div className="text-sm text-gray-500">
          {data.length} registro{data.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Format Selection */}
      <div className="space-y-3 mb-4">
        <label className="block text-sm font-medium text-gray-700">
          Formato de Exportación
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {formats.map((format) => (
            <button
              key={format.id}
              onClick={() => setSelectedFormat(format.id)}
              className={clsx(
                'p-3 border-2 rounded-lg text-left transition-colors',
                selectedFormat === format.id
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              )}
            >
              <div className="flex items-center">
                <div className={clsx(
                  'mr-3',
                  selectedFormat === format.id ? 'text-primary-600' : 'text-gray-400'
                )}>
                  {format.icon}
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">{format.name}</h4>
                  <p className="text-sm text-gray-600">{format.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Export Button and Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {getStatusIcon()}
          {getStatusMessage() && (
            <span className={clsx(
              'text-sm',
              exportStatus === 'success' ? 'text-green-600' : 'text-red-600'
            )}>
              {getStatusMessage()}
            </span>
          )}
        </div>
        
        <button
          onClick={handleExport}
          disabled={isExporting || data.length === 0}
          className={clsx(
            'flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors',
            data.length === 0
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2'
          )}
        >
          {isExporting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Exportando...</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>Exportar {formats.find(f => f.id === selectedFormat)?.name}</span>
            </>
          )}
        </button>
      </div>

      {data.length === 0 && (
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center">
            <AlertCircle className="w-4 h-4 text-yellow-500 mr-2" />
            <span className="text-sm text-yellow-700">
              No hay datos disponibles para exportar
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataExport;