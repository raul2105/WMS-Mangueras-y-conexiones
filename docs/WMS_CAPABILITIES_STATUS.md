# WMS Capabilities Status

Fecha de corte: 2026-04-28

## Decisión técnica base

El WMS usará **PostgreSQL como única base de datos soportada**.

- `DATABASE_URL` debe ser una URL PostgreSQL válida.
- No se soporta SQLite como runtime local, fallback ni base productiva.
- Cualquier referencia a `provider = "sqlite"`, archivos `.db` o `file:` debe tratarse como deuda técnica bloqueante antes de producción.
- Los entornos local, staging y producción deben operar contra PostgreSQL: local Docker/PostgreSQL o AWS PostgreSQL según aplique.

## Implementado en código

- Catálogo maestro de productos, categorías, atributos técnicos y equivalencias.
- Normalización de proveedor/marca con `Supplier`, `SupplierBrand`, `SupplierProduct`, `primarySupplierId` y `supplierBrandId`.
- Almacenes y ubicaciones con tipos de uso (`STORAGE`, `RECEIVING`, `SHIPPING`, `STAGING`, `WIP`).
- Inventario por ubicación con `quantity`, `reserved` y `available`.
- Movimientos de inventario con referencia documental, archivos, operador, `traceId` y vínculos a ubicación/producto.
- Recepción (`IN`) con referencia documental y adjuntos.
- Picking (`OUT`) validando inventario disponible.
- Ajustes de inventario (`ADJUSTMENT`) y transferencias (`TRANSFER`) como capacidades del dominio.
- Kardex/consulta de movimientos como capacidad documentada en iteraciones previas.
- Órdenes de producción y ensambles configurados.
- Picklists y tareas de picking para ensambles y pedidos internos.
- Pedidos internos de venta con asignación, pull y entrega al cliente como campos de modelo.
- Usuarios, roles, permisos y relación usuario-rol.
- `AuditLog` como bitácora transversal base.
- Compras: proveedores, órdenes de compra, líneas, recibos y líneas de recibo.
- `SyncEvent` como base de patrón outbox para sincronización controlada.
- Capa móvil AWS desacoplada documentada en `mobile/`, `mobile-web/`, `lib/mobile/` e infraestructura relacionada.

## Implementado o parcialmente cubierto por tickets KAN

- `KAN-10`: alta de producto no debe crear inventario inválido sin ubicación.
- `KAN-9`: validaciones server-side con Zod en flujos críticos.
- `KAN-11`: ajustes de inventario.
- `KAN-12`: transferencias internas.
- `KAN-13`: kardex.
- `KAN-14`: reconciliación de reservas.
- `KAN-22`: modelo base de compras y recepción existe; requiere validación de UI/flujo completo.
- `KAN-25`: modelo base de Auth/RBAC existe; requiere validación de UI, permisos y cobertura.
- `KAN-26`: modelo `AuditLog` existe; requiere validación transversal en acciones críticas.
- `KAN-51`: campos de asignación, pull y entrega existen en modelo; requiere validación funcional completa.

## Pendiente prioritario

### P0

- `KAN-48`: registro formal de clientes e integración en pedidos de surtido.
- `KAN-49`: administración de usuarios para `SYSTEM_ADMIN`.
- `KAN-50`: dashboard admin/manager centrado en pedidos por surtir.
- `KAN-51`: flujo de pedidos: asignación, segmentación sales y entrega al cliente.
- `KAN-29`: cerrar migración técnica a PostgreSQL-only, incluyendo Prisma, scripts y CI.

### P1

- `KAN-52`: UX de flujo de pedidos: `flowStage`, timeline y filtros operativos.
- `KAN-53`: QA, RBAC y regresión de flujos críticos.
- `KAN-19` a `KAN-21`: reglas técnicas hidráulicas y equivalencias compatibles.
- `KAN-23` a `KAN-24`: reabasto, discrepancias y recepción avanzada.
- `KAN-27`: tablero KPI WMS.

### P2

- `KAN-28`: pruebas E2E amplias y smoke tests productivos.

## Estado de sincronización repo ↔ Atlassian

La fuente operativa debe ser:

1. Código en `main`.
2. Documentación viva en `docs/`.
3. Jira como backlog y control de ejecución.

Si Jira contradice el código, Jira debe actualizarse o moverse a estado de QA/parcial, no asumirse como verdad técnica.

## Quality gates obligatorios

Antes de cerrar tickets o fusionar PRs:

```bash
npm run prisma:validate
npx prisma validate
npx prisma migrate status
npm run lint
npx tsc --noEmit
npm run build
npm test
```

## Nota operativa

Para ambientes PostgreSQL, no usar `db push` como sustituto permanente de migraciones versionadas. La ruta preferente es migración controlada y validada con Prisma Migrate.
