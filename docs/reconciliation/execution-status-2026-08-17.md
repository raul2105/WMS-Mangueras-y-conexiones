# Estado de ejecución y reconciliación — 2026-08-17

## Línea base

- `origin/main`: `16513e5c94d0758d9812a60451a07fd764e1308e`.
- Rama de ejecución local: `codex/execute-wms-pending-gates`.
- Commit de correcciones WMS: `7692326`.
- PR #104 fue integrado localmente en la rama de ejecución; `main` y Jira no fueron modificados.
- Archivos de trabajo no rastreados preexistentes fueron preservados.

## Cambios ejecutados

### Auditoría obligatoria

- Las mutaciones críticas ya no silencian fallas de `AuditLog`.
- Se conservaron nombres legacy por compatibilidad, pero ahora propagan el error.
- La aprobación de fuentes técnicas registra su auditoría dentro de la misma transacción.
- Alta de OC, alta de proveedor y alta de orden de producción registran auditoría dentro de la transacción de creación.

### Compatibilidad técnica

- Las reglas activas solo se consultan si tienen una fuente técnica `APPROVED`.
- La configuración de ensamble conserva estado de compatibilidad, aprobación explícita y reglas aplicadas.
- Se agregó cobertura para fuente técnica aprobada y rechazo de fallas de auditoría.

### Compras y reabasto

- PR #104 quedó integrado localmente: riesgo, prioridad, fecha compromiso y siguiente acción son visibles en la cola de compras.
- Se agregó política min–max por producto y almacén.
- Se agregó generación persistente de propuestas considerando inventario disponible, entradas confirmadas/en tránsito, consumo, lead time, MOQ y unidad de compra.
- Se agregó endpoint protegido por `purchasing.manage` para generar propuestas.
- Cada propuesta accionable o bloqueada queda auditada.
- El dashboard de compras muestra propuestas activas con producto, almacén, disponible, cantidad sugerida y motivo.
- Se completó la aprobación transaccional de propuestas accionables: una propuesta se reclama como `APPROVING`, se convierte en una OC `BORRADOR` y queda vinculada como `CONVERTED`; los reintentos no duplican la OC.
- La tarjeta de propuesta ahora expone `Aprobar y crear OC`; las propuestas `BLOCKED` permanecen visibles sin CTA de aprobación.

## Validación ejecutada

- `npm run prisma:validate`: verde.
- `npm run lint`: verde.
- `npm run typecheck`: verde.
- `npm run test:unit`: 46 archivos, 144 pruebas, verde.
- `git diff --check`: verde.
- `npm run build`: verde.
- `npm run build:opennext`: terminó con código 0; Windows reportó una advertencia no bloqueante al instalar dependencias de image optimization.
- `npm run env:postgres:check` y `npm run env:postgres:tcp`: verdes; el entorno conectado es RDS de desarrollo `wms-web-dev-pg...`.
- `npx prisma migrate deploy --schema prisma/postgresql/schema.prisma`: aplicó `20260817100000_add_replenishment_governance` en RDS de desarrollo.
- `npx prisma migrate status --schema prisma/postgresql/schema.prisma`: confirmó el esquema al día.
- `npm run test:postgres`: 80 archivos, 413 pruebas verdes y 14 omitidas por diseño; la corrida usó esquemas aislados y limpió los esquemas de esta ejecución.
- El fixture de `tests/customers/customer-service.test.ts` se homologó para incluir `auditLog` y hacer visible la auditoría obligatoria también en mocks.
- La corrida local del gate AWS con credenciales sembradas fue bloqueada por `Credenciales invalidas`; la corrida oficial con secretos de GitHub pasó en [CI 32052951269](https://github.com/raul2105/WMS-Mangueras-y-conexiones/actions/runs/32052951269), incluido `AWS Read-only E2E (required)`.
- La prueba PostgreSQL de conversión pasó en `tests/purchasing/replenishment.integration.test.ts`: 1/1, con persistencia, creación de OC, precio/línea y reintento idempotente.
- Se aplicó en RDS dev la migración `20260817120000_add_replenishment_proposal_conversion`; `prisma migrate status` confirmó el esquema al día.
- Se ejecutó el mismo escenario contra el esquema `public` de RDS dev con datos controlados temporales y limpieza posterior: 1/1 verde; verificación final `controlledProducts=0`, `controlledSuppliers=0`, `controlledWarehouses=0`.
- Navegador local autenticado con fixture de administrador: `/purchasing/orders` y `/purchasing/orders/new` cargaron correctamente; la captura previa de `/purchasing` registró el bloqueo por migración antes de aplicarla.
- Evidencia visual guardada en `visual-purchasing-2026-08-17.png`, `visual-purchasing-orders-2026-08-17.png`, `visual-new-purchase-order-2026-08-17.png` y `visual-purchasing-post-migration-2026-08-17.png`; la pantalla principal ya renderiza después de la migración.

## Gaps que siguen abiertos

1. Mantener vigilancia de los 271 esquemas `t_run_*` antiguos existentes antes de esta corrida; no pertenecen a la ejecución actual y no fueron eliminados.
2. Revisar transaccionalidad de los formularios de catálogo y proveedores existentes que todavía usan el alias legacy de auditoría fuera de una transacción local.
3. Ejecutar E2E autenticado completo V1–V8 contra el SHA de esta rama desplegada; el gate AWS oficial que pasó valida el escenario read-only KAN-128 sobre `main` publicado, no esta rama.
4. Completar la captura visual por rol y la aceptación operativa de `/purchasing`; la revisión actual es parcial.
5. Publicar esta rama en GitHub, desplegar su SHA en el entorno AWS dev y reconciliar en Jira KAN-5/KAN-23, KAN-86/KAN-87 y los tickets de continuidad sin cerrar tareas sin evidencia.
