@echo off
setlocal

set "SCRIPT=%~dp0tools\restore-db.ps1"
if not exist "%SCRIPT%" set "SCRIPT=%~dp0scripts\release\restore-db.ps1"

if not exist "%SCRIPT%" (
  echo [ERROR] Restore script not found.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
exit /b %ERRORLEVEL%
