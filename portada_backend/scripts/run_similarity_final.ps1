# Script PowerShell para ejecutar generación de similitud (6 entidades disponibles)
# El resultado se guarda directamente donde el backend lo lee

$ErrorActionPreference = "Stop"

$CONTAINER = "portada_ingestion_docker-api-1"
$SCRIPT_SRC = "portada_backend/scripts/generate_similarity_all_entities.py"
$SCRIPT_DST = "/app/generate_similarity_all_entities.py"

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "GENERACIÓN DE RESULTADOS DE SIMILITUD (6 ENTIDADES)" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Entidades: port, ship_type, flag, master_role, comodity, unit" -ForegroundColor White
Write-Host ""

# Verificar que el contenedor existe
Write-Host "[1/2] Verificando contenedor..." -ForegroundColor Yellow
$containers = docker ps -a --format "{{.Names}}"
if ($containers -notcontains $CONTAINER) {
    Write-Host "ERROR: Contenedor '$CONTAINER' no encontrado" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Contenedor encontrado" -ForegroundColor Green
Write-Host ""

# Copiar script al contenedor
Write-Host "[2/2] Copiando y ejecutando script..." -ForegroundColor Yellow
docker cp $SCRIPT_SRC "${CONTAINER}:${SCRIPT_DST}"
Write-Host "✓ Script copiado" -ForegroundColor Green
Write-Host ""

# Ejecutar script (guarda directamente en /app/similarity_results/)
Write-Host "Ejecutando proceso (puede tardar 5-10 minutos)..." -ForegroundColor Yellow
Write-Host "================================================================================" -ForegroundColor Cyan
docker exec -it $CONTAINER python $SCRIPT_DST
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "PROCESO COMPLETADO" -ForegroundColor Green
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Los resultados están disponibles en el backend" -ForegroundColor White
Write-Host "Visualiza en: http://localhost:5173/similarity-results" -ForegroundColor White
Write-Host ""
Write-Host "Recarga el frontend con Ctrl+F5 para ver los cambios" -ForegroundColor Yellow
Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
