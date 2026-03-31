@echo off
setlocal

set "SCRIPT=%~dp0tools\stop.ps1"
if not exist "%SCRIPT%" set "SCRIPT=%~dp0scripts\release\stop.ps1"

if not exist "%SCRIPT%" (
  echo No se encontro el script de detencion.
  echo Contacta al soporte tecnico.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
if errorlevel 1 (
  echo.
  echo No se pudo detener WMS correctamente.
  echo Revisa los logs en %%LOCALAPPDATA%%\wms-rigentec\logs
  exit /b 1
)

exit /b 0
