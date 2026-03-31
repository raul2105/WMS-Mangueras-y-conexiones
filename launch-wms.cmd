@echo off
setlocal

set "SCRIPT=%~dp0tools\launch-wms.ps1"
if not exist "%SCRIPT%" set "SCRIPT=%~dp0scripts\release\launch-wms.ps1"

if not exist "%SCRIPT%" (
  echo [ERROR] Launcher script not found.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
exit /b %ERRORLEVEL%
