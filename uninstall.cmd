@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT_DIR=%~dp0"
set "ROOT_DIR=%ROOT_DIR:~0,-1%"

if exist "%ROOT_DIR%\app\server.js" (
  set "SCRIPT_SOURCE=%ROOT_DIR%\tools\uninstall.ps1"
  set "COMMON_SOURCE=%ROOT_DIR%\tools\common.ps1"
  if not exist "%SCRIPT_SOURCE%" set "SCRIPT_SOURCE=%ROOT_DIR%\scripts\release\uninstall.ps1"
  if not exist "%COMMON_SOURCE%" set "COMMON_SOURCE=%ROOT_DIR%\scripts\release\common.ps1"

  if not exist "%SCRIPT_SOURCE%" (
    echo [ERROR] No se encontro el script de desinstalacion de la release.
    exit /b 1
  )
  if not exist "%COMMON_SOURCE%" (
    echo [ERROR] No se encontro common.ps1 para la desinstalacion de la release.
    exit /b 1
  )

  for /f "delims=" %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%I"
  set "RUNNER_DIR=%TEMP%\wms-scmayer-uninstall\%STAMP%\runner"
  mkdir "%RUNNER_DIR%" >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] No se pudo crear carpeta temporal para ejecutar la desinstalacion.
    exit /b 1
  )

  copy /y "%SCRIPT_SOURCE%" "%RUNNER_DIR%\uninstall.ps1" >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] No se pudo copiar uninstall.ps1 al runner temporal.
    exit /b 1
  )
  copy /y "%COMMON_SOURCE%" "%RUNNER_DIR%\common.ps1" >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] No se pudo copiar common.ps1 al runner temporal.
    exit /b 1
  )

  set "FORWARD_ARGS=%*"
  set "FORWARD_ARGS=!FORWARD_ARGS:--keep-data=-KeepData!"
  set "FORWARD_ARGS=!FORWARD_ARGS:--full=-Full!"

  powershell -NoProfile -ExecutionPolicy Bypass -File "%RUNNER_DIR%\uninstall.ps1" -ReleaseRoot "%ROOT_DIR%" !FORWARD_ARGS!
  exit /b %ERRORLEVEL%
)

TITLE WMS-SCMayer - Desinstalador

echo.
echo ============================================================
echo   WMS-SCMayer - Desinstalador
echo   Limpia la instalacion local del servidor
echo ============================================================
echo.

set "KEEP_DATA=0"
if /I "%~1"=="--keep-data" set "KEEP_DATA=1"
if /I "%~1"=="-KeepData" set "KEEP_DATA=1"

net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  ERROR: Este script requiere permisos de Administrador.
    echo.
    echo  Instrucciones:
    echo    1. Cierra esta ventana
    echo    2. Click derecho sobre uninstall.cmd
    echo    3. Selecciona "Ejecutar como administrador"
    echo.
    pause
    exit /b 1
)

pushd "%ROOT_DIR%"
echo  Directorio del proyecto: %ROOT_DIR%
echo.

if exist "prisma\dev.db" (
    if "%KEEP_DATA%"=="1" (
        echo  Conservando base de datos local por opcion --keep-data
        echo.
    ) else (
        for /f "delims=" %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%I"
        set "BACKUP_DIR=backups\uninstall-!STAMP!"
        mkdir "!BACKUP_DIR!" >nul 2>&1
        copy /y "prisma\dev.db" "!BACKUP_DIR!\dev.db" >nul 2>&1
        if exist "prisma\dev.db-wal" copy /y "prisma\dev.db-wal" "!BACKUP_DIR!\dev.db-wal" >nul 2>&1
        if exist "prisma\dev.db-shm" copy /y "prisma\dev.db-shm" "!BACKUP_DIR!\dev.db-shm" >nul 2>&1
        echo  Respaldo local creado en: !BACKUP_DIR!
        echo.
    )
)

echo  [1/5] Deteniendo servicio PM2...
pm2 stop wms-scmayer >nul 2>&1
pm2 delete wms-scmayer >nul 2>&1
pm2 save >nul 2>&1
echo  PM2 ........................ OK
echo.

echo  [2/5] Eliminando inicio automatico...
schtasks /delete /tn "WMS-SCMayer-AutoStart" /f >nul 2>&1
if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\WMS-SCMayer.cmd" (
    del /f /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\WMS-SCMayer.cmd" >nul 2>&1
)
if exist "resume_wms.cmd" del /f /q "resume_wms.cmd" >nul 2>&1
echo  Inicio automatico .......... OK
echo.

echo  [3/5] Eliminando regla de firewall...
netsh advfirewall firewall delete rule name="WMS-SCMayer" >nul 2>&1
echo  Firewall ................... OK
echo.

echo  [4/5] Limpiando archivos locales...
if "%KEEP_DATA%"=="1" (
    echo  Se conservaron prisma\dev.db y backups\ por opcion --keep-data
) else (
    if exist "prisma\dev.db" del /f /q "prisma\dev.db" >nul 2>&1
    if exist "prisma\dev.db-wal" del /f /q "prisma\dev.db-wal" >nul 2>&1
    if exist "prisma\dev.db-shm" del /f /q "prisma\dev.db-shm" >nul 2>&1
    echo  Base de datos local removida.
)
echo.

echo  [5/5] Finalizando...
echo  Desinstalacion logica completada.
echo.
echo ============================================================
if "%KEEP_DATA%"=="1" (
    echo   La app fue desregistrada de este equipo.
    echo   Los datos locales permanecen en esta carpeta.
) else (
    echo   La app fue desregistrada y la BD local fue removida.
    echo   Se genero un respaldo en backups\ antes de borrar la BD.
)
echo.
echo   Si vas a migrar a otro equipo:
echo     1. Copia el respaldo necesario
echo     2. Elimina manualmente esta carpeta si ya no se usara
echo ============================================================
echo.

popd
endlocal
pause
