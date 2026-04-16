@echo off
echo ================================================================================
echo Test Correcto: Uso de Portada Data Layer
echo ================================================================================

echo Detectando contenedor de la API...
for /f "tokens=*" %%i in ('docker ps --filter "name=api" --format "{{.Names}}"') do set CONTAINER_NAME=%%i

if "%CONTAINER_NAME%"=="" (
    echo [ERROR] No se encontro contenedor de API corriendo
    pause
    exit /b 1
)

echo [OK] Contenedor detectado: %CONTAINER_NAME%

echo Copiando script al contenedor...
docker cp test_correct_usage.py %CONTAINER_NAME%:/app/
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] No se pudo copiar el script
    pause
    exit /b 1
)
echo [OK] Script copiado

echo.
echo Ejecutando test...
echo ================================================================================
docker exec -it %CONTAINER_NAME% python /app/test_correct_usage.py

echo.
echo ================================================================================
echo [OK] Test completado
echo ================================================================================
pause
