@echo off
TITLE WMS Rigentec - Actualizacion
setlocal EnableExtensions EnableDelayedExpansion

echo.
echo ============================================================
echo   WMS Rigentec - Actualizacion del Sistema
echo ============================================================
echo.
echo  AVISO: El servidor se detendra brevemente (1-2 minutos^).
echo  Los usuarios activos perderan la conexion temporalmente.
echo.
set /p CONFIRM= ^> Continuar con la actualizacion? (S/N):
if /i not "!CONFIRM!"=="S" (
    echo.
    echo  Actualizacion cancelada.
    pause
    exit /b 0
)

pushd "%~dp0"
echo.

:: -------------------------------------------------------
:: PASO 1/5 - Respaldo de base de datos
:: -------------------------------------------------------
echo  [1/5] Creando respaldo de base de datos...
call "%~dp0backup_db.cmd"
echo.

:: -------------------------------------------------------
:: PASO 2/5 - Instalar nuevas dependencias
:: -------------------------------------------------------
echo  [2/5] Actualizando dependencias...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo  ERROR: Fallo la actualizacion de dependencias.
    pause
    exit /b 1
)
echo  Dependencias ............... OK
echo.

:: -------------------------------------------------------
:: PASO 3/5 - Migraciones de base de datos
:: -------------------------------------------------------
echo  [3/5] Aplicando migraciones de base de datos...
call npx prisma migrate deploy
if %ERRORLEVEL% NEQ 0 (
    echo  ADVERTENCIA: Fallo la migracion de base de datos.
    echo  Verifica el estado de la BD antes de continuar.
    set /p CONTINUE= ^> Continuar de todas formas? (S/N):
    if /i not "!CONTINUE!"=="S" exit /b 1
)
call npx prisma generate >nul 2>&1
echo  Base de datos .............. OK
echo.

:: -------------------------------------------------------
:: PASO 4/5 - Recompilar
:: -------------------------------------------------------
echo  [4/5] Compilando nueva version...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  ERROR: Fallo la compilacion.
    echo  El servidor sigue corriendo con la version anterior.
    echo  Revisa los errores e intenta de nuevo.
    pause
    exit /b 1
)
echo  Build ...................... OK
echo.

:: -------------------------------------------------------
:: PASO 5/5 - Reiniciar servidor
:: -------------------------------------------------------
echo  [5/5] Reiniciando servidor...
pm2 restart wms-rigentec
if %ERRORLEVEL% NEQ 0 (
    echo  Servidor no estaba corriendo. Iniciando...
    call pm2 start npm --name "wms-rigentec" -- run start
)
call pm2 save >nul 2>&1
echo  Servidor ................... OK
echo.

echo ============================================================
echo   Actualizacion completada exitosamente
echo ============================================================
echo.
echo   El WMS esta disponible en: http://localhost:3002
echo.

popd
endlocal
pause
