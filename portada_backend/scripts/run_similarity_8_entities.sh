#!/bin/bash
# Script para ejecutar generación de similitud con 8 entidades
# Uso: bash portada_backend/scripts/run_similarity_8_entities.sh

set -e

CONTAINER="portada_ingestion_docker-api-1"
SCRIPT_SRC="portada_backend/scripts/generate_similarity_with_cleaning.py"
SCRIPT_DST="/app/generate_similarity_with_cleaning.py"
RESULTS_SRC="/tmp/similarity_results/similarity_results.json"
RESULTS_DST="portada_backend/similarity_results/similarity_results.json"

echo "================================================================================"
echo "GENERACIÓN DE RESULTADOS DE SIMILITUD (8 ENTIDADES)"
echo "================================================================================"
echo ""

# Verificar que el contenedor existe
echo "[1/4] Verificando contenedor..."
if ! docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "ERROR: Contenedor '${CONTAINER}' no encontrado"
    exit 1
fi
echo "✓ Contenedor encontrado"
echo ""

# Copiar script al contenedor
echo "[2/4] Copiando script al contenedor..."
docker cp "${SCRIPT_SRC}" "${CONTAINER}:${SCRIPT_DST}"
echo "✓ Script copiado"
echo ""

# Ejecutar script
echo "[3/4] Ejecutando proceso (puede tardar 10-15 minutos)..."
echo "================================================================================"
docker exec -it "${CONTAINER}" python "${SCRIPT_DST}"
echo "================================================================================"
echo ""

# Copiar resultados
echo "[4/4] Copiando resultados al host..."
mkdir -p "portada_backend/similarity_results"
docker cp "${CONTAINER}:${RESULTS_SRC}" "${RESULTS_DST}"
echo "✓ Resultados copiados"
echo ""

echo "================================================================================"
echo "PROCESO COMPLETADO"
echo "================================================================================"
echo ""
echo "Resultados guardados en: ${RESULTS_DST}"
echo "Visualiza en: http://localhost:5173/similarity-results"
echo ""
echo "================================================================================"
