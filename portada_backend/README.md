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
