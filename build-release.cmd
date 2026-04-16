@echo off
setlocal

set "SCRIPT=%~dp0scripts\build-release.ps1"
if not exist "%SCRIPT%" set "SCRIPT=%~dp0scripts\release\build-release.ps1"
if not exist "%SCRIPT%" (
  echo [ERROR] Missing script: %SCRIPT%
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
if errorlevel 1 (
  echo.
  echo [ERROR] build-release fallo. Revisa el mensaje de arriba.
  pause
  exit /b %ERRORLEVEL%
)
exit /b 0
