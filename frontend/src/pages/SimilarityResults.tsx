import React, { useState, useEffect } from 'react';

interface AlgorithmScore {
  algorithm: string;
  best_voice?: string;
  best_entity?: string;
  score?: number;
  threshold?: number;
  voted?: boolean;
  in_gray_zone?: boolean;
}

interface SimilarityResult {
  term: string;
  frequency: number;
  classification?: string;
  canonical_entity?: string;
  entity?: string;
  voice?: string;
  similarity_score?: number;
  votes?: number;
  exact_match?: boolean;
  algorithms_votes?: Record<string, unknown>;
  algorithm_scores?: AlgorithmScore[];
}

interface EntityData {
  name: string;
  status: string;
  known_voices: number;
  unique_terms: number;
  total_citations: number;
  coverage?: number;
  available_algorithms?: string[];
  allowed_algorithms?: string[];
  results: SimilarityResult[];
}

interface ResultsData {
  timestamp: string;
  source?: string;
  total_entries: number;
  disabled_algorithms?: string[];
  entities: {
    [key: string]: EntityData;
  };
}

interface ApiEntitySummary {
  name: string;
  display_name?: string;
  has_results?: boolean;
}

interface ApiRunSummary {
  created_at?: string;
  total_entries?: number;
  disabled_algorithms?: string[];
}

interface ApiDeltaResultRow {
  entity_type?: string;
  term: string;
  frequency?: number;
  exact_match?: boolean;
  best_entity?: string;
  best_voice?: string;
  best_score?: number;
  votes_approval?: number;
  algorithm_scores_json?: string;
  algorithm_scores?: AlgorithmScore[];
}

interface ApiDeltaResultsResponse {
  source?: string;
  run_id?: string;
  entity?: string | null;
  limit?: number;
  page?: number;
  page_size?: number;
  total_count?: number;
  total_pages?: number;
  has_next?: boolean;
  next_cursor?: string | null;
  results: ApiDeltaResultRow[];
}

interface ResultsLoadError {
  title: string;
  message: string;
  action?: string;
  command?: string;
}

interface ComputedSimilarityResult extends SimilarityResult {
  computed_classification: string;
  computed_entity: string;
  computed_voice: string;
  computed_votes: number;
  total_votes: number;
  votes_needed: number;
  computed_score?: number;
  selected_scores: AlgorithmScore[];
  voted_scores: AlgorithmScore[];
}

const TECHNICAL_ID_PATTERN = /^DM_\d+$/i;
const PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 500];

const isTechnicalIdentifierTerm = (term: string): boolean => {
  return TECHNICAL_ID_PATTERN.test(term.trim());
};

