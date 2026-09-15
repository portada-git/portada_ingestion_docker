# Comandos para Reconstruir Docker y Ejecutar

## 1. Reconstruir el contenedor Docker

```bash
# Detener y eliminar el contenedor actual
docker compose down

# Reconstruir la imagen (forzando rebuild sin cache)
docker compose build --no-cache api

# O reconstruir todo
docker compose build --no-cache

# Levantar los servicios
docker compose up -d
```

## 2. Verificar que el contenedor está corriendo

```bash
docker ps
```

Deberías ver `portada_ingestion_docker-api-1` en la lista.

## 3. Ejecutar el script de generación de similitud

### Opción A: Desde el host (recomendado)

```bash
# En Windows
python portada_backend/run_generate_similarity.py

# En Linux/Mac
python3 portada_backend/run_generate_similarity.py
```

### Opción B: Directamente en el contenedor (para pruebas rápidas)

```bash
# 1. Copiar archivos de configuración
docker exec -u root portada_ingestion_docker-api-1 python -m pip install --no-cache-dir --upgrade --no-deps portada-s-index==0.2.3
docker cp .examples/portada-s-index/config_jsons_delcorreo/schema.json portada_ingestion_docker-api-1:/app/config/schema.json
docker cp .examples/portada-s-index/config_jsons_delcorreo/mapping_to_clean_chars.json portada_ingestion_docker-api-1:/app/config/mapping_to_clean_chars.json
docker cp data_layer_config/delta_data_layer_config.json portada_ingestion_docker-api-1:/app/config/delta_data_layer_config.json
docker cp data_layer_config/config_similarity.json portada_ingestion_docker-api-1:/app/config/config_similarity.json

# 2. Copiar script datalayer
docker cp portada_backend/scripts/generate_similarity_with_datalayer.py portada_ingestion_docker-api-1:/app/generate_similarity_with_datalayer.py

# 3. Ejecutar dentro del contenedor
docker exec -it portada_ingestion_docker-api-1 python /app/generate_similarity_with_datalayer.py

# 4. Copiar resultados al host
docker cp portada_ingestion_docker-api-1:/tmp/similarity_results/similarity_results_datalayer.json portada_backend/similarity_results/similarity_results.json
```

## 4. Verificar los resultados

```bash
# Ver el archivo generado
ls -lh portada_backend/similarity_results/similarity_results.json

# Ver las primeras líneas
head -n 50 portada_backend/similarity_results/similarity_results.json
```

## 5. Instalar dependencias del frontend (solo una vez)

```bash
cd frontend
npm install
cd ..
```

## 6. Acceder a la interfaz web

Abre tu navegador en: `http://localhost:5173/similarity-results`

---

## Troubleshooting

### Si el contenedor no está corriendo:

```bash
docker compose up -d
```

### Si hay problemas de permisos:

```bash
# En Linux, dar permisos al script
chmod +x portada_backend/run_generate_similarity.py
```

### Ver logs del contenedor:

```bash
docker logs portada_ingestion_docker-api-1
```

### Entrar al contenedor para debug:

```bash
docker exec -it portada_ingestion_docker-api-1 bash
```

### Verificar que los archivos están en el contenedor:

```bash
docker exec portada_ingestion_docker-api-1 ls -la /app/config/
docker exec portada_ingestion_docker-api-1 ls -la /tmp/similarity_results/
```
