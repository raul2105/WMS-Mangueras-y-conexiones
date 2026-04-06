# Release Windows (MSI -> SC MAYER)

## Prerrequisitos en MSI
- Windows 10/11 x64
- Node.js instalado en MSI (solo para construir)
- Acceso a internet para descargar el zip portable de Node la primera vez

## Generar release
1. Abrir PowerShell en la raiz del proyecto.
2. Ejecutar:
   ```powershell
   .\build-release.cmd
   ```
3. Esperar a que termine `npm run verify:release`.
   - Si falla por lock de Prisma (`query_engine-windows.dll.node`), cerrar procesos Node que usen este repo (por ejemplo Playwright dev server) y volver a ejecutar.
4. Verificar artefactos:
   - `release\wms-scmayer-<version>-windows-x64\`
   - `release\wms-scmayer-<version>-windows-x64.zip`

## Copiar a SC MAYER
1. Copiar la carpeta o el `.zip` generado.
2. En SC MAYER, ubicarlo en una ruta fija, por ejemplo:
   - `C:\WMS-SCMayer\`
3. Si se copio zip, extraerlo.

## Primera instalacion en SC MAYER
- Inicializar SQLite una sola vez:
  ```cmd
  maintenance\init-local.cmd
  ```
- Esto crea la DB operativa en:
  - `%LOCALAPPDATA%\wms-scmayer\data\wms.db`

## Arranque / operacion diaria
- Iniciar:
  ```cmd
  launcher.cmd
  ```
- Detener:
  ```cmd
  stop.cmd
  ```
- Compatibilidad: `launch-wms.cmd` y `stop-wms.cmd` delegan al flujo canónico anterior.

## Desinstalacion / migracion a otro equipo
- Ejecutar en el equipo anterior:
  ```cmd
  uninstall.cmd
  ```
- El desinstalador ahora tiene 2 modos:
  - `Conservar datos`: elimina binarios release, accesos directos, PID/run state, logs y cache, pero conserva BD SQLite y respaldos.
  - `Completo`: elimina todo el estado local (incluyendo BD y respaldos) y la carpeta release.
- Modo conservar datos por parametro:
  ```cmd
  uninstall.cmd -KeepData
  ```
- Modo limpieza total por parametro:
  ```cmd
  uninstall.cmd -Full
  ```
- Para modo completo se exige confirmacion fuerte:
  - `ELIMINAR BASE`
  - `ELIMINAR RESPALDOS`
- Si la BD esta bloqueada o el proceso sigue vivo, la desinstalacion aborta con mensaje claro.
- En modo conservar datos, si detecta archivos en `app\public\uploads\`, aborta para evitar perdida accidental.
- Siempre genera bitacora y reporte final:
  - `%TEMP%\wms-scmayer-uninstall\<timestamp>\uninstall.log`
  - `%TEMP%\wms-scmayer-uninstall\<timestamp>\cleanup-report.txt`

## Mantenimiento (soporte)
- Healthcheck:
  ```cmd
  maintenance\healthcheck.cmd
  ```
- Backup manual:
  ```cmd
  maintenance\backup-db.cmd
  ```
- Restore simple:
  ```cmd
  maintenance\restore-db.cmd
  ```

## Persistencia al actualizar version
Al reemplazar la release por una nueva, conservar:
- `%LOCALAPPDATA%\wms-scmayer\data\wms.db`
- `%LOCALAPPDATA%\wms-scmayer\backups\`
- `app\public\uploads\`

## Operacion integrada
- Ver flujo operativo E2E (ensamble + etiquetas + trazabilidad + mantenimiento local):
  - `docs/OPERACION_INTEGRADA_WMS.md`
