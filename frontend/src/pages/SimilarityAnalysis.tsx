import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Card,
  CardContent,
  Grid,
  Button,
  LinearProgress,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';

interface EntitySummary {
  name: string;
  status: string;
  known_voices: number;
  unique_terms: number;
  coverage: number;
  classification: {
    EXACT?: number;
    CONSENSUS?: number;
    GRAY_ZONE?: number;
    REJECTED?: number;
  };
}

interface Summary {
  timestamp: string;
  total_entries: number;
  entities_summary: EntitySummary[];
}

interface MatchResult {
  term: string;
  frequency: number;
  classification: string;
  canonical_entity?: string;
  similarity_score?: number;
}

interface EntityDetail {
  name: string;
  status: string;
  error?: string;
  known_voices: number;
  unique_terms: number;
  total_citations: number;
  coverage: number;
  classification: {
    EXACT?: number;
    CONSENSUS?: number;
    GRAY_ZONE?: number;
    REJECTED?: number;
  };
  top_matches: MatchResult[];
  gray_zone_cases: MatchResult[];
  rejected_cases: MatchResult[];
}

const SimilarityAnalysis: React.FC = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string>('');
  const [entityDetail, setEntityDetail] = useState<EntityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);

  const API_BASE = 'http://localhost:8000/api/v1/similarity';

  useEffect(() => {
    fetchSummary();
  }, []);

  useEffect(() => {
    if (selectedEntity) {
      fetchEntityDetail(selectedEntity);
    }
  }, [selectedEntity]);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/summary`);
      if (!response.ok) {
        throw new Error('No hay resultados disponibles');
      }
      const data = await response.json();
      setSummary(data);
      if (data.entities_summary.length > 0) {
        setSelectedEntity(data.entities_summary[0].name);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const fetchEntityDetail = async (entityName: string) => {
    try {
      const response = await fetch(`${API_BASE}/entity/${entityName}`);
      if (!response.ok) {
        throw new Error(`No hay detalles para ${entityName}`);
      }
      const data = await response.json();
      setEntityDetail(data);
    } catch (err) {
      console.error('Error fetching entity detail:', err);
      setEntityDetail(null);
    }
  };

  const downloadResults = async () => {
    window.open(`${API_BASE}/download/full`, '_blank');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircleIcon color="success" />;
      case 'error':
        return <ErrorIcon color="error" />;
      case 'no_data':
      case 'no_citations':
        return <WarningIcon color="warning" />;
      default:
        return <WarningIcon color="disabled" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'success';
      case 'error':
        return 'error';
      case 'no_data':
      case 'no_citations':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getClassificationColor = (classification: string) => {
    switch (classification) {
      case 'EXACT':
        return 'success';
      case 'CONSENSUS':
        return 'primary';
      case 'GRAY_ZONE':
        return 'warning';
      case 'REJECTED':
        return 'error';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Cargando resultados...</Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="error">
          {error}
          <br />
          <br />
          Ejecuta el proceso de análisis primero: <code>run_similarity_analysis.bat</code>
        </Alert>
      </Container>
    );
  }

  if (!summary) {
    return null;
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Análisis de Similitud
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Última actualización: {new Date(summary.timestamp).toLocaleString()}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Total de entradas procesadas: {summary.total_entries.toLocaleString()}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<DownloadIcon />}
          onClick={downloadResults}
        >
          Descargar Resultados
        </Button>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {summary.entities_summary.map((entity) => (
          <Grid item xs={12} sm={6} md={3} key={entity.name}>
            <Card
              sx={{
                cursor: 'pointer',
                border: selectedEntity === entity.name ? 2 : 0,
                borderColor: 'primary.main',
              }}
              onClick={() => setSelectedEntity(entity.name)}
            >
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  {getStatusIcon(entity.status)}
                  <Typography variant="h6" sx={{ ml: 1 }}>
                    {entity.name}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Voces: {entity.known_voices}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Términos: {entity.unique_terms}
                </Typography>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Cobertura
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Box sx={{ width: '100%', mr: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={entity.coverage}
                        color={entity.coverage > 80 ? 'success' : entity.coverage > 60 ? 'warning' : 'error'}
                      />
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {entity.coverage.toFixed(1)}%
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Entity Detail */}
      {entityDetail && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom>
            {entityDetail.name}
          </Typography>

          {entityDetail.error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {entityDetail.error}
            </Alert>
          )}

          {entityDetail.status === 'success' && (
            <>
              {/* Stats */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4">{entityDetail.known_voices}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Voces Conocidas
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4">{entityDetail.unique_terms}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Términos Únicos
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4">{entityDetail.total_citations.toLocaleString()}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Citaciones Totales
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4" color={entityDetail.coverage > 80 ? 'success.main' : 'warning.main'}>
                      {entityDetail.coverage.toFixed(1)}%
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Cobertura
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>

              {/* Classification */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Clasificación
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  {Object.entries(entityDetail.classification).map(([key, value]) => (
                    <Chip
                      key={key}
                      label={`${key}: ${value}`}
                      color={getClassificationColor(key) as any}
                      variant="outlined"
                    />
                  ))}
                </Box>
              </Box>

              {/* Tabs */}
              <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)} sx={{ mb: 2 }}>
                <Tab label={`Top Matches (${entityDetail.top_matches.length})`} />
                <Tab label={`Zona Gris (${entityDetail.gray_zone_cases.length})`} />
                <Tab label={`Rechazados (${entityDetail.rejected_cases.length})`} />
              </Tabs>

              {/* Top Matches */}
              {tabValue === 0 && (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Término</TableCell>
                        <TableCell>Frecuencia</TableCell>
                        <TableCell>Entidad Canónica</TableCell>
                        <TableCell>Clasificación</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {entityDetail.top_matches.map((match, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{match.term}</TableCell>
                          <TableCell>{match.frequency}</TableCell>
                          <TableCell>{match.canonical_entity || '-'}</TableCell>
                          <TableCell>
                            <Chip
                              label={match.classification}
                              color={getClassificationColor(match.classification) as any}
                              size="small"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              {/* Gray Zone */}
              {tabValue === 1 && (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Término</TableCell>
                        <TableCell>Frecuencia</TableCell>
                        <TableCell>Entidad Canónica</TableCell>
                        <TableCell>Score</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {entityDetail.gray_zone_cases.map((match, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{match.term}</TableCell>
                          <TableCell>{match.frequency}</TableCell>
                          <TableCell>{match.canonical_entity || '-'}</TableCell>
                          <TableCell>{match.similarity_score?.toFixed(3) || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              {/* Rejected */}
              {tabValue === 2 && (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Término</TableCell>
                        <TableCell>Frecuencia</TableCell>
                        <TableCell>Nota</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {entityDetail.rejected_cases.map((match, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{match.term}</TableCell>
                          <TableCell>{match.frequency}</TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">
                              Posible entidad faltante
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </>
          )}
        </Paper>
      )}
    </Container>
  );
};

export default SimilarityAnalysis;
