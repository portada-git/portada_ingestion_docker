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

## Regenerar resultados de similitud con data-layer

Usa este flujo para validar cambios en `portada-s-index` o en el generador canónico:

```bash
# 1) Rebuild/recreate del API si cambió portada-s-index o el Dockerfile
docker compose build api
docker compose up -d api

# 2) Copiar el script canónico al contenedor
docker cp \
  portada_backend/scripts/generate_similarity_with_datalayer.py \
  portada_ingestion_docker-api-1:/tmp/generate_similarity_with_datalayer.py

# 3) Ejecutar el cálculo y escribir el JSON donde el backend lo lee
docker exec -it portada_ingestion_docker-api-1 python \
  /tmp/generate_similarity_with_datalayer.py \
  --output-dir /app/similarity_results \
  --output-file similarity_results_datalayer.json
```

El script usa `REDIS_HOST`, `REDIS_PORT` y opcionalmente `REDIS_DB` desde el
contenedor para inicializar la metadata del data-layer. En Docker Compose ya
vienen definidos para el servicio API.

El generador lee las entradas raw con `force_all=True` para evitar depender de
`states/ship_entries`; esa carpeta puede quedar con parquets obsoletos después
de ingestas o reconstrucciones y no debe limitar el cálculo global de similitud.

Resultado esperado:

- Host: `portada_backend/similarity_results/similarity_results_datalayer.json`
- Contenedor: `/app/similarity_results/similarity_results_datalayer.json`
- UI: http://localhost:5173/similarity-results

Para una validación rápida de pocas entidades:

```bash
docker exec -it portada_ingestion_docker-api-1 python \
  /tmp/generate_similarity_with_datalayer.py \
  --output-dir /app/similarity_results \
  --output-file similarity_results_datalayer.json \
  --entities port comodity unit
```

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
