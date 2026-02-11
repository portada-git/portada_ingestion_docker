/**
 * Daily Entries Analysis View
 * Hierarchical view with expandable years -> months -> days
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, ChevronRight, ChevronDown, Download } from 'lucide-react';
import { apiService } from '../services/api';
import { withErrorHandling } from '../utils/apiErrorHandler';
import { DailyEntriesRequest } from '../types';
import AnalysisCard from '../components/AnalysisCard';
import QueryForm from '../components/QueryForm';
import PublicationSelector from '../components/PublicationSelector';
import { InputField } from '../components/FormField';
import { ResultsCard, InfoMessage, EmptyState } from '../components/ResultsCard';

interface HierarchicalData {
  total: number;
  years: Array<{
    year: number;
    count: number;
    months: Array<{
      month: number;
      count: number;
      days: Array<{
        day: number;
        count: number;
        editions: Array<{
          edition: string;
          count: number;
        }>;
      }>;
    }>;
  }>;
}

const DailyEntriesView: React.FC = () => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<HierarchicalData | null>(null);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    publication: '',
    startDate: '',
    endDate: ''
  });

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, startDate: e.target.value }));
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, endDate: e.target.value }));
  };

  const handlePublicationChange = (value: string) => {
    setFormData(prev => ({ ...prev, publication: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.publication) return;

    setIsLoading(true);
    
    const request: DailyEntriesRequest = {
      publication: formData.publication,
      start_date: formData.startDate || undefined,
      end_date: formData.endDate || undefined
    };

    const result = await withErrorHandling(async () => {
      return await apiService.getDailyEntries(request);
    });

    if (result) {
      setResults(result);
      // Auto-expand first year if only one year
      if (result.years && result.years.length === 1) {
        setExpandedYears(new Set([result.years[0].year]));
      }
    }
    
    setIsLoading(false);
  };

  const toggleYear = (year: number) => {
    const newExpanded = new Set(expandedYears);
    if (newExpanded.has(year)) {
      newExpanded.delete(year);
      // Also collapse all months of this year
      const newExpandedMonths = new Set(expandedMonths);
      Array.from(expandedMonths).forEach(key => {
        if (key.startsWith(`${year}-`)) {
          newExpandedMonths.delete(key);
        }
      });
      setExpandedMonths(newExpandedMonths);
    } else {
      newExpanded.add(year);
    }
    setExpandedYears(newExpanded);
  };

  const toggleMonth = (year: number, month: number) => {
    const key = `${year}-${month}`;
    const newExpanded = new Set(expandedMonths);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedMonths(newExpanded);
  };

  const getMonthName = (month: number) => {
    const date = new Date(2000, month - 1, 1);
    return date.toLocaleDateString('es-ES', { month: 'long' });
  };

  const downloadCSV = () => {
    if (!results || !results.years || results.years.length === 0) return;

    // Generar nombre del archivo
    const publication = formData.publication.toUpperCase();
    const startDate = formData.startDate || "inicio";
    const endDate = formData.endDate || "fin";
    const total = results.total;
    const fileName = `entradas_diarias_${publication}_${startDate}_${endDate}_total_${total}.csv`;

    // Crear contenido CSV con estructura jerárquica
    const headers = ["Año", "Mes", "Día", "Fecha Completa", "Cantidad"];
    const rows: string[] = [headers.join(",")];

    results.years.forEach((year) => {
      year.months.forEach((month) => {
        month.days.forEach((day) => {
          const fullDate = `${year.year}-${String(month.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
          rows.push([
            year.year,
            getMonthName(month.month),
            day.day,
            fullDate,
            day.count
          ].join(","));
        });
      });
    });

    const csvContent = rows.join("\n");

    // Crear blob y descargar
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <AnalysisCard
        title={t('analysis.dailyEntries.title')}
        subtitle={t('analysis.dailyEntries.subtitle')}
        icon={BarChart3}
      >
        <QueryForm
          onSubmit={handleSubmit}
          submitText={t('analysis.dailyEntries.queryEntries')}
          isLoading={isLoading}
          submitColor="blue"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('analysis.dailyEntries.publication')}
              </label>
              <PublicationSelector
                value={formData.publication}
                onChange={handlePublicationChange}
                placeholder={t('analysis.dailyEntries.selectPublication')}
                includeAll={false}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField
                label={t('analysis.dailyEntries.startDate')}
                type="date"
                value={formData.startDate}
                onChange={handleStartDateChange}
              />

              <InputField
                label={t('analysis.dailyEntries.endDate')}
                type="date"
                value={formData.endDate}
                onChange={handleEndDateChange}
              />
            </div>
            
            <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
              <p>{t('analysis.dailyEntries.dateRangeHelp')}</p>
            </div>
          </div>
        </QueryForm>
      </AnalysisCard>

      {/* Results */}
      {results && results.years && results.years.length > 0 && (
        <ResultsCard title={t('analysis.dailyEntries.results')}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <InfoMessage
                message={t('analysis.dailyEntries.totalEntries', { count: results.total })}
                type="success"
              />
              <button
                onClick={downloadCSV}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>Descargar CSV</span>
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                      Período
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                      {t('analysis.dailyEntries.count')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {results.years.map((year) => (
                    <React.Fragment key={year.year}>
                      {/* Year Row */}
                      <tr 
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => toggleYear(year.year)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {expandedYears.has(year.year) ? (
                              <ChevronDown className="w-4 h-4 mr-2 text-slate-500" />
                            ) : (
                              <ChevronRight className="w-4 h-4 mr-2 text-slate-500" />
                            )}
                            <span className="font-semibold text-slate-900">{year.year}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="font-semibold text-slate-900">{year.count.toLocaleString()}</span>
                        </td>
                      </tr>

                      {/* Months (if year is expanded) */}
                      {expandedYears.has(year.year) && year.months.map((month) => (
                        <React.Fragment key={`${year.year}-${month.month}`}>
                          <tr 
                            className="bg-slate-50 hover:bg-slate-100 cursor-pointer"
                            onClick={() => toggleMonth(year.year, month.month)}
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center pl-8">
                                {expandedMonths.has(`${year.year}-${month.month}`) ? (
                                  <ChevronDown className="w-4 h-4 mr-2 text-slate-500" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 mr-2 text-slate-500" />
                                )}
                                <span className="font-medium text-slate-800 capitalize">
                                  {getMonthName(month.month)} {year.year}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="font-medium text-slate-800">{month.count.toLocaleString()}</span>
                            </td>
                          </tr>

                          {/* Days (if month is expanded) */}
                          {expandedMonths.has(`${year.year}-${month.month}`) && month.days.map((day) => (
                            <tr key={`${year.year}-${month.month}-${day.day}`} className="bg-white hover:bg-slate-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="pl-16 text-slate-700">
                                  {day.day} de {getMonthName(month.month)} de {year.year}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="text-slate-700">{day.count.toLocaleString()}</span>
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </ResultsCard>
      )}

      {results && (!results.years || results.years.length === 0) && !isLoading && (
        <ResultsCard>
          <EmptyState message={t('analysis.dailyEntries.noResults')} />
        </ResultsCard>
      )}
    </div>
  );
};

export default DailyEntriesView;