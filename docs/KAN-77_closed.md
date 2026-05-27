# KAN-77 - Cierre tecnico-operativo reconciliado

Fecha de cierre tecnico: 2026-05-27
Fuente de verdad tecnica: `origin/main`

## Veredicto

`KAN-77` queda cerrable tecnicamente con paridad completa entre alcance, implementacion en codigo, pruebas y evidencia ejecutable real sobre PostgreSQL AWS.

## Evidencia en codigo

- Servicio de dominio para orden generica:
  - `lib/production/generic-order-service.ts`
  - Operaciones: `addGenericOrderItem`, `updateGenericOrderItemQty`, `removeGenericOrderItem`, `transitionGenericOrderStatus`.
- Semantica operativa implementada:
  - Reserva al activar `BORRADOR -> ABIERTA/EN_PROCESO`.
  - Ajuste por delta al editar cantidades.
  - Liberacion de reserva en eliminacion de linea.
  - Liberacion de reserva en cancelacion.
  - `COMPLETADA`: liberacion + consumo (`OUT`) + reconciliacion scoped por `productId/locationId`.
  - Auditoria por operacion.
- Wiring UI/acciones para `GENERIC`:
  - `app/(shell)/production/orders/[id]/page.tsx`
  - `app/(shell)/production/orders/new/generic/page.tsx`
- Guardrail tecnico aplicado:
  - Eliminado `lib/inventory-service.js` legacy para evitar resolucion de modulo no canonica y riesgo transaccional.

## Evidencia de pruebas

- Suite especifica KAN-77:
  - `npm run test:postgres -- tests/generic-order-service.test.ts --maxWorkers=1`
  - Resultado: OK (1 archivo, 6 tests).
- Gate de regresion PostgreSQL:
  - `npm run test:regression:postgres`
  - Resultado: OK (25 archivos, 113 tests).
- Build:
  - `npm run build`
  - Resultado: OK.

## Evidencia de entorno PostgreSQL AWS

- `npm run env:postgres:check` -> OK
- `npm run env:postgres:tcp` -> OK
- `npm run prisma:validate` -> OK
- `npm run prisma:generate` -> OK
- `npm run db:push` -> OK

## Conclusion operativa

Se corrige la brecha previa entre estado documental y estado tecnico real. Con la integracion en `main` y la corrida completa en AWS PostgreSQL, `KAN-77` deja de ser cierre administrativo y pasa a cierre tecnico defendible.
