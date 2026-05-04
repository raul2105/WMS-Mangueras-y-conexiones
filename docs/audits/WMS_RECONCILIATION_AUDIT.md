# WMS Reconciliation Audit

Fecha de auditoría: 2026-04-30  
Repositorio auditado: `raul2105/WMS-Mangueras-y-conexiones`  
Branch local: `main`  
Auditoría realizada: solo lectura (sin cambios de código)

## Resumen ejecutivo

Esta auditoría confirma que el repositorio contiene implementación funcional y cobertura de pruebas para KAN-48, KAN-49, KAN-50 y KAN-51; sin embargo, parte de la documentación operativa y de capacidades sigue reportando estados previos (pendiente/parcial), lo que crea desalineación con el estado real en código.

Evidencias principales:
- Merge de PR #16 ya integrado en `main`: commit `7df38a9`.
- Commits funcionales recientes:
  - `16641ca` (`feat(KAN-48): quick-create inline de clientes en nuevo pedido`)
  - `e745782` (`feat(KAN-51): endurece flujo operativo, auditoria y validacion postgres`)
  - `671c4fc` (`docs(KAN-48,KAN-51): evidencia de cierre sincronico local-github-aws-jira`)
- Artefactos de reconciliación/documentación:
  - `docs/release/2026-04-30-kan48-kan51-closeout.md`
  - `docs/release/2026-04-30-kan29-close-kan12-cut1.md`
  - `docs/release/2026-04-28-sync-repo-atlassian.md`

Riesgo principal actual:
- Desalineación documental Jira/GitHub vs código (especialmente en `docs/WMS_CAPABILITIES_STATUS.md` y documentación histórica que aún describe SQLite como flujo principal en contextos que ya migraron a PostgreSQL canónico).

---

## Arquitectura y estado técnico observado

### Framework y stack
- Next.js App Router + React + TypeScript:
  - `package.json`
  - `app/`
- Auth:
  - NextAuth route: `app/api/auth/[...nextauth]/route.ts`
  - Config: `auth.config.ts`
- ORM y DB:
  - Prisma 6.x (`@prisma/client`, `prisma`)
  - Canonical schema PostgreSQL: `prisma/postgresql/schema.prisma`
  - Prisma config canónica: `prisma.config.ts` (apunta a `prisma/postgresql/schema.prisma`)

### Scripts y comandos de calidad/pruebas
- Comandos principales:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `npm run prisma:validate`
  - `npm run test:postgres`
  - `npm run test:rbac:*`
  - `npm run test:customers:*`
  - `npm run e2e`
- CI:
  - `.github/workflows/ci.yml`
  - Jobs: `quality`, `security`, `smoke-published`
  - Checks ejecutados en CI para quality: lint, tsc, build, prisma validate, tests RBAC unit + customers contracts

### Estructura frontend/backend (alto nivel)
- Frontend App Router:
  - Dashboard: `app/(shell)/page.tsx`
  - Usuarios: `app/(shell)/users/*`
  - Clientes: `app/(shell)/sales/customers/*`
  - Pedidos internos/surtido: `app/(shell)/production/requests/*`
- Backend/domain services:
  - Pedidos: `lib/sales/request-service.ts`, `lib/sales/internal-orders.ts`
  - Usuarios: `lib/users/admin-service.ts`
  - Dashboard fulfillment: `lib/dashboard/fulfillment-dashboard.ts`
  - RBAC: `lib/rbac/*`
- API routes:
  - `app/api/*` (health, auth, products, customers, export, labels)

### Auth/RBAC
- Permisos y roles:
  - `lib/rbac/permissions.ts`
  - `lib/rbac/role-permissions.ts`
  - `lib/rbac/route-access-map.ts`
- Protección de rutas/acciones:
  - `components/rbac/PageGuard.tsx`
  - Guards en páginas de `/users` y acciones server-side (`requirePermission("users.manage")`)
- Evidencia de restricción SYSTEM_ADMIN en administración de usuarios:
  - `lib/rbac/route-access-map.ts` (rutas `/users*`)
  - `tests/rbac/route-access.integration.test.ts`
  - `tests/rbac/server-actions-guards.integration.test.ts`

---

## Matriz por issue (KAN-48 a KAN-51)

