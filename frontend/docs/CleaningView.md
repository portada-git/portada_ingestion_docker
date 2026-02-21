# Vista de Limpieza de Datos (CleaningView)

## Descripción

La vista de Limpieza de Datos es un "Desambiguador de Términos Históricos" que permite analizar y normalizar términos utilizando algoritmos de similitud de texto.

## Características

### Panel de Configuración (Sidebar)

1. **Campo a analizar**
   - Selección del campo de datos a procesar
   - Opciones: Rol del capitán, Puerto, Mercancía, Tipo de barco

2. **Algoritmos**
   - Levenshtein_OCR (azul)
   - Jaro_Winkler (verde)
   - Nilsim_2 (púrpura)
   - Selección múltiple con indicador visual

3. **Umbrales de aprobación**
   - Sliders para ajustar el umbral de cada algoritmo (0.00 - 1.00)
   - Valores predeterminados configurables

4. **Zonas grises**
   - Rango mínimo y máximo para cada algoritmo
   - Define áreas de incertidumbre en la clasificación

5. **Filtros**
   - Campo opcional para filtrar términos específicos

### Área Principal

#### Estado de Configuración
- Muestra términos cargados
- Voces normalizadas disponibles
- Indicador de filtros aplicados

#### Procesamiento
- Barra de progreso para cada algoritmo
- Indicadores visuales del estado de procesamiento
- Mensajes de estado en tiempo real

#### Resultados

1. **Resumen de Resultados**
   - Total de ocurrencias
   - Porcentaje consensuado (estricto)
   - Porcentaje consensuado + fuzzy
   - Términos únicos

2. **Distribución por Clasificación**
   - Tabla con clasificaciones encontradas
   - Número de ocurrencias por clasificación
   - Porcentajes calculados

3. **Vista Previa de Datos**
   - Tabla con términos procesados
   - Puntuaciones de similitud por algoritmo
   - Clasificación asignada

4. **Descarga de Resultados**
   - CSV completo
   - Todos los CSV en ZIP
   - Informe TXT

## Flujo de Uso

1. Usuario abre la vista desde el menú de Procesos
2. Configura los parámetros en el panel lateral:
   - Selecciona campo a analizar
   - Elige algoritmos
   - Ajusta umbrales y zonas grises
   - (Opcional) Aplica filtros
3. Hace clic en "Ejecutar Análisis"
4. El sistema procesa los datos mostrando progreso
5. Se muestran los resultados con estadísticas y tablas
6. Usuario puede descargar los resultados en diferentes formatos

## Componentes Técnicos

### Estado
```typescript
interface CleaningConfig {
  field: string;
  algorithms: string[];
  thresholds: { [key: string]: number };
  grayZones: { [key: string]: { min: number; max: number } };
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
  preview: Array<{ [key: string]: any }>;
}
```

### Funcionalidades Principales

- `handleProcessing()`: Ejecuta el análisis con los parámetros configurados
- `toggleAlgorithm()`: Activa/desactiva algoritmos
- Panel lateral colapsable para maximizar espacio de resultados
- Simulación de procesamiento con pasos visuales

## Integración

### Rutas
- Ruta principal: `/cleaning`
- Accesible desde: Vista de Procesos → Card "Limpieza de datos"

### Traducciones
- Español: `es.json` → `cleaning.*`
- Inglés: `en.json` → `cleaning.*`
- Griego: `el.json` → `cleaning.*`

## Próximas Mejoras

1. Integración con API backend real
2. Guardado de configuraciones
3. Historial de análisis previos
4. Exportación de configuraciones
5. Visualización de matrices de similitud
6. Gráficos de distribución
7. Comparación de resultados entre diferentes configuraciones
