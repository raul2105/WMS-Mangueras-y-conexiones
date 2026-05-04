# WMS KAN-48..51 Reconciliation Evidence

Fecha de corte: 2026-04-30
Repositorio: `raul2105/WMS-Mangueras-y-conexiones`
Base canónica: `prisma/postgresql/schema.prisma`

Nota de método:
- Este documento NO actualiza Jira.
- La evidencia se basa en inspección de código y tests existentes en el repo.
- Sí se incluyen resultados ejecutados en esta sesión cuando aplica (sin inferir resultados no ejecutados).

---

## Ticket
KAN-48 (Customers / clientes)

## Estado recomendado
Validate manually

## Evidencia de implementación
- UI principal de clientes:
  - `app/(shell)/sales/customers/page.tsx`
  - `app/(shell)/sales/customers/new/page.tsx`
  - `app/(shell)/sales/customers/[id]/page.tsx`
  - `app/(shell)/sales/customers/[id]/edit/page.tsx`
- Integración en captura de pedidos:
  - `app/(shell)/production/requests/new/page.tsx` (uso de catálogo y fallback según permisos)
- Backend/API:
  - `lib/customers/customer-service.ts`
  - `app/api/customers/route.ts`
  - `app/api/customers/search/route.ts`
  - `lib/sales/request-service.ts` (`requireFormalCustomer`)
- Prisma:
  - `model Customer` en `prisma/postgresql/schema.prisma`
  - relación en `model SalesInternalOrder` (`customerId`, `customerName`)
- RBAC:
  - permisos `customers.view` / `customers.manage` en `lib/rbac/permissions.ts` y `lib/rbac/role-permissions.ts`
  - guardas de ruta/acción en páginas y APIs (ver tests RBAC)
- Audit logs:
  - `lib/customers/customer-service.ts` (audit trail en create/update)
  - `lib/audit-log.ts`

## Evidencia de pruebas
- Contratos/UI/API customers:
  - `tests/customers/customer-service.test.ts`
  - `tests/customers/customer-search-api.contract.test.ts`
  - `tests/customers/customer-quick-create-api.contract.test.ts`
  - `tests/customers/customer-quick-create-api.runtime.test.ts`
  - `tests/customers/request-new-customer-ui.contract.test.ts`
  - `tests/customers/request-new-customer-page.runtime.test.ts`
  - `tests/customers/postgresql-customer-order.integration.test.ts`
  - `tests/customers/sales-requests-customer-fallback.contract.test.ts`
- E2E:
  - `tests/e2e/kan48-customer-quick-create.spec.ts`

## Brechas
- Existe cobertura relevante, pero la validación administrativa de cierre Jira requiere confirmar evidencia final de QA en entorno objetivo.
- Estado: implemented, not fully validated (cierre administrativo pendiente de verificación manual).

## Comentario listo para Jira
Implementación de KAN-48 verificada en código: catálogo de clientes (`/sales/customers`), creación/edición y uso en captura de pedidos internos (`/production/requests/new`) con control RBAC (`customers.view/customers.manage`).
Evidencia principal: `app/(shell)/sales/customers/*`, `lib/customers/customer-service.ts`, `app/api/customers/*.ts`, `lib/sales/request-service.ts` (`requireFormalCustomer`), `prisma/postgresql/schema.prisma` (`Customer`, relación en `SalesInternalOrder`).
Pruebas en repo: `tests/customers/*` + `tests/e2e/kan48-customer-quick-create.spec.ts`.
Recomendación de estado: **Validate manually** (implemented, not fully validated) hasta confirmar evidencia de validación final en Jira.

## Criterios de cierre
- Evidencia de código enlazada en Jira (archivos/rutas clave).
- Evidencia de pruebas asociada al ticket (contratos/integración/e2e según alcance).
- Confirmación manual de QA/operación y documentación consistente.

---

## Ticket
KAN-49 (User admin / usuarios)

## Estado recomendado
Done (Implemented + validation evidence)

## Evidencia de implementación
- UI de administración de usuarios:
  - `app/(shell)/users/page.tsx`
  - `app/(shell)/users/new/page.tsx`
  - `app/(shell)/users/[id]/page.tsx`
  - `app/(shell)/users/[id]/edit/page.tsx`
- Backend:
  - `lib/users/admin-service.ts` (list, create, update, reset password)
- Prisma:
  - `model User`, `Role`, `Permission`, `UserRole`, `RolePermission` en `prisma/postgresql/schema.prisma`