| Issue | Estado en código | Estado esperado en Jira | Evidencia encontrada | Riesgo | Acción recomendada |
|---|---|---|---|---|---|
| KAN-48 (customers/clientes) | Implementado | Validar que Jira esté en `Hecho/Finalizada` con evidencia | `lib/sales/request-service.ts` (`requireFormalCustomer`, validación `CUSTOMER_ID_REQUIRED`), `app/(shell)/production/requests/new/page.tsx`, `tests/customers/*`, `tests/e2e/kan48-customer-quick-create.spec.ts`, commit `16641ca`, `docs/release/2026-04-30-kan48-kan51-closeout.md` | Medio (documentación interna aún lo marca pendiente en algunos archivos) | Actualizar artefactos de estado para que KAN-48 no aparezca como pendiente donde ya no aplica |
| KAN-49 (administración usuarios) | Implementado | Jira debería reflejar implementado o al menos listo para cierre técnico | `app/(shell)/users/page.tsx`, `app/(shell)/users/new/page.tsx`, `app/(shell)/users/[id]/page.tsx`, `app/(shell)/users/[id]/edit/page.tsx`, `lib/users/admin-service.ts`, `tests/rbac/*` | Medio (riesgo de sub-reportar avance en Jira/docs) | Reconciliar Jira y `docs/WMS_CAPABILITIES_STATUS.md` con evidencia de UI+RBAC+servicio |
| KAN-50 (dashboard operativo) | Implementado | Jira debería reflejar implementado o en validación final | `app/(shell)/page.tsx`, `lib/dashboard/fulfillment-dashboard.ts`, `components/dashboard/*` | Medio (puede seguir listado como pendiente por documentación antigua) | Actualizar estado funcional en Jira y notas de capacidades |
| KAN-51 (asignación/toma/flujo pedidos internos) | Implementado | Validar que Jira esté en `Hecho/Finalizada` y con evidencia de flujo | `lib/sales/request-service.ts`, `lib/sales/internal-orders.ts` (flow stage), `app/(shell)/production/requests/page.tsx` (filtros etapa/cola), `app/(shell)/production/requests/[id]/page.tsx` (timeline/auditoría), `tests/sales-internal-order-flow.test.ts`, commit `e745782`, `docs/release/2026-04-30-kan48-kan51-closeout.md` | Bajo-Medio (principalmente documental) | Consolidar evidencia única de cierre y limpiar referencias que aún lo dejan parcial |

---

## PR #15 / PR #16 (evidencia encontrada)

### PR #16
- Integrado en `main`:
  - commit merge: `7df38a9` (`Merge pull request #16 from raul2105/feature/KAN-local-normalizacion-20260429`)
- Evidencia en historial local (`git log --oneline`).

### PR #15 (documentación/gobierno Jira-GitHub)
- No hay merge explícito identificado en el log corto mostrado.
- Sí hay referencias documentales de seguimiento:
  - `docs/release/2026-04-30-kan29-close-kan12-cut1.md` menciona adjuntar evidencia en Jira issue #14 y PR #15.
- Requiere validación manual en GitHub/Jira para confirmar estado final administrativo.

---

## Archivos obsoletos o inconsistentes detectados

### Inconsistencia de estado funcional (tickets)
- `docs/WMS_CAPABILITIES_STATUS.md`
  - Sigue listando KAN-48/KAN-49/KAN-50 como prioridad abierta, mientras hay evidencia de implementación en código para 48/49/50.
  - También marca KAN-51 como “falta validar flujo UI/permisos/auditoría”, ya cubierto por cambios recientes y pruebas.

### Inconsistencia PostgreSQL canónico vs narrativa legacy
- `docs/IMPLEMENTATION_SUMMARY.md`
  - Describe estrategia antigua “SQLite dev → PostgreSQL prod-ready” y ausencia de tests, desalineado con el estado actual.
- `docs/ADR/001-arquitectura-base.md` y `docs/ADR/002-mobile-aws-hibrido.md`
  - Mantienen narrativa histórica de SQLite en desarrollo que puede inducir error si se toma como guía actual.
- `docs/reference/database-setup.md`
  - Incluye modo SQLite de compatibilidad; correcto como legado, pero requiere etiquetado más explícito para evitar uso operativo por defecto.

### Artefactos legacy/dualidad DB que requieren control explícito
- `prisma/schema.prisma` (provider sqlite) coexistiendo con `prisma/postgresql/schema.prisma` (canónico).
- `prisma/migrations/migration_lock.toml` (sqlite) y árbol `prisma/migrations/*` legacy.
- `app/generated/prisma/internal/class.ts` refleja client SQLite generado en artefactos locales.
- Scripts con referencias SQLite en flujos legacy/release:
  - `scripts/release/*`
  - `scripts/data/import-products-from-csv.cjs` (mensaje “SQLite by default”)

Nota: varios de estos archivos son legítimos para compatibilidad portable/legacy, pero hoy generan ambigüedad documental y operativa.

---

## Lista de pruebas existentes (evidencia en repo)

