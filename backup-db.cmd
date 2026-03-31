@echo off
setlocal

set "SCRIPT=%~dp0tools\backup-db.ps1"
if not exist "%SCRIPT%" set "SCRIPT=%~dp0scripts\release\backup-db.ps1"

if not exist "%SCRIPT%" (
  echo [ERROR] Backup script not found.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
exit /b %ERRORLEVEL%
