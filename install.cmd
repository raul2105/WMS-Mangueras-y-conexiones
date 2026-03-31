@echo off
TITLE WMS Rigentec - Instalador
setlocal EnableExtensions EnableDelayedExpansion

echo.
echo ============================================================
echo   WMS Rigentec - Instalador de Servidor Local
echo   Configura el WMS para uso en red interna
echo ============================================================
echo.

:: -------------------------------------------------------
:: Verificar permisos de Administrador
:: -------------------------------------------------------
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  ERROR: Este script requiere permisos de Administrador.
    echo.
    echo  Instrucciones:
    echo    1. Cierra esta ventana
    echo    2. Click derecho sobre install.cmd
    echo    3. Selecciona "Ejecutar como administrador"
    echo.
    pause
    exit /b 1
)

set "PROJECT_DIR=%~dp0"
set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
pushd "%PROJECT_DIR%"
echo  Directorio del proyecto: %PROJECT_DIR%
echo.

:: -------------------------------------------------------
:: PASO 1/7 - Node.js
:: -------------------------------------------------------
echo  [1/7] Verificando Node.js...
node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  Node.js no encontrado. Instalando Node.js 20 LTS via winget...
    echo  (Requiere conexion a internet, puede tardar 2-3 minutos^)
    echo.
    winget install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo  ERROR: No se pudo instalar Node.js automaticamente.
        echo.
        echo  Solucion manual:
        echo    1. Ve a: https://nodejs.org
        echo    2. Descarga "Node.js 20 LTS"
        echo    3. Instala con opciones por defecto
        echo    4. Reinicia el equipo
        echo    5. Ejecuta install.cmd de nuevo como Administrador
        echo.
        pause
        exit /b 1
    )
    echo.
    echo  Node.js instalado. Actualizando variables de entorno...
    :: Refresh PATH from registry
    for /f "tokens=2,* skip=2" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set "SYS_PATH=%%B"
    for /f "tokens=2,* skip=2" %%A in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "USR_PATH=%%B"
    set "PATH=!SYS_PATH!;!USR_PATH!"

    node --version >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo  Node.js fue instalado correctamente pero requiere reiniciar la sesion.
        echo.
        echo  Por favor:
        echo    1. Cierra esta ventana
        echo    2. Cierra sesion de Windows y vuelve a entrar (o reinicia el equipo^)
        echo    3. Abre CMD como Administrador
        echo    4. Navega a esta carpeta y ejecuta install.cmd de nuevo
        echo.
        pause
        exit /b 0
    )
)
for /f "delims=" %%V in ('node -v') do set "NODE_VER=%%V"
echo  Node.js %NODE_VER% ........... OK
echo.

:: -------------------------------------------------------
:: PASO 2/7 - Dependencias npm
:: -------------------------------------------------------
echo  [2/7] Instalando dependencias del proyecto...
echo  (Primera vez puede tardar 2-4 minutos^)
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  ERROR: Fallo la instalacion de dependencias.
    echo  Verifica que tengas conexion a internet e intenta de nuevo.
    pause
    exit /b 1
)
echo  Dependencias npm ........... OK
echo.

:: -------------------------------------------------------
:: PASO 3/7 - Base de datos
:: -------------------------------------------------------
echo  [3/7] Configurando base de datos...
if exist "prisma\dev.db" (
    echo  Base de datos existente detectada.
    echo  Aplicando migraciones pendientes...
    call npx prisma migrate deploy
) else (
    echo  Creando base de datos nueva...
    call npx prisma db push --accept-data-loss
)
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  ERROR: Fallo la configuracion de la base de datos.
    pause
    exit /b 1
)
call npx prisma generate >nul 2>&1
echo  Base de datos .............. OK
echo.

:: -------------------------------------------------------
:: PASO 4/7 - Build de produccion
:: -------------------------------------------------------
echo  [4/7] Compilando aplicacion (modo produccion^)...
echo  (Puede tardar 1-2 minutos^)
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  ERROR: Fallo la compilacion de la aplicacion.
    echo  Revisa los mensajes de error arriba.
    pause
    exit /b 1
)
echo  Build de produccion ........ OK
echo.

