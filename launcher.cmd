@echo off
setlocal

set "SCRIPT=%~dp0tools\launcher.ps1"
if not exist "%SCRIPT%" set "SCRIPT=%~dp0scripts\release\launcher.ps1"

if not exist "%SCRIPT%" (
  echo No se encontro el launcher interno.
  echo Contacta al soporte tecnico.
  exit /b 1
)

echo Abriendo WMS...
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
if errorlevel 1 (
  echo.
  echo No se pudo iniciar WMS.
  echo Revisa los logs en %%LOCALAPPDATA%%\wms-scmayer\logs
  pause
  exit /b 1
)

exit /b 0
