import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Home, LogOut, Play, RotateCw, Save, Settings } from 'lucide-react';

import {
  apiService,
  type SimilarityConfigResponse,
  type SimilarityRunResponse,
} from '../services/api';
import { useAuthStore } from '../store/useStore';

type CacheStatusMap = Record<
  string,
  {
    has_cache: boolean;
    trained_at?: string;
    voices_count: number;
  }
>;

const classificationOptions = ['ALL', 'CONSENSUADO', 'CONSENSUADO_DEBIL', 'SOLO_1_VOTO', 'ZONA_GRIS', 'RECHAZADO'] as const;

function formatIsoDate(value?: string): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function toNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
}

export default function CleaningView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout, user } = useAuthStore();

  const [config, setConfig] = useState<SimilarityConfigResponse | null>(null);
  const [result, setResult] = useState<SimilarityRunResponse | null>(null);
  const [entities, setEntities] = useState<Array<{ key: string; known_entity: string; citation_field: string }>>([]);
  const [cacheStatusByEntity, setCacheStatusByEntity] = useState<CacheStatusMap>({});

  const [selectedEntity, setSelectedEntity] = useState('master_role');
  const [useCleanEntries, setUseCleanEntries] = useState(true);
  const [forceRefit, setForceRefit] = useState(false);

  const [classificationFilter, setClassificationFilter] = useState<(typeof classificationOptions)[number]>('ALL');
  const [entityFilter, setEntityFilter] = useState('ALL');
  const [searchFilter, setSearchFilter] = useState('');

  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  async function loadInitialData() {
    setLoadingConfig(true);
    setError('');
    try {
      const [cfg, status, entitiesPayload] = await Promise.all([
        apiService.getSimilarityConfig(),
        apiService.getSimilarityStatus(),
        apiService.getSimilarityEntities(),
      ]);

      setConfig(cfg);
      setEntities(entitiesPayload.entities);
      if (entitiesPayload.entities.length > 0) {
        setSelectedEntity(entitiesPayload.entities[0].key);
      }

      const nextCacheStatus: CacheStatusMap = {};
      for (const item of status.entities) {
        nextCacheStatus[item.entity] = {
          has_cache: item.has_cache,
          trained_at: item.trained_at,
          voices_count: item.voices_count,
        };
      }
      setCacheStatusByEntity(nextCacheStatus);
    } catch (err) {
      setError((err as Error).message || 'No se pudo cargar la configuración');
    } finally {
      setLoadingConfig(false);
    }
  }

  useEffect(() => {
    void loadInitialData();
  }, []);

  async function handleSaveConfig() {
    if (!config) {
      return;
    }
    setSavingConfig(true);
    setError('');
    try {
      const saved = await apiService.saveSimilarityConfig(config);
      setConfig(saved);
      await loadInitialData();
    } catch (err) {
      setError((err as Error).message || 'No se pudo guardar la configuración');
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleRun() {
    if (!config) {
      return;
    }
    setRunning(true);
    setError('');
    try {
      const runResponse = await apiService.runSimilarity({
        entity: selectedEntity,
        use_clean_entries: useCleanEntries,
        force_refit: forceRefit,
      });
      setResult(runResponse);
      await loadInitialData();
    } catch (err) {
      setError((err as Error).message || 'No se pudo ejecutar el análisis');
    } finally {
      setRunning(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  async function handleExport() {
    if (!selectedEntity) {
      return;
    }
    setExporting(true);
    setError('');
    try {
      const blob = await apiService.exportSimilarity({
        entity: selectedEntity,
        use_clean_entries: useCleanEntries,
        force_refit: false, // No hace falta refit para exportar lo que ya se calculó o el default
      }, 'csv');

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `similarity_${selectedEntity}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError((err as Error).message || 'No se pudo exportar el archivo');
    } finally {
      setExporting(false);
    }
  }

  const filteredRows = (result?.results || []).filter((row) => {
    if (classificationFilter !== 'ALL' && row.classification !== classificationFilter) {
      return false;
    }
    if (entityFilter !== 'ALL' && row.entity !== entityFilter) {
      return false;
    }
    if (!searchFilter.trim()) {
      return true;
    }
    const query = searchFilter.trim().toLowerCase();
    return (
      row.term.toLowerCase().includes(query)
      || row.best_voice.toLowerCase().includes(query)
      || row.entity.toLowerCase().includes(query)
    );
  });

  const resultEntities = Array.from(new Set((result?.results || []).map((row) => row.entity).filter((item) => item)));
  const enabledAlgorithms = config
    ? Object.entries(config.algorithms)
      .filter(([, value]) => value.enabled)
      .map(([key]) => key)
    : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/processes')}
              className="btn btn-secondary inline-flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('common.back')}
            </button>
            <h1 className="text-2xl font-semibold text-gray-900">{t('cleaning.title')}</h1>
          </div>
          <button
            onClick={handleLogout}
            className="btn btn-secondary inline-flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            {t('navigation.logout')}
          </button>
        </div>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 inline-flex items-center gap-2">
              <Settings className="h-5 w-5" /> Configuración de algoritmos
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(`/known-entities/${entities.find(e => e.key === selectedEntity)?.known_entity || ''}`)}
                className="btn btn-secondary inline-flex items-center gap-2"
                disabled={!entities.length}
              >
                Ver diccionario
              </button>
              <button
                onClick={() => void loadInitialData()}
                disabled={loadingConfig}
                className="btn btn-secondary inline-flex items-center gap-2"
              >
                <RotateCw className="h-4 w-4" /> Recargar
              </button>
              <button
                onClick={() => void handleSaveConfig()}
                disabled={!config || savingConfig}
                className="btn btn-primary inline-flex items-center gap-2"
              >
                <Save className="h-4 w-4" /> {savingConfig ? 'Guardando...' : 'Guardar configuración'}
              </button>
            </div>
          </div>

          {loadingConfig || !config ? (
            <p className="text-sm text-gray-500">Cargando configuración...</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm text-gray-700">Entidad</label>
                  <select
                    value={selectedEntity}
                    onChange={(event) => setSelectedEntity(event.target.value)}
                    className="input mt-1"
                  >
                    {entities.map((item) => (
                      <option key={item.key} value={item.key}>{item.key}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end gap-4 pb-2">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={useCleanEntries}
                      onChange={(event) => setUseCleanEntries(event.target.checked)}
                    />
                    Usar entradas limpias
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={forceRefit}
                      onChange={(event) => setForceRefit(event.target.checked)}
                    />
                    Forzar recálculo de caché
                  </label>
                </div>
                <div className="flex items-end justify-end">
                  <button
                    onClick={() => void handleRun()}
                    disabled={running}
                    className="btn btn-primary inline-flex items-center gap-2"
                  >
                    <Play className="h-4 w-4" /> {running ? 'Procesando...' : 'Ejecutar análisis'}
                  </button>
                </div>
              </div>

              <div className="rounded border border-gray-200 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left">Algoritmo</th>
                      <th className="px-3 py-2 text-left">Enabled</th>
                      <th className="px-3 py-2 text-left">Threshold</th>
                      <th className="px-3 py-2 text-left">Gray Zone Min</th>
                      <th className="px-3 py-2 text-left">Gray Zone Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(config.algorithms).map(([algorithm, algorithmConfig]) => (
                      <tr key={algorithm} className="border-t border-gray-200">
                        <td className="px-3 py-2 font-medium">{algorithm}</td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={algorithmConfig.enabled}
                            onChange={(event) => {
                              setConfig((prev) => {
                                if (!prev) {
                                  return prev;
                                }
                                return {
                                  ...prev,
                                  algorithms: {
                                    ...prev.algorithms,
                                    [algorithm]: {
                                      ...prev.algorithms[algorithm],
                                      enabled: event.target.checked,
                                    },
                                  },
                                };
                              });
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="input"
                            type="number"
                            min={0}
                            max={1}
                            step={0.01}
                            value={algorithmConfig.threshold}
                            onChange={(event) => {
                              const nextThreshold = toNumber(event.target.value, algorithmConfig.threshold);
                              setConfig((prev) => {
                                if (!prev) {
                                  return prev;
                                }
                                return {
                                  ...prev,
                                  algorithms: {
                                    ...prev.algorithms,
                                    [algorithm]: {
                                      ...prev.algorithms[algorithm],
                                      threshold: nextThreshold,
                                    },
                                  },
                                };
                              });
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="input"
                            type="number"
                            min={0}
                            max={1}
                            step={0.01}
                            value={algorithmConfig.gray_zone[0]}
                            onChange={(event) => {
                              const nextMin = toNumber(event.target.value, algorithmConfig.gray_zone[0]);
                              setConfig((prev) => {
                                if (!prev) {
                                  return prev;
                                }
                                return {
                                  ...prev,
                                  algorithms: {
                                    ...prev.algorithms,
                                    [algorithm]: {
                                      ...prev.algorithms[algorithm],
                                      gray_zone: [nextMin, prev.algorithms[algorithm].gray_zone[1]],
                                    },
                                  },
                                };
                              });
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="input"
                            type="number"
                            min={0}
                            max={1}
                            step={0.01}
                            value={algorithmConfig.gray_zone[1]}
                            onChange={(event) => {
                              const nextMax = toNumber(event.target.value, algorithmConfig.gray_zone[1]);
                              setConfig((prev) => {
                                if (!prev) {
                                  return prev;
                                }
                                return {
                                  ...prev,
                                  algorithms: {
                                    ...prev.algorithms,
                                    [algorithm]: {
                                      ...prev.algorithms[algorithm],
                                      gray_zone: [prev.algorithms[algorithm].gray_zone[0], nextMax],
                                    },
                                  },
                                };
                              });
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Estado de caché</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExport}
                disabled={exporting || !selectedEntity}
                className="btn btn-secondary inline-flex items-center gap-2"
              >
                <Download className="h-4 w-4" /> {exporting ? 'Exportando...' : 'Exportar CSV'}
              </button>
              <button
                onClick={() => navigate('/processes')}
                className="btn btn-secondary inline-flex items-center gap-2"
              >
                <Home className="h-4 w-4" /> Procesos
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.keys(cacheStatusByEntity).length === 0 && (
              <p className="text-sm text-gray-500">Todavía no hay caché entrenada.</p>
            )}
            {Object.entries(cacheStatusByEntity).map(([entity, status]) => (
              <div key={entity} className="rounded border border-gray-200 bg-white px-3 py-2">
                <p className="text-sm font-medium text-gray-900">{entity}</p>
                <p className="text-xs text-gray-600">Cache: {status.has_cache ? 'lista' : 'vacía'}</p>
                <p className="text-xs text-gray-600">Voces: {status.voices_count}</p>
                <p className="text-xs text-gray-600">Entrenado: {formatIsoDate(status.trained_at)}</p>
              </div>
            ))}
          </div>
        </section>

        {result && (
          <section className="card space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="rounded border border-gray-200 bg-white p-3">
                <p className="text-xs text-gray-500">Entidad</p>
                <p className="text-base font-semibold text-gray-900">{result.input.entity}</p>
              </div>
              <div className="rounded border border-gray-200 bg-white p-3">
                <p className="text-xs text-gray-500">Términos únicos</p>
                <p className="text-base font-semibold text-gray-900">{result.summary.terms_count}</p>
              </div>
              <div className="rounded border border-gray-200 bg-white p-3">
                <p className="text-xs text-gray-500">Ocurrencias</p>
                <p className="text-base font-semibold text-gray-900">{result.summary.total_occurrences}</p>
              </div>
              <div className="rounded border border-gray-200 bg-white p-3">
                <p className="text-xs text-gray-500">Consenso estricto</p>
                <p className="text-base font-semibold text-green-700">{result.summary.strict_match_percentage}%</p>
              </div>
              <div className="rounded border border-gray-200 bg-white p-3">
                <p className="text-xs text-gray-500">Consenso + débil</p>
                <p className="text-base font-semibold text-blue-700">{result.summary.fuzzy_match_percentage}%</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select
                value={classificationFilter}
                onChange={(event) => setClassificationFilter(event.target.value as (typeof classificationOptions)[number])}
                className="input"
              >
                {classificationOptions.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
              <select
                value={entityFilter}
                onChange={(event) => setEntityFilter(event.target.value)}
                className="input"
              >
                <option value="ALL">ALL ENTITIES</option>
                {resultEntities.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
              <input
                value={searchFilter}
                onChange={(event) => setSearchFilter(event.target.value)}
                placeholder="Buscar término / voz / entidad"
                className="input md:col-span-2"
              />
            </div>

            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left">Término</th>
                    <th className="px-3 py-2 text-right">Freq</th>
                    <th className="px-3 py-2 text-left">Entidad</th>
                    <th className="px-3 py-2 text-left">Voz sugerida</th>
                    <th className="px-3 py-2 text-left">Clasificación</th>
                    <th className="px-3 py-2 text-left">Consenso</th>
                    {enabledAlgorithms.map((algorithm) => (
                      <th key={algorithm} className="px-3 py-2 text-right">{algorithm}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={`${row.term}-${row.entity}-${row.best_voice}`} className="border-t border-gray-200">
                      <td className="px-3 py-2 font-medium">{row.term}</td>
                      <td className="px-3 py-2 text-right">{row.frequency}</td>
                      <td className="px-3 py-2">{row.entity || '-'}</td>
                      <td className="px-3 py-2">{row.best_voice || '-'}</td>
                      <td className="px-3 py-2">{row.classification}</td>
                      <td className="px-3 py-2">{row.no_match ? 'NO_MATCH' : row.consensus ? 'YES' : 'NO'}</td>
                      {enabledAlgorithms.map((algorithm) => (
                        <td key={algorithm} className="px-3 py-2 text-right font-mono">
                          {row.algorithm_scores[algorithm]?.score?.toFixed(4) ?? '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <footer className="text-xs text-gray-500">
          Usuario activo: <span className="font-medium text-gray-700">{user?.username || user?.full_name || '-'}</span>
        </footer>
      </div>
    </div>
  );
}