- RBAC:
  - `users.manage` en `lib/rbac/permissions.ts`
  - restricción SYSTEM_ADMIN en `lib/rbac/role-permissions.ts` + `lib/rbac/route-access-map.ts`
- Audit logs:
  - eventos en `lib/users/admin-service.ts` (CREATE, UPDATE, RESET_PASSWORD)
  - persistencia por `lib/audit-log.ts`
  - control estricto para no dejar el sistema sin `SYSTEM_ADMIN` activo (`lib/users/admin-service.ts`)

## Evidencia de pruebas
- RBAC y guardas de rutas/acciones:
  - `tests/rbac/route-access.integration.test.ts`
  - `tests/rbac/server-actions-guards.integration.test.ts`
  - `tests/rbac/permissions.test.ts`
  - `tests/rbac/require-permission.test.ts`
- Integración de seguridad del módulo:
  - `tests/users/admin-service.integration.test.ts` (hashing, auditoría, bloqueo de último `SYSTEM_ADMIN`)
- E2E de acceso por rol:
  - `tests/e2e/rbac-browser.spec.ts`

## Brechas
- No se identifica suite E2E dedicada al CRUD completo de `/users` (alta/edición/reset con asserts funcionales completos).
- Esta brecha queda como hardening recomendado, sin bloquear el cierre técnico de KAN-49.

## Comentario listo para Jira
KAN-49 implementado y validado técnicamente: UI `/users*`, servicio `lib/users/admin-service.ts`, RBAC `users.manage` restringido a `SYSTEM_ADMIN`, hashing obligatorio en create/reset y auditoría `CREATE/UPDATE/RESET_PASSWORD`.
Se agregó validación estricta para impedir que cualquier operación deje el sistema sin `SYSTEM_ADMIN` activo.
Evidencia: `app/(shell)/users/*`, `lib/users/admin-service.ts`, `lib/rbac/*`, `tests/users/admin-service.integration.test.ts`, `tests/rbac/*`, `prisma/postgresql/schema.prisma`.
Estado recomendado: **Done (Implemented + validation evidence)**. Validación administrativa en Jira/GitHub: pendiente manual.

## Criterios de cierre
- Evidencia de código y permisos publicada en Jira.
- Evidencia de pruebas RBAC + integración de seguridad adjunta.
- Validación administrativa final del ticket en Jira.

---

## Ticket
KAN-50 (Fulfillment dashboard)

## Estado recomendado
Validate manually

## Evidencia de implementación
- UI dashboard:
  - `app/(shell)/page.tsx`
  - `components/dashboard/fulfillment-kpi-grid.tsx`
  - `components/dashboard/fulfillment-priority-queue.tsx`
  - `components/dashboard/fulfillment-alert-list.tsx`
  - `components/dashboard/fulfillment-analytics-panels.tsx`
- Servicio backend/dashboard snapshot:
  - `lib/dashboard/fulfillment-dashboard.ts`
- Datos operativos consultados:
  - `SalesInternalOrder`, `SalesInternalOrderPickList`, `ProductionOrder` (consultas en servicio)
- RBAC/ruteo:
  - home por rol (`ROLE_HOME`) y acceso por rol en `lib/rbac/route-access-map.ts`

## Evidencia de pruebas
- Suite dedicada de dashboard:
  - `tests/dashboard/fulfillment-dashboard.integration.test.ts`
  - `tests/dashboard/fulfillment-signals.unit.test.ts`
- Resultado en esta sesión:
  - `npm run test:regression:postgres` ejecutado con éxito (incluye pruebas de dashboard en PostgreSQL).

## Brechas
- Persiste brecha de validación E2E visual de tablero en operación real (no bloquea validación técnica de servicio).
- Estado: implemented + validated in backend/integration; validación operativa manual pendiente.

## Comentario listo para Jira
KAN-50 implementado con validación técnica de servicio dashboard.
Evidencia: `app/(shell)/page.tsx`, `components/dashboard/*`, `lib/dashboard/fulfillment-dashboard.ts`, `tests/dashboard/fulfillment-dashboard.integration.test.ts`, `tests/dashboard/fulfillment-signals.unit.test.ts`.
Resultado en sesión: `npm run test:regression:postgres` en verde incluyendo suites de dashboard.
Recomendación de estado: **Validate manually** para cierre administrativo y validación visual operativa final.

