# WMS Capabilities Status

Fecha de corte: 2026-04-30

## Base canónica

PostgreSQL es la base canónica para runtime web/AWS, pruebas integradas, migraciones y generación de Prisma Client.

- Schema canónico: `prisma/postgresql/schema.prisma`
- Migraciones canónicas: `prisma/postgresql/migrations`
- Config activa: `prisma.config.ts`
- `DATABASE_URL` debe iniciar con `postgres://` o `postgresql://`

SQLite queda restringido a compatibilidad de runtime portable/legado y no es fuente de verdad operativa para la app web.

## Implementado

- Administración de usuarios `SYSTEM_ADMIN` con RBAC y acciones protegidas.
  Evidencia: `app/(shell)/users/page.tsx`, `app/(shell)/users/new/page.tsx`, `app/(shell)/users/[id]/edit/page.tsx`, `lib/users/admin-service.ts`, `tests/users/admin-service.integration.test.ts`, `tests/rbac/route-access.integration.test.ts`, `tests/rbac/server-actions-guards.integration.test.ts`.
  Estado KAN-49: **Implemented + validation evidence** (incluye hash obligatorio, auditoría y bloqueo estricto para no dejar el sistema sin `SYSTEM_ADMIN` activo).
- Registro y uso de clientes en flujo comercial y de pedidos internos.
  Evidencia: `app/(shell)/sales/customers/page.tsx`, `app/(shell)/production/requests/new/page.tsx`, `lib/customers/customer-service.ts`, `tests/customers/postgresql-customer-order.integration.test.ts`, `tests/e2e/kan48-customer-quick-create.spec.ts`.
- Dashboard operativo de fulfillment para perfiles administrativos.
  Evidencia: `app/(shell)/page.tsx`, `lib/dashboard/fulfillment-dashboard.ts`, `components/dashboard/fulfillment-kpi-grid.tsx`, `components/dashboard/fulfillment-priority-queue.tsx`, `tests/dashboard/fulfillment-dashboard.integration.test.ts`, `tests/dashboard/fulfillment-signals.unit.test.ts`.
- Flujo de pedidos internos con asignación/toma/etapa y trazabilidad.
  Evidencia: `app/(shell)/production/requests/page.tsx`, `app/(shell)/production/requests/[id]/page.tsx`, `lib/sales/request-service.ts`, `lib/sales/internal-orders.ts`, `tests/sales-request-service.test.ts`, `tests/sales-internal-order-flow.test.ts`.
  Estado KAN-51: **Done (backend validated)** con validaciones de transiciones, timestamps y auditoría (`PULL_REQUEST`, `MARK_DELIVERED_TO_CUSTOMER`) en pruebas PostgreSQL.
- CI de calidad y contratos base.
  Evidencia: `.github/workflows/ci.yml`, `package.json` (scripts `prisma:validate`, `test:rbac:unit`, `test:customers:contracts`).

## Parcial

- KAN-52 (UX avanzada de flujo comercial): existen filtros por etapa/cola y timeline, pero faltan validaciones end-to-end visuales de ciclo completo.
  Evidencia: `app/(shell)/production/requests/page.tsx`, `app/(shell)/production/requests/[id]/page.tsx`.

## Pendiente

- E2E visual dedicado para ciclo completo de KAN-51 (`captura -> asignación/toma -> surtido/ensamble -> entrega`) con asserts de UI final y auditoría visible.
- E2E dedicado para CRUD completo de `/users` (alta/edición/reset/desactivación) en navegación real.

## Requiere validación manual

- Estado administrativo final en Jira de KAN-48, KAN-49, KAN-50 y KAN-51.
- Estado administrativo de PR #15 en GitHub/Jira (abierto, merged o cerrado sin merge).
- Verificación de comentarios de cierre Jira con SHA final y evidencia de checks.

## Jira/GitHub reconciliation status — April 30, 2026

- PR #16 aparece integrado en historial local (`Merge pull request #16 ...`, commit `7df38a9`).
- KAN-48 y KAN-51 tienen evidencia explícita en release notes y commits de cierre técnico.
  Evidencia: `docs/release/2026-04-30-kan48-kan51-closeout.md`, commits `16641ca`, `e745782`, `671c4fc`.
- KAN-49, KAN-50 y KAN-51 cuentan con evidencia técnica y pruebas PostgreSQL de regresión; su estado administrativo Jira debe validarse manualmente.
- PR #15 se menciona como frente de documentación/gobernanza y debe confirmarse manualmente fuera del repo.
  Evidencia: `docs/release/2026-04-30-kan29-close-kan12-cut1.md`.

## Comandos de referencia (operación diaria)

```bash
npm run prisma:validate
npm run prisma:generate
npm run typecheck
npm run test:postgres
npm run build
```

Para CI de PR, mínimo:

```bash
npm run lint
npm run test:rbac:unit
npm run test:customers:contracts
```
