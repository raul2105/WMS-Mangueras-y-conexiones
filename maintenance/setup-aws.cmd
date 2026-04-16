@echo off
setlocal

set "SCRIPT=%~dp0..\tools\maintenance\setup-aws.ps1"
if not exist "%SCRIPT%" set "SCRIPT=%~dp0..\scripts\release\maintenance\setup-aws.ps1"

if not exist "%SCRIPT%" (
  echo No se encontro el script de configuracion.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
exit /b %ERRORLEVEL%
