#!/bin/bash
# Script para ejecutar generación de similitud (6 entidades disponibles)
# El resultado se guarda directamente donde el backend lo lee

set -e

CONTAINER="portada_ingestion_docker-api-1"
SCRIPT_SRC="portada_backend/scripts/generate_similarity_all_entities.py"
SCRIPT_DST="/app/generate_similarity_all_entities.py"

echo "================================================================================"
echo "GENERACIÓN DE RESULTADOS DE SIMILITUD (6 ENTIDADES)"
echo "================================================================================"
echo ""
echo "Entidades: port, ship_type, flag, master_role, comodity, unit"
echo ""

# Verificar que el contenedor existe
echo "[1/2] Verificando contenedor..."
if ! docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "ERROR: Contenedor '${CONTAINER}' no encontrado"
    exit 1
fi
echo "✓ Contenedor encontrado"
echo ""

# Copiar script al contenedor
echo "[2/2] Copiando y ejecutando script..."
docker cp "${SCRIPT_SRC}" "${CONTAINER}:${SCRIPT_DST}"
echo "✓ Script copiado"
echo ""

# Ejecutar script (guarda directamente en /app/similarity_results/)
echo "Ejecutando proceso (puede tardar 5-10 minutos)..."
echo "================================================================================"
docker exec -it "${CONTAINER}" python "${SCRIPT_DST}"
echo "================================================================================"
echo ""

echo "================================================================================"
echo "PROCESO COMPLETADO"
echo "================================================================================"
echo ""
echo "Los resultados están disponibles en el backend"
echo "Visualiza en: http://localhost:5173/similarity-results"
echo ""
echo "Recarga el frontend con Ctrl+F5 para ver los cambios"
echo ""
echo "================================================================================"
