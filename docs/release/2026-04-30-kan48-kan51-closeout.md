# Cierre funcional KAN-48 + KAN-51

Fecha: 2026-04-30  
Proyecto Jira: KAN  
Repositorio: raul2105/WMS-Mangueras-y-conexiones

## Baseline y criterio

- Baseline técnico: `main` con merge de PR #16 ya integrado.
- Base canónica: PostgreSQL.
- Alcance del corte: código + pruebas + evidencia para Jira/GitHub.

## Matriz de gap (implementado vs pendiente)

| Frente | Estado previo en `main` | Cierre aplicado en este corte |
|---|---|---|
| KAN-48 cliente formal en pedido | Ya existía vínculo `customerId` + snapshot `customerName` y fallback para usuarios sin acceso a catálogo | Se endurece regla de negocio para forzar cliente formal cuando el flujo exige catálogo (`requireFormalCustomer`) |
| KAN-48 trazabilidad de cliente | Auditoría base al crear pedido | Se mantiene consistencia y se refuerza validación para evitar pedidos huérfanos en canal formal |
| KAN-51 asignación/pull | Ya existían reglas de toma y visibilidad por rol | Se conserva lógica y se expone mejor estado operativo con etapa de flujo |
| KAN-51 entrega cliente | Ya existía bloqueo por prerequisitos de surtido/ensamble | Se mantiene y se refuerza evidencia visual en timeline + auditoría reciente |
| KAN-51 segmentación UX | Existía filtro por estado y cola operativa | Se agrega segmentación explícita por etapa (`captura`, `por_asignar`, `en_surtido`, `listo_entrega`, `entregado`, `cancelado`) |
| KAN-51 auditoría visible | Auditoría persistida pero no visible en detalle | Se agrega sección de auditoría reciente en el detalle del pedido |

## Cambios aplicados

- Dominio de flujo comercial:
  - `lib/sales/internal-orders.ts`
  - Se agrega `SalesOrderFlowStage`, etiquetas y `getSalesOrderFlowStage(...)`.
- Regla formal de cliente:
  - `lib/sales/request-service.ts`
  - `createSalesRequestDraftHeader(...)` incorpora `requireFormalCustomer`.
  - Error explícito `CUSTOMER_ID_REQUIRED` cuando aplica catálogo y no se selecciona cliente formal.
- UI de pedidos de surtido:
  - `app/(shell)/production/requests/page.tsx`
  - Se agrega filtro por etapa de flujo y visualización de etapa por pedido.
  - `app/(shell)/production/requests/[id]/page.tsx`
  - Se agrega timeline operativo y auditoría reciente del pedido.
- Auditoría de transiciones:
  - `lib/sales/request-service.ts`
  - `CONFIRM_REQUEST` y `CANCEL_REQUEST` guardan `actorUserId`.

## Evidencia de pruebas del corte

Comandos objetivo:

1. `npm run prisma:validate`
2. `npm run prisma:generate`
3. `npm run typecheck`
4. `node scripts/db/run-vitest-postgres.cjs run`
5. `npm run build`

Pruebas agregadas/actualizadas:

- `tests/sales-internal-order-flow.test.ts`
- `tests/customers/postgresql-customer-order.integration.test.ts` (caso `requireFormalCustomer`)

## Criterio de Done por ticket

- **KAN-48**
  - Pedido formal exige `customerId` válido cuando el canal usa catálogo.
  - Snapshot comercial consistente.
  - Evidencia de regresión en pruebas.

- **KAN-51**
  - Asignación/pull/entrega se mantienen con validaciones de estado y rol.
  - Segmentación UX por etapa de flujo disponible en listado.
  - Timeline + auditoría visible en detalle para trazabilidad operativa.

## Evidencia DATABASE_URL (RDS DEV) y gates pendientes

Fecha de ejecución: 2026-04-30 (America/Mexico_City)

1. Gate A - entorno/conectividad
   - Comando: `node scripts/db/assert-postgres-env.cjs --check-connection`
   - Resultado: PASS (`[assert-postgres-env] conectividad OK`)
   - Hora: 13:55

2. Gate B - funcional KAN-51
   - Comando: `npm run test:sales:service`
   - Resultado: PASS (10/10 tests en `tests/sales-request-service.test.ts`)
   - Hora: 13:56-13:58
   - Nota técnica: se corrigió limpieza previa en test para Postgres eliminando primero tablas heredadas `SalesInternalOrderDeliveryLine` y `SalesInternalOrderDelivery` para evitar FK residual.

3. Gate C - integridad customers en Postgres
   - Comando: `npm run test:customers:postgres`
   - Resultado: PASS (4/4 tests)
   - Hora: 13:55

4. Gate C complemento - contratos/rbac no regresión
   - Comando: `npm run test:customers:contracts`
   - Resultado: PASS (9/9 tests)
   - Hora: 13:55
   - Comando: `npm run test:rbac:integration`
   - Resultado: PASS (23/23 tests)
   - Hora: 13:55-13:56

Estado de cierre técnico por pruebas dependientes de `DATABASE_URL`: COMPLETO (A+B+C en verde).

## Sincronía GitHub (main)

- Commit KAN-48: `16641ca` (`feat(KAN-48): quick-create inline de clientes en nuevo pedido`)
- Commit KAN-51: `e745782` (`feat(KAN-51): endurece flujo operativo, auditoria y validacion postgres`)
- Push ejecutado a `origin/main`: `7df38a9..e745782`
- Paridad final local/remoto: `git rev-list --left-right --count origin/main...HEAD` = `0 0`
- PRs abiertos no funcionales para este cierre: solo `#15` (documentación KAN-8)

## Sincronía AWS DEV (deploy + verificación)

- Identidad validada previo deploy:
  - Account: `904891391424`
  - ARN: `arn:aws:iam::904891391424:user/Raul_ITsupport`
  - Región: `us-east-1`
- Deploy ejecutado con ruta oficial:
  - `scripts/deploy/aws-web.ps1 -Profile Raul_ITsupport -Region us-east-1 -SkipMigrate`
- Resultado CloudFormation:
  - Stack: `WmsWebDevStack`
  - Estado: `UPDATE_COMPLETE`
  - LastUpdated: `2026-04-30T20:18:32.956Z`
- URL validada:
  - `https://d2b1ltxtvypxr4.cloudfront.net`
  - Health check `GET /api/health` = `200` con `{"ok":true,"db":"up"}`

## Sincronía Jira (KAN-48 / KAN-51)

- KAN-48:
  - Comentario de evidencia agregado (`commentId: 10188`)
  - Estado transicionado a `Finalizada` (`statusCategory: done`)
- KAN-51:
  - Comentario de evidencia agregado (`commentId: 10189`)
  - Estado transicionado a `Finalizada` (`statusCategory: done`)

Estado final de sincronía: **Local + GitHub + AWS DEV + Jira alineados para cierre de KAN-48 y KAN-51**.
