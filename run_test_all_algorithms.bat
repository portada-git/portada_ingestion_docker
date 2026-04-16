@echo off
echo ================================================================================
echo Test Comparativo: Todos los Algoritmos de Similitud
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
docker cp test_all_algorithms.py %CONTAINER_NAME%:/app/
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] No se pudo copiar el script
    pause
    exit /b 1
)
echo [OK] Script copiado

echo.
echo ADVERTENCIA: Este test puede tardar varios minutos
echo Se probaran 13 algoritmos sobre 8 entidades
echo.
pause

echo Ejecutando test...
echo ================================================================================
docker exec -it %CONTAINER_NAME% python /app/test_all_algorithms.py

echo.
echo ================================================================================
echo [OK] Test completado
echo ================================================================================
echo.
echo Para copiar los resultados:
echo   docker cp %CONTAINER_NAME%:/tmp/test_all_algorithms ./test_all_algorithms_results
echo.
pause
