# WMS Capabilities Status

Fecha de corte: 2026-04-29

## Decision base

PostgreSQL es la base de datos canonica y unica para runtime, pruebas integradas, migraciones y generacion de Prisma Client.

- Schema canonico: `prisma/postgresql/schema.prisma`.
- Migraciones canonicas: `prisma/postgresql/migrations`.
- `DATABASE_URL` debe iniciar con `postgres://` o `postgresql://`.
- SQLite queda como legado historico/offline y no debe usarse como fuente de verdad operativa.

## Fuente de verdad operacional

| Tema | Fuente oficial |
|---|---|
| Backlog, prioridad y alcance | Jira `KAN` |
| Codigo, configuracion y migraciones | GitHub `main` |
| Estado funcional consolidado | Este documento |
| Proceso GitHub-Jira | `docs/process/atlassian-github-operating-guide.md` |
| Cierre diario | `docs/runbooks/git-jira-sync-daily.md` |

## Implementado en codigo

- Catalogo maestro de productos, categorias, subcategorias, unidades y marcas por proveedor.
- Proveedores con razon social, nombre comercial, marcas y relacion producto-proveedor.
- Almacenes y ubicaciones por zona/bin/rack con tipos de uso.
- Inventario por ubicacion con `quantity`, `reserved` y `available`.
- Movimientos de inventario `IN`, `OUT`, `TRANSFER` y `ADJUSTMENT`.
- Recepcion con referencia documental y adjuntos.
- Picking validando inventario disponible.
- Ajustes de inventario y transferencias internas.
- Kardex por SKU/ubicacion con filtros.
- Ordenes de produccion y ensamble 3 piezas con reservas, picklists, WIP y consumo.
- Solicitudes/pedidos internos de venta con lineas de producto y ensamble configurado.
- Picklists y tareas de picking para pedidos internos.
- Compras: proveedores, ordenes de compra, lineas, recibos y lineas de recibo.
- Auth/RBAC base: `User`, `Role`, `Permission`, `UserRole`, `RolePermission`.
- Auditoria transversal base con `AuditLog`.
- Trazabilidad, etiquetas, plantillas y trabajos de impresion.
- Sync/outbox con `SyncEvent`.
- Runtime AWS/local con PostgreSQL y scripts de despliegue AWS.
- Flujo operativo GitHub/Jira incorporado con `daily-sync-report` y `sync-jira-views`.
- Registro formal de clientes integrado parcialmente en ventas/produccion por PR #16.

## Reconciliacion Jira vs repo

### Implementado o parcialmente implementado; requiere actualizar Jira

- `KAN-8`: guia, proceso y fuente de verdad quedan unificados en el PR documental actual.
- `KAN-10`: alta de producto sin inventario invalido.
- `KAN-9`: validaciones server-side con Zod en flujos criticos.
- `KAN-11`: UI/servicio de ajustes de inventario.
- `KAN-12`: transferencias internas atomicas.
- `KAN-13`: vista de kardex.
- `KAN-14`: politica/reconciliacion de reservas.
- `KAN-22`: modelo de compras y recibos ya existe en Prisma.
- `KAN-25`: Auth/RBAC base ya existe; falta validar cobertura UI/operativa.
- `KAN-26`: `AuditLog` ya existe; falta validar cobertura por accion critica.
- `KAN-48`: clientes formales avanzados por PR #16; requiere confirmar cierre funcional completo y QA.
- `KAN-51`: campos y parte de flujo de asignacion/entrega existen; falta validar UI, permisos y auditoria completa.

### Mantener como prioridad abierta

- `KAN-29`: cerrar PostgreSQL-only en release, CI, scripts legacy y pruebas con `DATABASE_URL` PostgreSQL.
- `KAN-53`: QA, RBAC y regresion de flujos criticos, especialmente tras PR #16.
- `KAN-49`: UI de administracion de usuarios para `SYSTEM_ADMIN`.
- `KAN-50`: dashboard admin/manager centrado en pedidos por surtir.
- `KAN-52`: UX de flujo de pedidos, `flowStage`, timeline y filtros.

## Pendiente tecnico inmediato

- Eliminar dependencias operativas restantes de SQLite en scripts legacy.
- Confirmar que CI corre con `DATABASE_URL` PostgreSQL en secretos/variables.
- Resolver `KAN-29` / GitHub issue #14.
- Ejecutar regresion `KAN-53` para clientes, pedidos y RBAC tras PR #16.
- Actualizar Jira al cerrar este PR documental con SHA merge y evidencia.

## Nota operativa

Para trabajo diario y pruebas integradas:

```bash
npm run prisma:validate
npm run prisma:generate
npm run lint
npm run typecheck
npm run test
npm run build
```

Todos los comandos anteriores requieren `DATABASE_URL` PostgreSQL cuando toquen Prisma, pruebas integradas o DB. Si el valor apunta a SQLite, el proceso debe fallar.
