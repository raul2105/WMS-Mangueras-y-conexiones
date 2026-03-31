@echo off
setlocal

set "SCRIPT=%~dp0tools\init-local.ps1"
if not exist "%SCRIPT%" set "SCRIPT=%~dp0scripts\release\init-local.ps1"

if not exist "%SCRIPT%" (
  echo [ERROR] Init script not found.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
exit /b %ERRORLEVEL%
