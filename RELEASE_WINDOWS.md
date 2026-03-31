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
4. Verificar artefactos:
   - `release\wms-rigentec-<version>-windows-x64\`
   - `release\wms-rigentec-<version>-windows-x64.zip`

## Copiar a SC MAYER
1. Copiar la carpeta o el `.zip` generado.
2. En SC MAYER, ubicarlo en una ruta fija, por ejemplo:
   - `C:\WMS-Rigentec\`
3. Si se copio zip, extraerlo.

## Primera instalacion en SC MAYER
- Inicializar SQLite una sola vez:
  ```cmd
  maintenance\init-local.cmd
  ```
- Esto crea la DB operativa en:
  - `%LOCALAPPDATA%\wms-rigentec\data\wms.db`

## Arranque / operacion diaria
- Iniciar:
  ```cmd
  launcher.cmd
  ```
- Detener:
  ```cmd
  stop.cmd
  ```

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
- `%LOCALAPPDATA%\wms-rigentec\data\wms.db`
- `%LOCALAPPDATA%\wms-rigentec\backups\`
- `app\public\uploads\`
