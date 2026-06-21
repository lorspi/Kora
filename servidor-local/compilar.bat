@echo off
chcp 65001 > nul
title Kora - Compilar Paquete

cd /d "%~dp0"

set "VERSION_FILE=..\public\version.txt"
set "VERSION=unknown"

if exist "%VERSION_FILE%" (
    set /p VERSION=<"%VERSION_FILE%"
)

set "OUTPUT=Kora-Servidor-Local-%VERSION%.zip"

echo ========================================
echo  Compilando paquete Kora v%VERSION%...
echo ========================================
echo.

if exist "%OUTPUT%" del "%OUTPUT%" > nul 2>&1

echo Archivos incluidos:
echo   - iniciar-servidor.bat
echo   - iniciar-servidor.sh
echo   - Instrucciones.md
echo   - ..\dist\ (carpeta completa)
echo.

powershell -NoProfile -Command "Compress-Archive -Path 'iniciar-servidor.bat', 'iniciar-servidor.sh', 'Instrucciones.md', '..\dist' -DestinationPath '%OUTPUT%' -CompressionLevel Optimal -Force"

echo.
echo  [OK] Paquete creado: %OUTPUT%
echo.
echo  Presiona cualquier tecla para salir...
pause > nul
