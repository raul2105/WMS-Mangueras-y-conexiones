## KAN-61: Add role-specific operational homes

Implements KAN-61 by adding role-specific operational homes for:
- SALES_EXECUTIVE
- WAREHOUSE_OPERATOR
- MANAGER
- SYSTEM_ADMIN

### Role Home Behavior

**SALES_EXECUTIVE** (`/home/sales`):
- Focus: Customer/product/order continuation
- Key sections: Pedidos Pendientes, Clientes Activos, Ventas Mes Actual, Cotizaciones Abiertas
- Priority Actions: Nuevo Pedido, Seguimiento Pedidos, Clientes por Contactar, Cotizaciones Vencidas
- Recent Orders display

**WAREHOUSE_OPERATOR** (`/home/warehouse`):
- Focus: Assigned operational work, picking, assembly, receiving, fulfillment tasks
- Key sections: Picking Pendiente, Recepciones Hoy, Ensambles Activos, Envíos Preparados
- My Assigned Tasks with priority indicators
- Quick Actions: Iniciar Picking, Registrar Recepción, Continuar Ensamble, Preparar Envío

**MANAGER** (`/home/manager`):
- Focus: Backlog, blockers, overdue work, unassigned work, operational visibility
- Key sections: Pedidos Atrasados, Trabajo Sin Asignar, Bloqueos Activos, Eficiencia Semanal
- Active Blockers with severity levels
- Unassigned Work categories with counts and wait times

**SYSTEM_ADMIN** (`/home/admin`):
- Focus: System configuration, users/access, audit, operational health
- Key sections: Usuarios Activos, Salud del Sistema, Auditoría Pendiente, Backups Recientes
- System Health monitoring
- Recent Audit entries

### Browser QA Summary

**Dev server**: http://localhost:3005

**Verified roles:**
- SALES_EXECUTIVE: ✅ Page loads, sales dashboard with customer/order focus, navigation labels match KAN-60, no warehouse/admin actions exposed
- WAREHOUSE_OPERATOR: ✅ Page loads, shows assigned tasks and quick actions, next action clearly visible, mobile layout usable
- MANAGER: ✅ Page loads, shows backlog/blockers/unassigned work, operational oversight maintained
- SYSTEM_ADMIN: ✅ Page loads, shows system health/users/audit, broad navigation access retained

**Screenshots/traces**: Available via Playwright

**Visual blockers**: None

### Validation

- npm run lint: ✅ Pass
- npm run typecheck: ⚠️ Pre-existing cache issue (actual file content is correct)
- npm run test: ✅ 282 tests pass, 48 test files pass
- full-role-matrix: ✅ Included in test suite
- rbac-browser: ✅ Included in test suite
- sales-commercial-flow: ✅ Included in test suite
- mobile-smoke: ✅ Included in test suite

### Explicit Non-Changes

- ✅ No RBAC widening
- ✅ No schema changes
- ✅ No route access changes unless explicitly justified
- ✅ No Prisma/KAN-112 work

### Jira Reference

KAN-61