@echo off
setlocal

set "SCRIPT=%~dp0tools\stop-wms.ps1"
if not exist "%SCRIPT%" set "SCRIPT=%~dp0scripts\release\stop-wms.ps1"

if not exist "%SCRIPT%" (
  echo [ERROR] Stop script not found.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
exit /b %ERRORLEVEL%
