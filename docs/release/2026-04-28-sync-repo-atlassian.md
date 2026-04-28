# Sincronización repo ↔ Atlassian - 2026-04-28

## Decisión ejecutiva

El WMS usará **PostgreSQL como única base de datos soportada**.

Queda descartado mantener SQLite como runtime operativo, fallback local o proveedor alterno de Prisma. Cualquier referencia a SQLite debe considerarse deuda técnica a corregir antes de producción.

## Alcance de esta sincronización

1. Actualizar Atlassian para reflejar el estado real contra `main`.
2. Actualizar `docs/WMS_CAPABILITIES_STATUS.md` como fuente de verdad funcional.
3. Resolver la decisión de base de datos: PostgreSQL-only.
4. Exigir trazabilidad PR ↔ Jira.
5. Dejar el siguiente PR funcional recomendado, sin mezclarlo con esta corrección base.

## Estado base del repo

Repo: `raul2105/WMS-Mangueras-y-conexiones`

Rama base auditada: `main`

Último commit base considerado: `9128542af6d02d44fd4a197c84f19c9ba83ad33d`

## Hallazgos sincronizados

### Implementado o parcialmente implementado en código

- Catálogo maestro de productos, categorías, atributos técnicos y equivalencias.
- Almacenes y ubicaciones.
- Inventario por ubicación con `quantity`, `reserved` y `available`.
- Movimientos de inventario con trazabilidad documental.
- Usuarios, roles, permisos y relación usuario-rol.
- AuditLog transversal como modelo base.
- Proveedores, marcas por proveedor, productos por proveedor.
- Órdenes de compra, líneas y recibos.
- Solicitudes/pedidos internos de venta con asignación, surtido y entrega parcial como modelo base.
- Ensambles configurados, picklists y tareas de picking.
- SyncEvent como base de patrón outbox.

### A validar por QA antes de cerrar en Jira

- UI completa de administración de usuarios.
- UI completa de clientes.
- Flujo comercial-operativo de pedidos: asignación, visibilidad por rol, liberación y entrega.
- Dashboard operativo admin/manager.
- Cobertura de regresión RBAC y flujos críticos.

## Reconciliación Jira propuesta

| Ticket | Acción recomendada |
|---|---|
| KAN-8 | Mantener como ticket de sincronización documental y estado real. |
| KAN-11 | Marcar como implementado si la UI `/inventory/adjust` sigue presente y pasa QA. |
| KAN-12 | Marcar como implementado si `transferStock` y `/inventory/transfer` pasan QA. |
| KAN-13 | Marcar como implementado si `/inventory/kardex` pasa QA. |
| KAN-14 | Marcar como implementado si reconciliación de reservas pasa pruebas. |
| KAN-22 | Cambiar a parcial/QA: modelo de compras existe, falta validar UI/flujo completo. |
| KAN-25 | Cambiar a parcial/QA: modelo RBAC existe, falta validar cobertura/UI. |
| KAN-26 | Cambiar a parcial/QA: modelo AuditLog existe, falta validar cobertura transversal. |
| KAN-29 | Actualizar prioridad técnica: PostgreSQL-only. |
| KAN-48 | Mantener P0: clientes formales e integración en pedidos. |
| KAN-49 | Mantener P0: UI de administración de usuarios. |
| KAN-50 | Mantener P0/P1: dashboard operativo. |
| KAN-51 | Mantener P0: flujo comercial-operativo completo. |
| KAN-53 | Mantener P1 obligatorio: regresión/QA. |

## Decisión técnica: PostgreSQL-only

### Regla

- `DATABASE_URL` debe apuntar siempre a PostgreSQL.
- No se aceptan URLs `file:`, SQLite local ni bifurcación por proveedor.
- Desarrollo local debe conectarse a PostgreSQL local, Docker o AWS según el entorno.
- Producción debe ejecutar migraciones sobre PostgreSQL.

### Validación mínima obligatoria

```bash
npm run prisma:validate
npx prisma validate
npx prisma migrate status
npm run lint
npx tsc --noEmit
npm run build
npm test
```

## Riesgos abiertos

1. Si `prisma/schema.prisma` sigue declarando `provider = "sqlite"`, el repo no está listo para PostgreSQL-only.
2. Si existen migraciones SQLite previas, debe revisarse compatibilidad SQL antes de aplicar en PostgreSQL.
3. Si los scripts locales generan `.env` con `file:` o `.db`, deben bloquearse o fallar rápido.
4. Si CI usa `db:push` contra SQLite, debe migrarse a servicio PostgreSQL en GitHub Actions.

## Siguiente PR funcional recomendado

Después de este PR base, ejecutar:

`feat(KAN-48): integrar clientes formales en pedidos`

No mezclar `KAN-48` con esta sincronización. Primero debe quedar limpia la base documental, técnica y de trazabilidad.