## Criterios de cierre
- Confirmar alcance funcional aceptado por negocio en Jira.
- Crear/ejecutar cobertura de pruebas específica para dashboard.
- Actualizar ticket con evidencia de validación funcional y técnica.

---

## Ticket
KAN-51 (Internal order assignment / pull / delivery flow)

## Estado recomendado
Done

## Evidencia de implementación
- UI de flujo comercial/operativo:
  - `app/(shell)/production/requests/page.tsx`
  - `app/(shell)/production/requests/[id]/page.tsx`
  - `app/(shell)/production/fulfillment/[id]/page.tsx`
- Backend/dominio:
  - `lib/sales/request-service.ts`
  - `lib/sales/internal-orders.ts` (flow stage)
  - Regla crítica agregada: `markSalesRequestDelivered` bloquea entrega sin toma/asignación (`assignedToUserId` + `pulledAt`).
  - Regla crítica en pull: `pullSalesRequestOrder` exige usuario asignado activo con rol `SALES_EXECUTIVE`.
- Prisma:
  - `SalesInternalOrder.assignedToUserId`
  - `SalesInternalOrder.pulledAt`
  - `SalesInternalOrder.deliveredToCustomerAt`
  - `SalesInternalOrder.deliveredByUserId`
  - migración: `prisma/postgresql/migrations/20260417130000_add_sales_request_assignment_delivery/migration.sql`
- RBAC:
  - reglas de acceso comercial/producción en `lib/rbac/*`
  - elegibilidad de toma/pull aplicada en flujo de requests
- Audit logs:
  - eventos de transición registrados vía `lib/audit-log.ts`
  - exposición de auditoría reciente en detalle de request (`requests/[id]`)

## Evidencia de pruebas
- Lógica de flujo/acciones:
  - `tests/sales-request-service.test.ts` (incluye casos de no autorizado, doble asignación, ya tomado, entrega sin toma previa, timestamps y asserts de `PULL_REQUEST`/`MARK_DELIVERED_TO_CUSTOMER`)
  - `tests/sales-internal-order-flow.test.ts` (etapas de flujo)
- Resultado en esta sesión:
  - `npm run test:postgres -- tests/sales-request-service.test.ts tests/sales-internal-order-flow.test.ts` en verde.
  - `npm run test:regression:postgres` en verde (incluye suites KAN-51 sobre PostgreSQL real).
- Cobertura E2E de ciclo completo:
  - parcial/indirecta; no se identifica suite E2E única que cubra end-to-end completo captura→asignación→pull→entrega con asserts de auditoría final.

## Brechas
- Falta E2E robusto de ciclo completo con asserts operativos y de auditoría de extremo a extremo.
- Esta brecha queda como hardening UX/operativo y no bloquea cierre técnico backend.

## Comentario listo para Jira
KAN-51 validado técnicamente en backend para asignación/toma/entrega de pedidos internos, con reglas de transición y auditoría sobre `SalesInternalOrder`.
Evidencia UI: `/production/requests`, `/production/requests/[id]`, `/production/fulfillment/[id]`.
Evidencia Prisma: migración `20260417130000_add_sales_request_assignment_delivery`.
Evidencia de pruebas: `tests/sales-request-service.test.ts` y `tests/sales-internal-order-flow.test.ts` (incluye auditoría de `PULL_REQUEST` y `MARK_DELIVERED_TO_CUSTOMER`) + `npm run test:regression:postgres` en verde.
Recomendación de estado: **Done** (cierre técnico). Validación manual pendiente solo para cierre administrativo Jira y validación visual operativa.

## Criterios de cierre
- Evidencia técnica ligada al ticket (UI + backend + Prisma + audit).
- Evidencia de pruebas de flujo y auditoría documentada.
- Validación manual final del ciclo operativo completo en Jira.

---

## Contradicciones detectadas (código vs documentación)

- Históricamente hubo contradicción donde KAN-49/KAN-50/KAN-51 aparecían como pendientes/parciales en documentación previa, pese a evidencia de implementación en código.
- Referencia concreta de reconciliación y ajuste:
  - `docs/WMS_CAPABILITIES_STATUS.md` (versión actualizada)
  - `docs/audits/WMS_RECONCILIATION_AUDIT.md` (evidencia de contradicción histórica y normalización)

Recomendación: usar este documento como evidencia técnica para decisión de estado en Jira, sin sustituir la validación administrativa final.
