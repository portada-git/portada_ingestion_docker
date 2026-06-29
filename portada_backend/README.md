# PortAda Backend API

API RESTful para el proyecto PortAda usando FastAPI, PySpark y Delta Lake.

## Iniciar

```bash
docker-compose up --build
```

La API estará disponible en: http://localhost:8000
Documentación Swagger: http://localhost:8000/docs

## Probar

```bash
chmod +x portada_backend/test_api.sh
./portada_backend/test_api.sh
```

## Generar resultados de similitud en Spark/Delta

El flujo recomendado escribe resultados en Delta Lake para que el backend y el frontend los lean con paginación, sin cargar un JSON completo en memoria.

```bash
# 1) Rebuild/recreate del API si cambió código, Dockerfile o portada-s-index
docker compose build api
docker compose up -d api

# 2) Ejecutar una entidad primero para validar
docker compose exec api python /app/scripts/generate_similarity_delta_results.py \
  --entities ship_type

# 3) Ver runs generados
curl http://localhost:8001/api/v1/similarity/runs

# 4) Leer resultados paginados
curl "http://localhost:8001/api/v1/similarity/results?entity=ship_type&limit=50"
```

Ruta física esperada:

```text
/app/delta_lake/portada_project/similarity_results
```

En el host:

```text
delta_lake/portada_project/similarity_results
```

Tablas Delta generadas:

- `similarity_runs`
- `similarity_terms`
- `similarity_entity_summaries`
- `similarity_results`
- `similarity_algorithm_scores`

Notas importantes:

- El script calcula todos los algoritmos configurados excepto `semantic_model`.
- No crea `similarity_known_voices`; las voces conocidas se leen desde la fuente existente del data-layer.
- El frontend ya consume los endpoints paginados del backend.

### Ver consumo de RAM durante la ejecución

Por defecto el script imprime memoria cada 30 segundos:

```text
[memory] periodic: process_tree_rss=2.4 GiB container_usage=3.1 GiB
```

Ejecutar con intervalo personalizado:

```bash
docker compose exec api python /app/scripts/generate_similarity_delta_results.py \
  --entities ship_type \
  --memory-log-interval-seconds 10
```

Desactivar logs periódicos:

```bash
docker compose exec api python /app/scripts/generate_similarity_delta_results.py \
  --entities ship_type \
  --memory-log-interval-seconds 0
```

Ejecutar todos los algoritmos a todas las entidades 

```bash
docker compose exec api python /app/scripts/generate_similarity_delta_results.py
```

### Flujo JSON legacy

El generador JSON antiguo sigue disponible como fallback/debug:

```bash
docker compose exec api python /app/scripts/generate_similarity_with_datalayer.py \
  --output-dir /app/similarity_results \
  --output-file similarity_results_datalayer.json
```

Para pruebas de escala y uso normal del frontend, usa el script Delta.

## Endpoints Principales

### Queries
- `GET /api/v1/queries/gaps` - Fechas faltantes
- `GET /api/v1/queries/entries/count` - Cantidad de entradas
- `GET /api/v1/queries/entities` - Catálogo de entidades
- `GET /api/v1/queries/publications` - Lista de publicaciones

### Audit
- `GET /api/v1/audit/duplicates/metadata` - Metadatos de duplicados
- `GET /api/v1/audit/duplicates/records/{log_id}` - Detalles de duplicados
- `GET /api/v1/audit/storage` - Auditoría de almacenamiento
- `GET /api/v1/audit/process` - Auditoría de procesos
