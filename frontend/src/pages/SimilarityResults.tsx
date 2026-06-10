import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

interface SimilarityResult {
  term: string;
  frequency: number;
  classification: string;
  canonical_entity?: string;
  similarity_score?: number;
  algorithms_votes?: any;
}

interface EntityData {
  name: string;
  status: string;
  known_voices: number;
  unique_terms: number;
  total_citations: number;
  coverage: number;
  results: SimilarityResult[];
}

interface ResultsData {
  timestamp: string;
  total_entries: number;
  entities: {
    [key: string]: EntityData;
  };
}

const SimilarityResults: React.FC = () => {
  const [data, setData] = useState<ResultsData | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string>('');
  const [selectedAlgorithms, setSelectedAlgorithms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = 'http://localhost:8000/api/v1/similarity';

  // Algoritmos disponibles
  const availableAlgorithms = [
    'levenshtein_ocr',
    'levenshtein_ratio',
    'jaro_winkler',
    'ngram_2',
    'ngram_3',
    'ngram_4',
    'phonetic_dm',
    'soundex',
    'semantica',
    'text2vec',
    'semantic_model',
  ];

  useEffect(() => {
    loadResults();
  }, []);

  const loadResults = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/results`);
      
      if (!response.ok) {
        throw new Error('No hay resultados disponibles');
      }
      
      const results = await response.json();
      setData(results);
      
      // Seleccionar primera entidad por defecto
      const entities = Object.keys(results.entities);
      if (entities.length > 0) {
        setSelectedEntity(entities[0]);
      }
      
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const handleAlgorithmToggle = (algorithm: string) => {
    setSelectedAlgorithms(prev =>
      prev.includes(algorithm)
        ? prev.filter(a => a !== algorithm)
        : [...prev, algorithm]
    );
  };

  const getFilteredResults = (): SimilarityResult[] => {
    if (!data || !selectedEntity) return [];
    
    const entityData = data.entities[selectedEntity];
    if (!entityData || !entityData.results) return [];
    
    let results = entityData.results;
    
    // Filtrar por algoritmos si hay alguno seleccionado
    if (selectedAlgorithms.length > 0) {
      results = results.filter(result => {
        // Si no tiene algorithm_scores, mostrar solo si no hay filtros
        if (!result.algorithms_votes && !result.algorithm_scores) {
          return false;
        }
        
        // Buscar en algorithm_scores (array)
        if (result.algorithm_scores && Array.isArray(result.algorithm_scores)) {
          return result.algorithm_scores.some((score: any) => 
            selectedAlgorithms.includes(score.algorithm)
          );
        }
        
        // Buscar en algorithms_votes (objeto) - por compatibilidad
        if (result.algorithms_votes) {
          return selectedAlgorithms.some(alg => 
            result.algorithms_votes[alg] !== undefined
          );
        }
        
        return false;
      });
    }
    
    return results;
  };

  const exportToExcel = () => {
    if (!data || !selectedEntity) return;
    
    const results = getFilteredResults();
    const entityData = data.entities[selectedEntity];
    
    console.log('Exportando:', {
      totalResults: results.length,
      selectedEntity,
      selectedAlgorithms
    });
    
    // Preparar datos para Excel - Hoja de Resultados
    const excelData = results.map(result => {
      // Obtener los algoritmos que votaron
      let algorithmsUsed = '';
      if (result.algorithm_scores && Array.isArray(result.algorithm_scores)) {
        algorithmsUsed = result.algorithm_scores
          .filter((s: any) => s.voted)
          .map((s: any) => s.algorithm)
          .join(', ');
      }
      
      return {
        'Término': result.term,
        'Frecuencia': result.frequency,
        'Clasificación': result.classification,
        'Entidad Canónica': result.canonical_entity || result.entity || '-',
        'Voz': result.voice || '-',
        'Score': result.similarity_score?.toFixed(3) || '-',
        'Votos': result.votes || 0,
        'Algoritmos': algorithmsUsed || '-'
      };
    });
    
    console.log('Datos para Excel:', excelData.length, 'filas');
    
    // Crear workbook
    const wb = XLSX.utils.book_new();
    
    // Hoja 1: Resumen
    const summary = [
      ['Entidad', selectedEntity],
      ['Fecha', new Date(data.timestamp).toLocaleString()],
      ['Voces Conocidas', entityData.known_voices],
      ['Términos Únicos', entityData.unique_terms],
      ['Citaciones Totales', entityData.total_citations],
      ['Cobertura', `${entityData.coverage}%`],
      [],
      ['Algoritmos Aplicados', selectedAlgorithms.length > 0 ? selectedAlgorithms.join(', ') : 'Todos'],
      ['Resultados Mostrados', results.length],
    ];
    
    const wsSummary = XLSX.utils.aoa_to_sheet(summary);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');
    
    // Hoja 2: Resultados
    if (excelData.length > 0) {
      const ws = XLSX.utils.json_to_sheet(excelData);
      XLSX.utils.book_append_sheet(wb, ws, 'Resultados');
      console.log('Hoja Resultados agregada con', excelData.length, 'filas');
    } else {
      console.warn('No hay datos para la hoja de Resultados');
    }
    
    // Descargar
    const fileName = `similitud_${selectedEntity}_${Date.now()}.xlsx`;
    XLSX.writeFile(wb, fileName);
    console.log('Archivo descargado:', fileName);
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
                  No hay resultados disponibles
                </h3>
                <div style={{ color: '#7f1d1d', marginBottom: '1rem' }}>
                  <p style={{ marginBottom: '0.75rem' }}>{error}</p>
                  <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                    El proceso de análisis de similitud no se ha ejecutado todavía.
                  </p>
                  <p style={{ fontSize: '0.875rem' }}>
                    Para generar los resultados, ejecuta el siguiente comando en el servidor:
                  </p>
                  <div style={{ 
                    backgroundColor: '#fee2e2', 
                    padding: '0.75rem', 
                    borderRadius: '0.375rem',
                    marginTop: '0.75rem',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem'
                  }}>
                    python portada_backend/run_generate_similarity.py
                  </div>
                </div>
                <button
                  onClick={loadResults}
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
  const filteredResults = getFilteredResults();

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
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadResults}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Recargar
            </button>
            <button
              onClick={exportToExcel}
              disabled={!selectedEntity || filteredResults.length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Exportar a Excel
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Filtros</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Selector de Entidad */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Entidad
              </label>
              <select
                value={selectedEntity}
                onChange={(e) => setSelectedEntity(e.target.value)}
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
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Algoritmos
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {availableAlgorithms.map((algorithm) => (
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
                  ? 'Mostrando resultados de todos los algoritmos'
                  : `Filtrando por ${selectedAlgorithms.length} algoritmo(s)`}
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
              <div className={`text-2xl font-bold ${currentEntity.coverage > 80 ? 'text-green-600' : 'text-yellow-600'}`}>
                {currentEntity.coverage.toFixed(1)}%
              </div>
              <div className="text-sm text-gray-600">Cobertura</div>
            </div>
          </div>
        )}

        {/* Tabla de Resultados */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
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
                    Votos
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Algoritmos
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredResults.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      {selectedAlgorithms.length > 0 
                        ? 'No hay resultados que coincidan con los algoritmos seleccionados'
                        : 'No hay resultados para mostrar'}
                    </td>
                  </tr>
                ) : (
                  filteredResults.map((result, idx) => {
                    // Obtener algoritmos que votaron
                    const votedAlgorithms = result.algorithm_scores && Array.isArray(result.algorithm_scores)
                      ? result.algorithm_scores.filter((s: any) => s.voted).map((s: any) => s.algorithm)
                      : [];
                    
                    return (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {result.term}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                          {result.frequency}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {result.canonical_entity || result.entity || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getClassificationColor(result.classification)}`}>
                            {result.classification}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                          {result.votes || 0}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-600">
                          {votedAlgorithms.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {votedAlgorithms.slice(0, 3).map((alg: string, i: number) => (
                                <span key={i} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                                  {alg}
                                </span>
                              ))}
                              {votedAlgorithms.length > 3 && (
                                <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                                  +{votedAlgorithms.length - 3}
                                </span>
                              )}
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
          
          {filteredResults.length > 0 && (
            <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                Mostrando {filteredResults.length} resultado(s)
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SimilarityResults;