### Unit/Integration (Vitest)
- RBAC:
  - `tests/rbac/permissions.test.ts`
  - `tests/rbac/require-permission.test.ts`
  - `tests/rbac/route-access.integration.test.ts`
  - `tests/rbac/server-actions-guards.integration.test.ts`
  - `tests/rbac/fixtures.integration.test.ts`
- Customers/KAN-48:
  - `tests/customers/customer-service.test.ts`
  - `tests/customers/customer-search-api.contract.test.ts`
  - `tests/customers/customer-quick-create-api.contract.test.ts`
  - `tests/customers/customer-quick-create-api.runtime.test.ts`
  - `tests/customers/request-new-customer-ui.contract.test.ts`
  - `tests/customers/request-new-customer-page.runtime.test.ts`
  - `tests/customers/postgresql-schema.contract.test.ts`
  - `tests/customers/postgresql-customer-order.integration.test.ts`
  - `tests/customers/sales-requests-customer-fallback.contract.test.ts`
- Flujo pedidos/KAN-51:
  - `tests/sales-request-service.test.ts`
  - `tests/sales-internal-order-flow.test.ts`
- Otros:
  - `tests/inventory-integrity.test.ts`
  - `tests/product-search.test.ts`
  - `tests/schemas.test.ts`
  - `tests/mobile/*`

### E2E (Playwright)
- `tests/e2e/kan48-customer-quick-create.spec.ts`
- `tests/e2e/rbac-browser.spec.ts`
- `tests/e2e/wms-smoke.spec.ts`
- `tests/e2e/theme-light-mode.spec.ts`
- `tests/e2e/assembly-search.spec.ts`

### CI actual (subset ejecutado)
- `.github/workflows/ci.yml` ejecuta:
  - lint
  - typecheck
  - build
  - prisma validate
  - `test:rbac:unit`
  - `test:customers:contracts`

---

## Lista de pruebas faltantes / brechas detectadas

1. KAN-49:
- Falta evidencia clara de E2E dedicado para CRUD completo de `/users` (alta, edición, reset password, desactivación y restricciones de self-protection).

2. KAN-50:
- Falta suite de contrato/servicio específica para `lib/dashboard/fulfillment-dashboard.ts` (KPIs, ranking, señales de riesgo, filtros).

3. KAN-51:
- Falta cobertura E2E robusta del ciclo completo “captura → asignación/toma → surtido/ensamble → entrega” con asserts de auditoría visible en detalle.

4. CI:
- CI no ejecuta todo `test:postgres` ni E2E; solo subset contractual/RBAC unit.
- Recomendable un job adicional (nightly o protected branch) para regresión ampliada.

---

## Recomendación de siguientes PRs

1. `docs/KAN-reconciliation-48-51`
- Objetivo: alinear `docs/WMS_CAPABILITIES_STATUS.md` y documentos de estado con evidencia real de implementación KAN-48..51.
- Resultado esperado: eliminar contradicciones internas y clarificar qué queda pendiente real.

2. `test/KAN49-KAN50-KAN51-e2e-hardening`
- Objetivo: cerrar brechas de pruebas E2E/integración en usuarios, dashboard y flujo end-to-end de pedidos.
- Resultado esperado: mayor confianza para cierres Jira con evidencia reproducible.

3. `chore/postgres-canonical-doc-hardening`
- Objetivo: normalizar narrativa PostgreSQL canónica y etiquetar explícitamente contenidos legacy SQLite (solo portable/offline).
- Resultado esperado: menor riesgo operativo por ejecución de comandos equivocados.

4. `ci/expanded-regression-profile`
- Objetivo: añadir perfil de CI ampliado (al menos en nightly o manual gate) con `test:postgres` completo y smoke E2E crítico.
- Resultado esperado: detección temprana de regresiones cross-módulo.

---

## Validaciones manuales requeridas en Jira/GitHub (fuera del repo)

1. Confirmar estado real en Jira para:
- KAN-48
- KAN-49
- KAN-50
- KAN-51

2. Verificar si PR #15 está:
- abierto
- merged
- cerrado sin merge
y reflejarlo en el comentario de reconciliación.

3. Corroborar que comentarios/evidencias en Jira correspondan al SHA final y checks relevantes.

---

## Estado del working tree durante la auditoría

Se detectó workspace no limpio:
- Modificados:
  - `docs/WMS_CAPABILITIES_STATUS.md`
  - `infra/cdk/config/dev.json`
  - `infra/cdk/lib/wms-web-stack.js`
  - `tests/inventory-integrity.test.ts`
- No trackeados:
  - `docs/release/2026-04-30-kan29-close-kan12-cut1.md`
  - `docs/runbooks/AWS_DEV_SCHEDULE_CONTROL.md`

Este estado no invalida la auditoría documental, pero sí exige cuidado antes de cualquier PR de reconciliación.
