@echo off
TITLE WMS Launcher
echo Starting WMS Mangueras y Conexiones...
echo Script: %~f0
echo Folder: %~dp0

setlocal EnableExtensions EnableDelayedExpansion

set "PREFERRED_PORT=3002"

:: Always run from the repo root (this script's directory)
pushd "%~dp0"
echo Working dir: %CD%

:: Verify Node.js version (Next 16 + Prisma support Node 20/24)
for /f "delims=" %%V in ('node -v 2^>nul') do set "NODE_VERSION=%%V"
if not defined NODE_VERSION (
    echo Node.js no encontrado en PATH. Instala Node 20 LTS o 24 y vuelve a intentar.
    pause
    exit /b 1
)

set "NODE_VERSION=%NODE_VERSION:v=%"
for /f "tokens=1 delims=." %%M in ("%NODE_VERSION%") do set "NODE_MAJOR=%%M"
if not "%NODE_MAJOR%"=="20" if not "%NODE_MAJOR%"=="24" (
    echo Version de Node detectada: v%NODE_VERSION%.
    echo Este proyecto requiere Node 20 LTS v20.x o Node 24 v24.x.
    echo Cambia a Node 20 o 24 y vuelve a ejecutar este script.
    pause
    exit /b 1
)

:: Check if node_modules exists
if not exist "node_modules" (
    echo node_modules not found. Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo Error installing dependencies.
        pause
        exit /b %ERRORLEVEL%
    )
)

:: Guard against corrupt/incomplete node_modules
if not exist "node_modules\\next\\dist\\compiled\\commander\\package.json" (
    echo node_modules parece incompleto. Reinstalando dependencias...
    rmdir /s /q "node_modules" >nul 2>&1
    del /f /q "package-lock.json" >nul 2>&1
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo Error reinstalling dependencies.
        pause
        exit /b %ERRORLEVEL%
    )
)

:: Setup DB (SQLite) if missing
if not exist "prisma\\dev.db" (
    echo Local database not found. Creating database and running migrations...
    call npm run db:setup
    if %ERRORLEVEL% NEQ 0 (
        echo Error setting up database.
        pause
        exit /b %ERRORLEVEL%
    )
)

:: Detect if Next.js dev server is already listening (preferred: port 3002)
echo Checking if a dev server is already running...
call :DETECT_DEV_PORT

if defined DEV_PORT (
    echo Next.js dev server already running on port !DEV_PORT!.
    echo Opening browser...
    call :OPEN_URL "!DEV_PORT!"
    popd
    endlocal
    exit /b 0
)

:: If a stale lock exists (crash/forced close), remove it so next dev can start
if exist ".next\\dev\\lock" (
    echo Found stale Next.js lock file. Removing .next\dev\lock...
    del /f /q ".next\\dev\\lock" >nul 2>&1
)

:: Start Next.js Server (in a new window to avoid locking this launcher)
echo Starting Development Server...
start "Next.js Dev Server" cmd /c "npm run dev"

:: Wait until a dev port opens, then open the browser
for /l %%I in (1,1,30) do (
    call :DETECT_DEV_PORT
    if defined DEV_PORT goto :OPEN_BROWSER
    timeout /t 1 /nobreak >nul
)

echo Could not detect a listening dev port (3002-3010). Please check the dev server window.
goto :END

:OPEN_BROWSER
call :OPEN_URL "!DEV_PORT!"

:END
popd
endlocal
exit /b 0

:: --- helpers ---
:DETECT_DEV_PORT
set "DEV_PORT="
for %%P in (3002 3003 3004 3005 3006 3007 3008 3009 3010) do (
    for /f "delims=" %%L in ('netstat -ano -p tcp ^| findstr /R /C:":%%P .*LISTENING"') do (
        set "DEV_PORT=%%P"
        goto :DETECT_DEV_PORT_DONE
    )
)
:DETECT_DEV_PORT_DONE
exit /b 0

:OPEN_URL
set "_PORT=%~1"
if not defined _PORT set "_PORT=%PREFERRED_PORT%"

:: If PowerShell returned whitespace/newlines, trim obvious spaces
set "_PORT=%_PORT: =%"
if not defined _PORT set "_PORT=%PREFERRED_PORT%"

set "_URL=http://localhost:%_PORT%/"
echo Opening browser at %_URL%
start "" "%_URL%"
exit /b 0
