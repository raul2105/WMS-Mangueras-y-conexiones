@echo off
setlocal
title WMS Dev Local Launcher

pushd "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js no esta disponible en PATH.
  popd
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm no esta disponible en PATH.
  popd
  exit /b 1
)

if not exist "node_modules" (
  echo [INFO] Instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install fallo.
    popd
    exit /b 1
  )
)

echo [INFO] Detectando DATABASE_URL para modo AWS...
call :resolve_database_url_from_env_file
call :is_valid_postgres_url
if "%VALID_DATABASE_URL%"=="1" goto :database_ready

echo [WARN] DATABASE_URL no encontrada o invalida en .env.
echo [INFO] Ejecutando configuracion AWS automatica...
if not exist "maintenance\setup-aws.cmd" (
  echo [ERROR] No se encontro maintenance\setup-aws.cmd.
  popd
  exit /b 1
)

call maintenance\setup-aws.cmd
if errorlevel 1 (
  echo [WARN] setup-aws.cmd termino con error. Se reintentara validar DATABASE_URL.
)

echo [INFO] Reintentando deteccion de DATABASE_URL en .env...
set "ENV_DATABASE_URL="
call :resolve_database_url_from_env_file
call :is_valid_postgres_url
if "%VALID_DATABASE_URL%"=="1" goto :database_ready

echo [INFO] Intentando DATABASE_URL de entorno de maquina...
set "ENV_DATABASE_URL="
call :resolve_database_url_from_machine_env
call :is_valid_postgres_url
if "%VALID_DATABASE_URL%"=="1" goto :database_ready

echo [ERROR] DATABASE_URL no esta configurada con un valor PostgreSQL valido.
echo [ERROR] Configura DATABASE_URL con maintenance\setup-aws.cmd y vuelve a intentar.
popd
exit /b 1

:database_ready
echo [INFO] DATABASE_URL valida detectada para PostgreSQL AWS.
set "DATABASE_URL=%ENV_DATABASE_URL%"

echo [INFO] Verificando disponibilidad del puerto 3002...
call :assert_port_free 3002
if errorlevel 1 (
  popd
  exit /b 1
)

echo [INFO] Generando cliente Prisma AWS (PostgreSQL)...
call node scripts/db/generate-aws-prisma-client.cjs
if errorlevel 1 (
  echo [ERROR] No se pudo generar Prisma client AWS.
  popd
  exit /b 1
)

set "WMS_DB_MODE=aws"
set "WMS_DISABLE_SYNC_EVENTS_IN_WEB=true"

echo [INFO] Iniciando entorno dev local (AWS DB) en http://localhost:3002 ...
echo [INFO] Para detener: stop_dev_server.cmd
call npm run dev
set "EXIT_CODE=%ERRORLEVEL%"

popd
endlocal & exit /b %EXIT_CODE%

:resolve_database_url_from_env_file
set "ENV_DATABASE_URL="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\db\read-database-url.ps1" -Source env_file -EnvFilePath ".env"`) do set "ENV_DATABASE_URL=%%I"
goto :eof

:resolve_database_url_from_machine_env
set "ENV_DATABASE_URL="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\db\read-database-url.ps1" -Source machine_env`) do set "ENV_DATABASE_URL=%%I"
goto :eof

:is_valid_postgres_url
set "VALID_DATABASE_URL=0"
if not defined ENV_DATABASE_URL goto :eof
if /I "%ENV_DATABASE_URL:~0,11%"=="postgres://" set "VALID_DATABASE_URL=1"
if /I "%ENV_DATABASE_URL:~0,13%"=="postgresql://" set "VALID_DATABASE_URL=1"
goto :eof

:assert_port_free
set "TARGET_PORT=%~1"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\dev\check-port.ps1" -Port %TARGET_PORT%
if errorlevel 2 (
  echo [ERROR] No se puede iniciar el entorno local porque el puerto %TARGET_PORT% esta ocupado.
  echo [INFO] Ejecuta stop_dev_server.cmd y vuelve a intentar.
  exit /b 1
)
if errorlevel 1 (
  echo [ERROR] No se pudo verificar el estado del puerto %TARGET_PORT%.
  exit /b 1
)
exit /b 0