:: -------------------------------------------------------
:: PASO 5/7 - PM2 (administrador de procesos)
:: -------------------------------------------------------
echo  [5/7] Instalando administrador de procesos (PM2^)...
call npm install -g pm2 >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  ERROR: Fallo la instalacion de PM2.
    pause
    exit /b 1
)

:: Detener instancia anterior si existe
pm2 delete wms-rigentec >nul 2>&1

:: Iniciar la aplicacion
call pm2 start npm --name "wms-rigentec" -- run start
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  ERROR: Fallo al iniciar la aplicacion con PM2.
    pause
    exit /b 1
)
call pm2 save
echo  PM2 y servidor WMS ......... OK
echo.

:: -------------------------------------------------------
:: PASO 6/7 - Inicio automatico con Windows
:: -------------------------------------------------------
echo  [6/7] Configurando inicio automatico con Windows...

:: Crear script de arranque en la carpeta del proyecto
set "RESUME_SCRIPT=%PROJECT_DIR%\resume_wms.cmd"
(
    echo @echo off
    echo cd /d "%PROJECT_DIR%"
    echo pm2 resurrect
    echo timeout /t 5 /nobreak ^>nul
) > "%RESUME_SCRIPT%"

:: Agregar al Inicio de Windows via Task Scheduler (ONLOGON del usuario actual)
schtasks /delete /tn "WMS-Rigentec-AutoStart" /f >nul 2>&1
schtasks /create /tn "WMS-Rigentec-AutoStart" /tr "cmd /c \"%RESUME_SCRIPT%\"" /sc ONLOGON /ru "%USERNAME%" /rl HIGHEST /f >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    :: Fallback: copiar al folder de Inicio de Windows
    set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
    copy "%RESUME_SCRIPT%" "!STARTUP!\WMS-Rigentec.cmd" >nul 2>&1
    echo  Inicio automatico (Startup folder^) . OK
) else (
    echo  Inicio automatico (Task Scheduler^) .. OK
)
echo.

:: -------------------------------------------------------
:: PASO 7/7 - Firewall
:: -------------------------------------------------------
echo  [7/7] Configurando acceso en red local (firewall^)...
netsh advfirewall firewall delete rule name="WMS-Rigentec" >nul 2>&1
netsh advfirewall firewall add rule name="WMS-Rigentec" dir=in action=allow protocol=TCP localport=3002 >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  ADVERTENCIA: No se pudo configurar el firewall.
    echo  Puede que otras PCs en la red no puedan acceder al WMS.
    echo  Hazlo manualmente: Panel de Control > Firewall > Regla entrada TCP 3002
) else (
    echo  Firewall puerto 3002 ....... OK
)
echo.

:: -------------------------------------------------------
:: Obtener IP local
:: -------------------------------------------------------
set "LOCAL_IP="
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4" ^| findstr /v "127.0"') do (
    set "LOCAL_IP=%%A"
    set "LOCAL_IP=!LOCAL_IP: =!"
    goto :ip_found
)
:ip_found

:: -------------------------------------------------------
:: Resumen final
:: -------------------------------------------------------
echo.
echo ============================================================
echo   INSTALACION COMPLETADA EXITOSAMENTE
echo ============================================================
echo.
echo   El WMS Rigentec esta corriendo en modo produccion.
echo.
echo   Acceso desde este equipo (servidor^):
echo     http://localhost:3002
echo.
if defined LOCAL_IP (
    echo   Acceso desde otras PCs en la red local:
    echo     http://!LOCAL_IP!:3002
    echo.
)
echo   El WMS se iniciara automaticamente al encender este equipo.
echo.
echo   Archivos importantes:
echo     Base de datos:  prisma\dev.db
echo     Respaldos:      backups\
echo.
echo   Comandos utiles (abrir CMD^):
echo     pm2 status          - Ver si el servidor esta corriendo
echo     pm2 logs            - Ver registros de errores
echo     pm2 restart all     - Reiniciar servidor
echo     pm2 stop all        - Detener servidor manualmente
echo.
echo   Para actualizaciones futuras del sistema:
echo     Ejecuta update.cmd
echo.
echo   Para respaldar la base de datos manualmente:
echo     Ejecuta backup_db.cmd
echo ============================================================
echo.

:: Abrir el navegador automaticamente
timeout /t 4 /nobreak >nul
start "" "http://localhost:3002"

popd
endlocal
pause
