@echo off
setlocal

set "SCRIPT=%~dp0tools\healthcheck.ps1"
if not exist "%SCRIPT%" set "SCRIPT=%~dp0scripts\release\healthcheck.ps1"

if not exist "%SCRIPT%" (
  echo [ERROR] Healthcheck script not found.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
exit /b %ERRORLEVEL%
