# Operacion Integrada WMS (Windows Local)

## Comandos canonicos
- Inicializar DB local (solo primera vez por release): `maintenance\init-local.cmd`
- Iniciar app: `launcher.cmd`
- Detener app: `stop.cmd`
- Healthcheck: `maintenance\healthcheck.cmd`
- Respaldo manual: `maintenance\backup-db.cmd`
- Restaurar respaldo: `maintenance\restore-db.cmd`
- Desinstalar: `uninstall.cmd`

## Flujo operativo minimo
1. Recepcion (`/inventory/receive` o recepcion de OC) crea movimiento, `TraceRecord` y `LabelPrintJob`.
2. Picking (`/inventory/pick`) crea movimiento, trace y etiqueta de salida.
3. Ajuste (`/inventory/adjust`) crea movimiento, trace y etiqueta de ajuste.
4. Ensamble exacto (`/production/orders/[id]`) pasa por liberar surtido, confirmar pick task hacia WIP y cierre/consumo final.
5. Etiquetas de ubicacion se generan desde detalle de almacen (`/warehouse/[id]` -> `Etiqueta`).
6. Toda etiqueta resuelve por `Trace ID` en `/trace/[traceId]`.

## Smoke checklist E2E
- Build/release
  - `npm run verify:release`
  - `build-release.cmd`
  - validar que exista `release\wms-scmayer-<version>-windows-x64.zip`
- Runtime local
  - `maintenance\init-local.cmd`
  - `launcher.cmd`
  - abrir `http://127.0.0.1:3002/api/health`
  - `stop.cmd` y validar respaldo en `%LOCALAPPDATA%\wms-scmayer\backups`
- Inventario + etiquetas
  - registrar una entrada y confirmar redireccion a `/labels/jobs/[id]`
  - imprimir/exportar HTML y abrir trace desde la etiqueta
  - registrar una salida y un ajuste, repitiendo validacion de etiqueta/trace
- Compras
  - recibir una OC parcial con 2+ lineas
  - validar `/labels/document/PURCHASE_RECEIPT/[id]` con una etiqueta por linea
- Ensamble
  - crear orden exacta
  - liberar surtido
  - confirmar al menos una tarea de pick con operador
  - validar etiqueta WIP y trace
  - cerrar y consumir con operador
- Mantenimiento
  - `maintenance\backup-db.cmd`
  - `maintenance\restore-db.cmd`
  - `uninstall.cmd -KeepData`

## Notas de soporte
- `launch-wms.cmd` y `stop-wms.cmd` quedan como alias de compatibilidad.
- El flujo operativo de trazabilidad actual es operativo-documental; no implementa genealogia completa de compra a consumo final.
