import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  Settings, 
  Play, 
  Download, 
  ChevronRight,
  Info,
  X,
  ArrowLeft,
  Home,
  LogOut
} from 'lucide-react';
import { useAuthStore } from '../store/useStore';

interface CleaningConfig {
  field: string;
  algorithms: string[];
  thresholds: {
    [key: string]: number;
  };
  grayZones: {
    [key: string]: { min: number; max: number };
  };
  filters: string[];
}

interface CleaningResults {
  totalOccurrences: number;
  matchedPercentage: number;
  fuzzyMatchPercentage: number;
  uniqueTerms: number;
  distribution: Array<{
    classification: string;
    occurrences: number;
    percentage: number;
  }>;
  preview: Array<Record<string, string | number>>;
}

const CleaningView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout, user } = useAuthStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfig, setShowConfig] = useState(true);
  const [results, setResults] = useState<CleaningResults | null>(null);
  const [processingSteps, setProcessingSteps] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);

  const [config, setConfig] = useState<CleaningConfig>({
    field: 'master_role',
    algorithms: ['Levenshtein_OCR', 'Jaro_Winkler'],
    thresholds: {
      Levenshtein_OCR: 0.75,
      Jaro_Winkler: 0.85,
      Nilsim_2: 0.85,
    },
    grayZones: {
      Levenshtein_OCR: { min: 0.71, max: 0.75 },
      Jaro_Winkler: { min: 0.85, max: 0.85 },
      Nilsim_2: { min: 0.83, max: 0.85 },
    },
    filters: [],
  });

  const availableFields = [
    { value: 'master_role', label: 'Rol del capitán' },
    { value: 'port', label: 'Puerto' },
    { value: 'commodity', label: 'Mercancía' },
    { value: 'ship_type', label: 'Tipo de barco' },
  ];

  const availableAlgorithms = [
    { value: 'Levenshtein_OCR', label: 'Levenshtein_OCR', color: 'blue' },
    { value: 'Jaro_Winkler', label: 'Jaro_Winkler', color: 'green' },
    { value: 'Nilsim_2', label: 'Nilsim_2', color: 'purple' },
  ];

  const handleProcessing = async () => {
    setIsProcessing(true);
    setIsComplete(false);
    setProcessingSteps([]);

    // Simular procesamiento
    const steps = [
      'Procesando Levenshtein_OCR...',
      'Procesando Jaro_Winkler...',
      'Procesando Nilsim_2...',
    ];

    for (let i = 0; i < steps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      setProcessingSteps(prev => [...prev, steps[i]]);
    }

    // Simular resultados
    setResults({
      totalOccurrences: 52017,
      matchedPercentage: 98.0,
      fuzzyMatchPercentage: 98.0,
      uniqueTerms: 186,
      distribution: [
        { classification: 'CONSENSUADO', occurrences: 71, percentage: 38.17 },
        { classification: 'LITERAL NORMALIZADO - DE WIKI', occurrences: 11, percentage: 5.91 },
        { classification: 'SOLO_1_VOTO', occurrences: 17, percentage: 9.14 },
        { classification: 'ZONA_GRIS', occurrences: 11, percentage: 5.91 },
        { classification: 'RECHAZADO', occurrences: 76, percentage: 40.86 },
      ],
      preview: [
        { termino: 'nap', Levenshtein_OCR: 0.7988, Jaro_Winkler: 0, clasificacion: 'nap' },
        { termino: 'capitan', Levenshtein_OCR: 0.8124, Jaro_Winkler: 0, clasificacion: 'capitan' },
        { termino: 'patron', Levenshtein_OCR: 0.7988, Jaro_Winkler: 0, clasificacion: 'patron' },
      ],
    });

    setIsComplete(true);
    setIsProcessing(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const updateThreshold = (algo: string, value: number) => {
    setConfig(prev => ({
      ...prev,
      thresholds: { ...prev.thresholds, [algo]: value },
      // Recalibrar zonas grises automáticamente: -0.05 y +0.05
      grayZones: {
        ...prev.grayZones,
        [algo]: {
          min: Math.max(0, value - 0.05), // No permitir valores negativos
          max: Math.min(1, value + 0.05), // No permitir valores mayores a 1
        },
      },
    }));
  };

  const toggleAlgorithm = (algo: string) => {
    setConfig(prev => ({
      ...prev,
      algorithms: prev.algorithms.includes(algo)
        ? prev.algorithms.filter(a => a !== algo)
        : [...prev.algorithms, algo],
    }));
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className={`${showConfig ? 'w-80' : 'w-0'} transition-all duration-300 bg-white border-r border-gray-200 overflow-hidden flex flex-col`}>
        {showConfig && (
          <>
            {/* Contenido scrolleable */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-6 space-y-6">
                {/* Logo PortAda */}
                <div className="flex items-center justify-center pb-4 border-b border-gray-200">
                  <img 
                    src="/logo.jpeg" 
                    alt="PortAda Logo" 
                    className="h-16 w-auto object-contain"
                  />
                </div>

                {/* Header con botón de volver */}
                <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                  <button
                    onClick={() => navigate('/processes')}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5" />
                    <span className="text-sm font-medium">{t('common.back')}</span>
                  </button>
                  <button
                    onClick={() => setShowConfig(false)}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {t('cleaning.configuration')}
                  </h2>
                </div>

            {/* 1. Campo a analizar */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                1. {t('cleaning.fieldToAnalyze')}
              </h3>
              <p className="text-xs text-gray-500 mb-2">{t('cleaning.selectField')}</p>
              <select
                value={config.field}
                onChange={(e) => setConfig({ ...config, field: e.target.value })}
                className="input text-sm"
              >
                {availableFields.map(field => (
                  <option key={field.value} value={field.value}>
                    {field.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Algoritmos */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                2. {t('cleaning.algorithms')}
              </h3>
              <p className="text-xs text-gray-500 mb-2">{t('cleaning.selectAlgorithms')}</p>
              <div className="space-y-2">
                {availableAlgorithms.map(algo => (
                  <button
                    key={algo.value}
                    onClick={() => toggleAlgorithm(algo.value)}
                    className={`w-full px-3 py-2 text-sm rounded-md transition-colors ${
                      config.algorithms.includes(algo.value)
                        ? `bg-${algo.color}-100 text-${algo.color}-700 border border-${algo.color}-300`
                        : 'bg-gray-100 text-gray-600 border border-gray-200'
                    }`}
                  >
                    {algo.label}
                    {config.algorithms.includes(algo.value) && ' ✓'}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Umbrales de aprobación */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                3. {t('cleaning.approvalThresholds')}
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                {t('cleaning.thresholdsAutoAdjust')}
              </p>
              {config.algorithms.map(algo => (
                <div key={algo} className="mb-3">
                  <label className="text-xs text-gray-600">{algo}</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={config.thresholds[algo]}
                      onChange={(e) => updateThreshold(algo, parseFloat(e.target.value))}
                      className="flex-1"
                    />
                    <span className="text-xs font-mono w-12 text-right">
                      {config.thresholds[algo].toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* 4. Zonas grises */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                4. {t('cleaning.grayZones')}
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                {t('cleaning.grayZonesAutoCalibrated')}
              </p>
              {config.algorithms.map(algo => (
                <div key={algo} className="mb-3">
                  <label className="text-xs text-gray-600">{algo}</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={config.grayZones[algo].min.toFixed(2)}
                      readOnly
                      className="input text-xs w-20 bg-gray-50 cursor-not-allowed"
                      title={t('cleaning.autoCalculated')}
                    />
                    <span className="text-xs">-</span>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={config.grayZones[algo].max.toFixed(2)}
                      readOnly
                      className="input text-xs w-20 bg-gray-50 cursor-not-allowed"
                      title={t('cleaning.autoCalculated')}
                    />
                    <span className="text-xs text-gray-500">
                      (±0.05)
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* 5. Filtros */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                5. {t('cleaning.filters')}
              </h3>
              <p className="text-xs text-gray-500 mb-2">
                {t('cleaning.noFiltersApplied')}
              </p>
              <input
                type="text"
                placeholder={t('cleaning.addFilter')}
                className="input text-sm"
              />
            </div>

            {/* Botón ejecutar */}
            <button
              onClick={handleProcessing}
              disabled={isProcessing || config.algorithms.length === 0}
              className="w-full btn btn-primary flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              {isProcessing ? t('cleaning.processing') : t('cleaning.executeAnalysis')}
            </button>
          </div>
        </div>

        {/* Footer con botón de cerrar sesión */}
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="mb-3 px-2">
            <p className="text-xs text-gray-600 mb-1">{t('navigation.userAvatar', { name: '' })}</p>
            <p className="text-sm font-medium text-gray-900">{user?.username || user?.full_name}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full btn btn-secondary flex items-center justify-center gap-2 text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200"
          >
            <LogOut className="w-4 h-4" />
            {t('navigation.logout')}
          </button>
        </div>
      </>
    )}
  </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          {/* Header con navegación */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-4">
                {!showConfig && (
                  <button
                    onClick={() => navigate('/processes')}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title={t('common.back')}
                  >
                    <Home className="w-5 h-5 text-gray-600" />
                  </button>
                )}
                <h1 className="text-3xl font-bold text-gray-900">
                  {t('cleaning.title')}
                </h1>
              </div>
              {!showConfig && (
                <button
                  onClick={() => setShowConfig(true)}
                  className="btn btn-secondary flex items-center gap-2"
                >
                  <Settings className="w-4 h-4" />
                  {t('cleaning.showConfiguration')}
                </button>
              )}
            </div>
            <p className="text-gray-600">
              {t('cleaning.subtitle')}
            </p>
          </div>

          {/* Current Configuration */}
          <div className="card mb-6">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="w-full flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <ChevronRight className={`w-5 h-5 transition-transform ${showConfig ? 'rotate-90' : ''}`} />
                <span className="font-medium">{t('cleaning.currentConfiguration')}</span>
              </div>
            </button>
            
            <div className="mt-4 space-y-2">
              <div className="bg-green-50 border border-green-200 rounded-md p-3">
                <p className="text-sm text-green-800">
                  {t('cleaning.loadedTerms', { count: 186 })}
                </p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-md p-3">
                <p className="text-sm text-green-800">
                  {t('cleaning.normalizedVoices', { count: 17 })}
                </p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <p className="text-sm text-blue-800">
                  {t('cleaning.usingAllVoices')}
                </p>
              </div>
            </div>
          </div>

          {/* Processing Status */}
          {isProcessing && (
            <div className="card mb-6">
              <h3 className="font-medium mb-4">{t('cleaning.generatingMatrices')}</h3>
              <div className="space-y-3">
                {processingSteps.map((step, index) => (
                  <div key={index}>
                    <p className="text-sm text-gray-600 mb-1">{step}</p>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '100%' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {isComplete && results && (
            <>
              <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-6 flex items-start gap-3">
                <Info className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-800">
                  {t('cleaning.matricesGenerated')}
                </p>
                <button className="ml-auto text-green-600 hover:text-green-800">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Results Summary */}
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-4">{t('cleaning.results')}</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="card">
                    <p className="text-sm text-gray-600 mb-1">{t('cleaning.totalOccurrences')}</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {results.totalOccurrences.toLocaleString()}
                    </p>
                  </div>
                  <div className="card">
                    <p className="text-sm text-gray-600 mb-1">{t('cleaning.matchedPercentage')}</p>
                    <p className="text-3xl font-bold text-green-600">
                      {results.matchedPercentage}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      + {results.matchedPercentage}% {t('cleaning.normalized')}
                    </p>
                  </div>
                  <div className="card">
                    <p className="text-sm text-gray-600 mb-1">{t('cleaning.fuzzyMatch')}</p>
                    <p className="text-3xl font-bold text-blue-600">
                      {results.fuzzyMatchPercentage}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      + {results.fuzzyMatchPercentage}% {t('cleaning.normalized')}
                    </p>
                  </div>
                  <div className="card">
                    <p className="text-sm text-gray-600 mb-1">{t('cleaning.uniqueTerms')}</p>
                    <p className="text-3xl font-bold text-purple-600">
                      {results.uniqueTerms}
                    </p>
                  </div>
                </div>
              </div>

              {/* Distribution */}
              <div className="card mb-6">
                <h3 className="text-lg font-semibold mb-4">{t('cleaning.distributionByClassification')}</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-4 text-sm font-medium text-gray-600">#</th>
                        <th className="text-left py-2 px-4 text-sm font-medium text-gray-600">
                          {t('cleaning.classification')}
                        </th>
                        <th className="text-right py-2 px-4 text-sm font-medium text-gray-600">
                          {t('cleaning.occurrences')}
                        </th>
                        <th className="text-right py-2 px-4 text-sm font-medium text-gray-600">
                          {t('cleaning.percentage')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.distribution.map((item, index) => (
                        <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-4 text-sm text-gray-600">{index}</td>
                          <td className="py-2 px-4 text-sm font-medium">{item.classification}</td>
                          <td className="py-2 px-4 text-sm text-right">{item.occurrences}</td>
                          <td className="py-2 px-4 text-sm text-right">{item.percentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Data Preview */}
              <div className="card mb-6">
                <h3 className="text-lg font-semibold mb-4">{t('cleaning.dataPreview')}</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="text-left py-2 px-3 font-medium text-gray-600">#</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-600">
                          {t('cleaning.term')}
                        </th>
                        <th className="text-right py-2 px-3 font-medium text-gray-600">Levenshtein_OCR</th>
                        <th className="text-right py-2 px-3 font-medium text-gray-600">Jaro_Winkler</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-600">
                          {t('cleaning.classification')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.preview.map((row, index) => (
                        <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-3 text-gray-600">{index}</td>
                          <td className="py-2 px-3">{row.termino}</td>
                          <td className="py-2 px-3 text-right font-mono">{row.Levenshtein_OCR}</td>
                          <td className="py-2 px-3 text-right font-mono">{row.Jaro_Winkler}</td>
                          <td className="py-2 px-3">{row.clasificacion}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Download Results */}
              <div className="card">
                <h3 className="text-lg font-semibold mb-4">{t('cleaning.downloadResults')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button className="btn btn-secondary flex items-center justify-center gap-2">
                    <Download className="w-4 h-4" />
                    {t('cleaning.downloadCompleteCSV')}
                  </button>
                  <button className="btn btn-secondary flex items-center justify-center gap-2">
                    <Download className="w-4 h-4" />
                    {t('cleaning.downloadAllCSVZIP')}
                  </button>
                  <button className="btn btn-secondary flex items-center justify-center gap-2">
                    <Download className="w-4 h-4" />
                    {t('cleaning.downloadTXTReport')}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Empty State */}
          {!isProcessing && !isComplete && (
            <div className="card text-center py-12">
              <Settings className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {t('cleaning.emptyStateTitle')}
              </h3>
              <p className="text-gray-600 mb-4">
                {t('cleaning.emptyStateDescription')}
              </p>
              <button
                onClick={() => setShowConfig(true)}
                className="btn btn-primary inline-flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                {t('cleaning.openConfiguration')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CleaningView;
