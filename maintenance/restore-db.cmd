@echo off
setlocal

set "SCRIPT=%~dp0..\tools\maintenance\restore-db.ps1"
if not exist "%SCRIPT%" set "SCRIPT=%~dp0..\scripts\release\maintenance\restore-db.ps1"

if not exist "%SCRIPT%" (
  echo No se encontro el script de restauracion.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
exit /b %ERRORLEVEL%
