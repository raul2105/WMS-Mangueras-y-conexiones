@echo off
setlocal

set "SCRIPT=%~dp0..\tools\maintenance\init-local.ps1"
if not exist "%SCRIPT%" set "SCRIPT=%~dp0..\scripts\release\maintenance\init-local.ps1"

if not exist "%SCRIPT%" (
  echo No se encontro el script de inicializacion.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
exit /b %ERRORLEVEL%