const SimilarityResults: React.FC = () => {
  const [data, setData] = useState<ResultsData | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string>('');
  const [selectedAlgorithms, setSelectedAlgorithms] = useState<string[]>([]);
  const [selectedClassification, setSelectedClassification] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalResults, setTotalResults] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<ResultsLoadError | null>(null);

  const API_BASE = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001/api/v1'}/similarity`;

  const getAvailableAlgorithms = (): string[] => {
    if (!data || !selectedEntity) {
      return [];
    }

    const entityData = data.entities[selectedEntity];
    return entityData?.available_algorithms || entityData?.allowed_algorithms || [];
  };

  const getDefaultAlgorithmsForEntity = (entityName: string, resultsData = data): string[] => {
    if (!resultsData || !entityName) {
      return [];
    }

    const entityData = resultsData.entities[entityName];
    return entityData?.allowed_algorithms || entityData?.available_algorithms || [];
  };

  useEffect(() => {
    loadResults();
  }, []);

  const parseAlgorithmScores = (row: ApiDeltaResultRow): AlgorithmScore[] => {
    if (Array.isArray(row.algorithm_scores)) {
      return row.algorithm_scores;
    }

    if (!row.algorithm_scores_json) {
      return [];
    }

    try {
      const parsed = JSON.parse(row.algorithm_scores_json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const toSimilarityResult = (row: ApiDeltaResultRow): SimilarityResult => ({
    term: row.term,
    frequency: row.frequency || 0,
    entity: row.best_entity,
    canonical_entity: row.best_entity,
    voice: row.best_voice,
    similarity_score: row.best_score,
    votes: row.votes_approval,
    exact_match: row.exact_match,
    algorithm_scores: parseAlgorithmScores(row),
  });

  const buildResultsData = (
    payload: ApiDeltaResultsResponse,
    entities: ApiEntitySummary[],
    latestRun?: ApiRunSummary,
  ): ResultsData => {
    const rows = payload.results || [];
    const entityNames = entities.length > 0
      ? entities.map((entity) => entity.name)
      : Array.from(new Set(rows.map((row) => row.entity_type).filter(Boolean))) as string[];

    const entitiesData = entityNames.reduce<ResultsData['entities']>((acc, entityName) => {
      const entityRows = rows.filter((row) => (row.entity_type || payload.entity || entityName) === entityName);
      const results = entityRows.map(toSimilarityResult);
      const algorithms = Array.from(new Set(
        results.flatMap((result) => result.algorithm_scores || []).map((score) => score.algorithm)
      ));
      const knownVoices = new Set(results.map((result) => result.voice).filter(Boolean)).size;
      const totalCitations = results.reduce((sum, result) => sum + (result.frequency || 0), 0);

      acc[entityName] = {
        name: entityName,
        status: 'success',
        known_voices: knownVoices,
        unique_terms: results.length,
        total_citations: totalCitations,
        coverage: undefined,
        available_algorithms: algorithms,
        allowed_algorithms: algorithms,
        results,
      };
      return acc;
    }, {});

    return {
      timestamp: latestRun?.created_at || new Date().toISOString(),
      source: payload.source,
      total_entries: latestRun?.total_entries || rows.length,
      disabled_algorithms: latestRun?.disabled_algorithms,
      entities: entitiesData,
    };
  };

  const loadResults = async (entityName?: string, page = 1, requestedPageSize = pageSize) => {
    const initialLoad = !data;
    try {
      if (initialLoad) {
        setLoading(true);
      } else {
        setTableLoading(true);
      }
      const [entitiesResponse, runResponse] = await Promise.all([
        fetch(`${API_BASE}/entities`),
        fetch(`${API_BASE}/runs/latest`),
      ]);

      if (!entitiesResponse.ok) {
        throw {
          title: 'No se pudieron cargar las entidades',
          message: `El backend respondió con HTTP ${entitiesResponse.status}.`,
          action: 'Revisa los logs del servicio api para ver la causa exacta.',
        } satisfies ResultsLoadError;
      }

      const entities = await entitiesResponse.json() as ApiEntitySummary[];
      const latestRun = runResponse.ok ? await runResponse.json() as ApiRunSummary : undefined;
      const targetEntity = entityName || selectedEntity || entities.find((entity) => entity.has_results)?.name || entities[0]?.name;
      const targetPage = Math.max(1, page);
      const params = new URLSearchParams({
        limit: String(requestedPageSize),
        page: String(targetPage),
      });

      const response = await fetch(
        targetEntity
          ? `${API_BASE}/results/${encodeURIComponent(targetEntity)}?${params.toString()}`
          : `${API_BASE}/results?${params.toString()}`
      );

      if (!response.ok) {
        let detail: unknown;
        try {
          detail = await response.json();
        } catch {
          detail = null;
        }

        const apiDetail = typeof detail === 'object' && detail !== null && 'detail' in detail
          ? (detail as { detail?: unknown }).detail
          : null;
        const structuredDetail = typeof apiDetail === 'object' && apiDetail !== null
          ? apiDetail as { message?: string; action?: string }
          : null;

        if (response.status === 404) {
          throw {
            title: 'No hay resultados disponibles',
            message: typeof apiDetail === 'string' ? apiDetail : 'El proceso de análisis de similitud no se ha ejecutado todavía.',
            action: 'Para generar los resultados, ejecuta el siguiente comando en el servidor:',
            command: 'docker compose exec api python /app/scripts/generate_similarity_delta_results.py --entities ship_type',
          } satisfies ResultsLoadError;
        }

        if (response.status === 422) {
          throw {
            title: 'Los resultados no son válidos',
            message: structuredDetail?.message || 'El backend encontró resultados corruptos.',
            action: structuredDetail?.action || 'Regenera el análisis de similitud para reemplazar los datos inválidos.',
            command: 'docker compose exec api python /app/scripts/generate_similarity_delta_results.py --entities ship_type',
          } satisfies ResultsLoadError;
        }

        throw {
          title: 'No se pudieron cargar los resultados',
          message: `El backend respondió con HTTP ${response.status}.`,
          action: 'Revisa los logs del servicio api para ver la causa exacta.',
        } satisfies ResultsLoadError;
      }

      const payload = await response.json() as ApiDeltaResultsResponse | ResultsData;
      const results = 'entities' in payload
        ? payload
        : buildResultsData(payload, entities, latestRun);

      setData(results);
      if ('total_pages' in payload) {
        setTotalPages(payload.total_pages || 0);
        setTotalResults(payload.total_count || 0);
        setCurrentPage(payload.page || targetPage);
        setPageSize(payload.page_size || payload.limit || pageSize);
      }

      const entityKeys = Object.keys(results.entities);
      const nextSelectedEntity = targetEntity && results.entities[targetEntity] ? targetEntity : entityKeys[0];
      if (nextSelectedEntity) {
        setSelectedEntity(nextSelectedEntity);
        setSelectedAlgorithms(getDefaultAlgorithmsForEntity(nextSelectedEntity, results));
      }

      setError(null);
    } catch (err) {
      if (err instanceof TypeError) {
        setError({
          title: 'No se puede conectar con la API',
          message: `No se pudo llamar a ${API_BASE}/results.`,
          action: 'Comprueba que el contenedor api esté levantado, el puerto sea correcto y no haya bloqueo CORS.',
        });
      } else if (typeof err === 'object' && err !== null && 'title' in err && 'message' in err) {
        setError(err as ResultsLoadError);
      } else {
        setError({
          title: 'Error desconocido',
          message: err instanceof Error ? err.message : 'No se pudo cargar el resultado.',
        });
      }
    } finally {
      setLoading(false);
      setTableLoading(false);
    }
  };

  const handleAlgorithmToggle = (algorithm: string) => {
    setSelectedAlgorithms(prev =>
      prev.includes(algorithm)
        ? prev.filter(a => a !== algorithm)
        : [...prev, algorithm]
    );
  };

  const getSelectedScores = (result: SimilarityResult): AlgorithmScore[] => {
    if (!Array.isArray(result.algorithm_scores)) {
      return [];
    }

    return result.algorithm_scores.filter((score) => selectedAlgorithms.includes(score.algorithm));
  };

  const requiredConsensusVotes = (scoresCount: number): number => {
    return Math.floor(scoresCount / 2) + 1;
  };

  const formatScore = (score?: number): string => {
    return typeof score === 'number' ? score.toFixed(3) : '-';
  };

  const getBestScoredVoice = (scores: AlgorithmScore[]): AlgorithmScore | undefined => {
    return scores
      .filter((score): score is AlgorithmScore & { score: number } => typeof score.score === 'number')
      .sort((a, b) => b.score - a.score)[0];
  };

  const computeResult = (result: SimilarityResult): ComputedSimilarityResult => {
    const selectedScores = getSelectedScores(result);
    const votedScores = selectedScores.filter((score) => score.voted);
    const grayZoneScores = selectedScores.filter((score) => score.in_gray_zone);

    const votesNeeded = requiredConsensusVotes(selectedScores.length);

    if (result.exact_match) {
      const bestScore = getBestScoredVoice(selectedScores);
      return {
        ...result,
        computed_classification: 'EXACT',
        computed_entity: result.entity || result.canonical_entity || bestScore?.best_entity || '-',
        computed_voice: result.voice || bestScore?.best_voice || '-',
        computed_votes: votedScores.length,
        total_votes: votedScores.length,
        votes_needed: votesNeeded,
        computed_score: bestScore?.score,
        selected_scores: selectedScores,
        voted_scores: votedScores,
      };
    }

    const votesByEntity = votedScores.reduce<Record<string, AlgorithmScore[]>>((acc, score) => {
      const entity = score.best_entity || '';
      if (!entity) {
        return acc;
      }
      acc[entity] = [...(acc[entity] || []), score];
      return acc;
    }, {});

    const winningEntity = Object.keys(votesByEntity)
      .sort((a, b) => votesByEntity[b].length - votesByEntity[a].length)[0];

    if (winningEntity) {
      const winningScores = votesByEntity[winningEntity];
      const bestVote = getBestScoredVoice(winningScores);

      if (winningScores.length >= votesNeeded) {
        return {
          ...result,
          computed_classification: 'CONSENSUS',
          computed_entity: winningEntity,
          computed_voice: bestVote?.best_voice || '-',
          computed_votes: winningScores.length,
          total_votes: votedScores.length,
          votes_needed: votesNeeded,
          computed_score: bestVote?.score,
          selected_scores: selectedScores,
          voted_scores: votedScores,
        };
      }
    }

    if (grayZoneScores.length > 0) {
      const bestGrayZone = getBestScoredVoice(grayZoneScores);
      const grayEntityVotes = bestGrayZone?.best_entity
        ? votesByEntity[bestGrayZone.best_entity]?.length || 0
        : 0;
      return {
        ...result,
        computed_classification: 'GRAY_ZONE',
        computed_entity: bestGrayZone?.best_entity || '-',
        computed_voice: bestGrayZone?.best_voice || '-',
        computed_votes: grayEntityVotes,
        total_votes: votedScores.length,
        votes_needed: votesNeeded,
        computed_score: bestGrayZone?.score,
        selected_scores: selectedScores,
        voted_scores: votedScores,
      };
    }

    const highestVoteCount = winningEntity ? votesByEntity[winningEntity].length : 0;

    return {
      ...result,
      computed_classification: 'REJECTED',
      computed_entity: '-',
      computed_voice: '-',
      computed_votes: highestVoteCount,
      total_votes: votedScores.length,
      votes_needed: votesNeeded,
      selected_scores: selectedScores,
      voted_scores: votedScores,
    };
  };

  const getComputedResults = (): ComputedSimilarityResult[] => {
    if (!data || !selectedEntity || selectedAlgorithms.length === 0) return [];

    const entityData = data.entities[selectedEntity];
    if (!entityData || !entityData.results) return [];

    return entityData.results
      .filter(result => !isTechnicalIdentifierTerm(result.term))
      .filter(result => Array.isArray(result.algorithm_scores))
      .map(computeResult)
      .filter(result => !selectedClassification || result.computed_classification === selectedClassification);
  };

  const exportToCsv = async () => {
    if (!selectedEntity) return;

    try {
      setIsExporting(true);
      const params = new URLSearchParams();
      if (selectedAlgorithms.length > 0) {
        params.set('algorithms', selectedAlgorithms.join(','));
      }
      if (selectedClassification) {
        params.set('classification', selectedClassification);
      }

      const response = await fetch(`${API_BASE}/export/${encodeURIComponent(selectedEntity)}?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `similitud_${selectedEntity}_${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError({
        title: 'No se pudo exportar el CSV',
        message: err instanceof Error ? err.message : 'El backend no pudo generar la exportación.',
        action: 'Revisa los logs del servicio api para ver la causa exacta.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const getVisiblePages = (): number[] => {
    if (totalPages <= 1) return [1];

    const firstPage = Math.max(1, currentPage - 2);
    const lastPage = Math.min(totalPages, currentPage + 2);
    const pages: number[] = [];

    for (let pageNumber = firstPage; pageNumber <= lastPage; pageNumber += 1) {
      pages.push(pageNumber);
    }

    if (!pages.includes(1)) {
      pages.unshift(1);
    }
    if (!pages.includes(totalPages)) {
      pages.push(totalPages);
    }

    return pages;
  };

  const handlePageSizeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextPageSize = Number(event.target.value);
    setPageSize(nextPageSize);
    setCurrentPage(1);
    loadResults(selectedEntity, 1, nextPageSize);
  };

  const getClassificationColor = (classification: string) => {
    switch (classification) {
      case 'EXACT':
        return 'bg-green-100 text-green-800';
      case 'CONSENSUS':
        return 'bg-blue-100 text-blue-800';
      case 'GRAY_ZONE':
        return 'bg-yellow-100 text-yellow-800';
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f9fafb' }}>
        <div className="text-center">
          <div style={{
            width: '3rem',
            height: '3rem',
            border: '4px solid #e5e7eb',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto'
          }}></div>
          <p style={{ marginTop: '1rem', color: '#6b7280', fontSize: '1rem' }}>
            Cargando resultados...
          </p>
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f9fafb' }}>
        <div className="max-w-2xl w-full mx-4">
          <div style={{ 
            backgroundColor: '#fef2f2', 
            border: '1px solid #fecaca',
            borderRadius: '0.5rem',
            padding: '2rem'
          }}>
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6" style={{ color: '#dc2626' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 style={{ color: '#991b1b', fontWeight: '600', fontSize: '1.125rem', marginBottom: '0.5rem' }}>
                  {error.title}
                </h3>
                <div style={{ color: '#7f1d1d', marginBottom: '1rem' }}>
                  <p style={{ marginBottom: '0.75rem' }}>{error.message}</p>
                  {error.action && (
                    <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                      {error.action}
                    </p>
                  )}
                  {error.command && (
                    <div style={{
                      backgroundColor: '#fee2e2',
                      padding: '0.75rem',
                      borderRadius: '0.375rem',
                      marginTop: '0.75rem',
                      fontFamily: 'monospace',
                      fontSize: '0.875rem'
                    }}>
                      {error.command}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => loadResults(selectedEntity, currentPage)}
                  style={{
                    backgroundColor: '#dc2626',
                    color: 'white',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#b91c1c'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
                >
                  Reintentar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const entities = Object.keys(data.entities);
  const currentEntity = selectedEntity ? data.entities[selectedEntity] : null;
  const computedResults = getComputedResults();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Resultados de Similitud
            </h1>
            <p className="text-sm text-gray-600">
              Última actualización: {new Date(data.timestamp).toLocaleString()}
            </p>
            <p className="text-sm text-gray-600">
              Total de entradas: {data.total_entries.toLocaleString()}
            </p>
            {data.source && (
              <p className="text-sm text-gray-600">
                Fuente: {data.source}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => loadResults(selectedEntity, currentPage)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Recargar
            </button>
            <button
              onClick={exportToCsv}
              disabled={!selectedEntity || totalResults === 0 || isExporting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {isExporting ? 'Exportando...' : 'Exportar CSV'}
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Filtros</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {/* Selector de Entidad */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Entidad
              </label>
              <select
                value={selectedEntity}
                onChange={(e) => {
                  const nextEntity = e.target.value;
                  setSelectedEntity(nextEntity);
                  setSelectedAlgorithms(getDefaultAlgorithmsForEntity(nextEntity));
                  setSelectedClassification('');
                  setCurrentPage(1);
                  loadResults(nextEntity, 1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {entities.map((entity) => (
                  <option key={entity} value={entity}>
                    {entity}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtros de Algoritmos */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Clasificación
              </label>
              <select
                value={selectedClassification}
                onChange={(e) => setSelectedClassification(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Todas</option>
                <option value="EXACT">EXACT</option>
                <option value="CONSENSUS">CONSENSUS</option>
                <option value="GRAY_ZONE">GRAY_ZONE</option>
                <option value="REJECTED">REJECTED</option>
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Algoritmos
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {getAvailableAlgorithms().map((algorithm) => (
                  <label key={algorithm} className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedAlgorithms.includes(algorithm)}
                      onChange={() => handleAlgorithmToggle(algorithm)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-gray-700">{algorithm}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {selectedAlgorithms.length === 0
                  ? 'Selecciona uno o más algoritmos para calcular la votación'
                  : `Calculando votación con ${selectedAlgorithms.length} algoritmo(s). Los permitidos por configuración vienen seleccionados por defecto.`}
              </p>
            </div>
          </div>
        </div>

        {/* Estadísticas */}
        {currentEntity && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{currentEntity.known_voices}</div>
              <div className="text-sm text-gray-600">Voces Conocidas</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{currentEntity.unique_terms}</div>
              <div className="text-sm text-gray-600">Términos Únicos</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{currentEntity.total_citations.toLocaleString()}</div>
              <div className="text-sm text-gray-600">Citaciones Totales</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className={`text-2xl font-bold ${(currentEntity.coverage ?? 0) > 80 ? 'text-green-600' : 'text-yellow-600'}`}>
                {typeof currentEntity.coverage === 'number' ? `${currentEntity.coverage.toFixed(1)}%` : 'N/A'}
              </div>
              <div className="text-sm text-gray-600">Cobertura</div>
            </div>
          </div>
        )}

        {/* Tabla de Resultados */}
        <div className="bg-white rounded-lg shadow overflow-hidden relative">
          {tableLoading && (
            <div className="absolute inset-0 bg-white/70 z-10 flex items-center justify-center">
              <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg shadow text-sm text-gray-700">
                Cargando página...
              </div>
            </div>
          )}
          <div className="overflow-x-auto" style={{ maxHeight: '600px' }}>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Término
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Frecuencia
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Entidad Canónica
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Clasificación
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Votos de consenso
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Algoritmos
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {computedResults.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      {selectedAlgorithms.length === 0 
                        ? 'Selecciona uno o más algoritmos para calcular y mostrar resultados'
                        : 'No hay resultados que coincidan con los filtros seleccionados'}
                    </td>
                  </tr>
                ) : (
                  computedResults.map((result, idx) => {
                    return (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {result.term}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                          {result.frequency}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {result.computed_entity}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getClassificationColor(result.computed_classification)}`}>
                            {result.computed_classification}
                          </span>
                        </td>
                        <td
                          className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right"
                          title={`${result.total_votes} algoritmo(s) votaron; ${result.computed_votes} apuntan a la entidad ganadora. Se necesitan ${result.votes_needed}.`}
                        >
                          {result.computed_votes}/{result.votes_needed}
                          <div className="text-xs text-gray-400">
                            total: {result.total_votes}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-600">
                          {result.voted_scores.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {result.voted_scores.map((score, i) => (
                                <span
                                  key={`${score.algorithm}-${i}`}
                                  className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded"
                                  title={`${score.algorithm}: ${formatScore(score.score)} / threshold ${formatScore(score.threshold)} / entidad ${score.best_entity || '-'} / voz ${score.best_voice || '-'}`}
                                >
                                  {score.algorithm}: {formatScore(score.score)}
                                  {score.best_voice ? ` → ${score.best_voice}` : ''}
                                </span>
                              ))}
                            </div>
                          ) : '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          
          {computedResults.length > 0 && (
            <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <p className="text-sm text-gray-600">
                    Mostrando {computedResults.length} de {totalResults.toLocaleString()} resultado(s). Página {currentPage} de {totalPages || 1}.
                  </p>
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    Mostrar
                    <select
                      value={pageSize}
                      onChange={handlePageSizeChange}
                      disabled={tableLoading}
                      className="px-2 py-1 border border-gray-300 rounded-lg bg-white text-gray-700 disabled:opacity-50"
                    >
                      {PAGE_SIZE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    por página
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => loadResults(selectedEntity, currentPage - 1)}
                    disabled={tableLoading || currentPage <= 1}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
                  {getVisiblePages().map((pageNumber) => (
                    <button
                      key={pageNumber}
                      onClick={() => loadResults(selectedEntity, pageNumber)}
                      disabled={tableLoading || pageNumber === currentPage}
                      className={`px-3 py-1.5 border rounded-lg text-sm ${pageNumber === currentPage ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-white'}`}
                    >
                      {pageNumber}
                    </button>
                  ))}
                  <button
                    onClick={() => loadResults(selectedEntity, currentPage + 1)}
                    disabled={tableLoading || currentPage >= totalPages}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SimilarityResults;
