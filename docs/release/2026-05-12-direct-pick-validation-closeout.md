# Cierre tecnico: validacion server-side de surtido directo

Fecha: 2026-05-12  
Repositorio: raul2105/WMS-Mangueras-y-conexiones

## Resumen breve

Se corrigio una inconsistencia de validacion server-side en el flujo de surtido directo para alinear acciones sensibles con el patron vigente del repositorio: `safeParse(...)` + `firstErrorMessage(...)` + `redirect` temprano.

## Cambios realizados

- Problema corregido:
  - `app/(shell)/production/fulfillment/[id]/page.tsx` validaba `FormData` manualmente en acciones sensibles de surtido directo.
- Archivo funcional ajustado:
  - `app/(shell)/production/fulfillment/[id]/page.tsx`
- Alineacion de patron de validacion:
  - `releaseDirectPick(...)` ahora usa `salesOrderPickListTransitionSchema`.
  - `confirmDirectPick(...)` ahora usa `salesOrderPickConfirmSchema` para cabecera (`orderId`, `operatorName`).
  - La validacion por tarea se mantiene local en el mismo archivo mediante schema privado (`taskId`, `pickedQty`, `shortReason`) y error contract con `firstErrorMessage(...)`.
- Cobertura de pruebas ampliada:
  - `tests/schemas.test.ts` agrega casos para schemas de ventas y usuarios relacionados.

## Validacion ejecutada

1. `npm run test:postgres -- tests/schemas.test.ts`
   - Resultado: PASS
2. `npm run typecheck`
   - Resultado: PASS

## Alcance excluido

- No se modifico logica de negocio en `lib/sales/request-service.ts`.
- No se modificaron definiciones en `lib/schemas/wms.ts`.
- No se cambiaron rutas ni flujo operativo fuera de validacion server-side.

## Riesgo residual y seguimiento recomendado

- Riesgo residual bajo: la correccion cubre el flujo puntual de surtido directo, pero puede existir brecha entre schemas declarados y cobertura operativa completa en otros flujos de ventas.
- Seguimiento recomendado:
  1. Cerrar la brecha restante entre schemas declarados y cobertura operativa completa en otros flujos de ventas donde aun haya parseo manual.
  2. Mantener vigilancia de OCC/idempotencia en `SalesInternalOrder`, `PickList` y `PickTask` durante cambios de confirmacion/liberacion.
