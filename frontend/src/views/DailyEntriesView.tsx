/**
 * Daily Entries Analysis View
 * Modern implementation with dark theme and internationalization
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3 } from 'lucide-react';
import { apiService } from '../services/api';
import { withErrorHandling } from '../utils/apiErrorHandler';
import { DailyEntriesRequest } from '../types';
import AnalysisCard from '../components/AnalysisCard';
import QueryForm from '../components/QueryForm';
import PublicationSelector from '../components/PublicationSelector';
import { InputField } from '../components/FormField';
import { ResultsCard, InfoMessage, EmptyState } from '../components/ResultsCard';
import DataVisualization from '../components/DataVisualization';

interface DailyEntry {
  date: string;
  count: number;
  publication: string;
}

const DailyEntriesView: React.FC = () => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<DailyEntry[]>([]);
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
      const transformedResults: DailyEntry[] = result.daily_counts?.map((entry: any) => ({
        date: entry.date,
        count: entry.count,
        publication: entry.publication
      })) || [];
      
      setResults(transformedResults);
    }
    
    setIsLoading(false);
  };

  const totalEntries = results.reduce((sum, entry) => sum + entry.count, 0);

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
      {results.length > 0 && (
        <div className="space-y-6">
          <ResultsCard title={t('analysis.dailyEntries.results')}>
            <div className="space-y-4">
              <InfoMessage
                message={t('analysis.dailyEntries.totalEntries', { count: totalEntries })}
                type="success"
              />
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">
                        {t('analysis.dailyEntries.date')}
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">
                        {t('analysis.dailyEntries.count')}
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">
                        Publicación
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((entry, index) => (
                      <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4 text-slate-700">
                          {new Date(entry.date).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-mono font-semibold">
                          {entry.count.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          {entry.publication}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </ResultsCard>

          {/* Chart Visualization */}
          <DataVisualization
            data={results.map(entry => ({
              label: new Date(entry.date).toLocaleDateString('es-ES', { 
                month: 'short', 
                day: 'numeric' 
              }),
              value: entry.count
            }))}
            type="line"
            title={t('analysis.dailyEntries.chart')}
            height={300}
            showLegend={false}
          />
        </div>
      )}

      {results.length === 0 && formData.publication && !isLoading && (
        <ResultsCard>
          <EmptyState message={t('analysis.dailyEntries.noResults')} />
        </ResultsCard>
      )}
    </div>
  );
};

export default DailyEntriesView;