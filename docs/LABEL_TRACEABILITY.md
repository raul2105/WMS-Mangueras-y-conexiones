# Label & Traceability Flow

## Objetivo
- Generar etiquetas operativas desde eventos de inventario con `Trace ID` resoluble en la app.
- Mantener diseño extensible para nuevas plantillas/salidas (por ejemplo ZPL) sin duplicar lógica por pantalla.

## Flujo
1. Operación (`receive`, `pick`, `adjust`, `WIP pick task`) registra `InventoryMovement`.
2. Se crea/actualiza `TraceRecord` con:
   - `traceId`
   - fuente (`sourceEntityType/sourceEntityId`)
   - documento origen (`sourceDocumentType/sourceDocumentId/sourceDocumentLineId`)
   - payload operativo estructurado
3. Se crea `LabelPrintJob` usando `LabelTemplate` activa para el tipo de etiqueta.
4. El usuario aterriza en `/labels/jobs/[jobId]` para imprimir/exportar.
5. El `Trace ID` resuelve en `/trace/[traceId]` mostrando historial operativo y jobs de impresión.

## Tipos mínimos implementados
- `RECEIPT`: entradas (incluye recepción directa de inventario y recepción desde compras).
- `PICKING`: salidas.
- `ADJUSTMENT`: ajustes.
- `WIP`: surtido hacia WIP en ensamble.
- `LOCATION`: etiqueta maestra de ubicación (manual).

## Endpoints/Pantallas clave
- Impresión/reimpresión: `/labels/jobs/[jobId]`
- Export HTML: `/api/labels/jobs/[jobId]/html`
- Etiquetas por documento: `/labels/document/[documentType]/[documentId]`
- Resolución trace: `/trace/[traceId]`
- Lookup rápido: `/trace` y acceso directo desde `/inventory`
- Generación de etiqueta de ubicación: `/labels/location/[locationId]`

## Extensión futura
- Agregar renderer `ZPL` reutilizando `TraceRecord.payloadJson` y `LabelTemplate`.
- Incorporar usuarios reales (auth) y mapear `operatorName` a identidad autenticada.
- Extender trazabilidad documental a flujos de compra más avanzados sin alterar el modelo base.

