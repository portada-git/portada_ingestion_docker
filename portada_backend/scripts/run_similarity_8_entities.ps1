# Script PowerShell para ejecutar generación de similitud con 8 entidades
# Uso: .\portada_backend\scripts\run_similarity_8_entities.ps1

$ErrorActionPreference = "Stop"

$CONTAINER = "portada_ingestion_docker-api-1"
$SCRIPT_SRC = "portada_backend/scripts/generate_similarity_with_cleaning.py"
$SCRIPT_DST = "/app/generate_similarity_with_cleaning.py"
$RESULTS_SRC = "/tmp/similarity_results/similarity_results.json"
$RESULTS_DST = "portada_backend/similarity_results/similarity_results.json"

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "GENERACIÓN DE RESULTADOS DE SIMILITUD (8 ENTIDADES)" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que el contenedor existe
Write-Host "[1/4] Verificando contenedor..." -ForegroundColor Yellow
$containers = docker ps -a --format "{{.Names}}"
if ($containers -notcontains $CONTAINER) {
    Write-Host "ERROR: Contenedor '$CONTAINER' no encontrado" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Contenedor encontrado" -ForegroundColor Green
Write-Host ""

# Copiar script al contenedor
Write-Host "[2/4] Copiando script al contenedor..." -ForegroundColor Yellow
docker cp $SCRIPT_SRC "${CONTAINER}:${SCRIPT_DST}"
Write-Host "✓ Script copiado" -ForegroundColor Green
Write-Host ""

# Ejecutar script
Write-Host "[3/4] Ejecutando proceso (puede tardar 10-15 minutos)..." -ForegroundColor Yellow
Write-Host "================================================================================" -ForegroundColor Cyan
docker exec -it $CONTAINER python $SCRIPT_DST
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

# Copiar resultados
Write-Host "[4/4] Copiando resultados al host..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "portada_backend/similarity_results" | Out-Null
docker cp "${CONTAINER}:${RESULTS_SRC}" $RESULTS_DST
Write-Host "✓ Resultados copiados" -ForegroundColor Green
Write-Host ""

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "PROCESO COMPLETADO" -ForegroundColor Green
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Resultados guardados en: $RESULTS_DST" -ForegroundColor White
Write-Host "Visualiza en: http://localhost:5173/similarity-results" -ForegroundColor White
Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
