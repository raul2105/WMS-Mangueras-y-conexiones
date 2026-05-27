# WMS Capabilities Status

Fecha de corte: 2026-05-27

## Decision base

PostgreSQL es la base de datos canonica y unica para runtime, pruebas integradas, migraciones y generacion de Prisma Client.

- Schema canonico: `prisma/postgresql/schema.prisma`.
- Migraciones canonicas: `prisma/postgresql/migrations`.
- `DATABASE_URL` debe iniciar con `postgres://` o `postgresql://`.
- SQLite queda como legado historico/offline y no debe usarse como fuente de verdad operativa.
- `build:release` y su cadena de ejecucion son PostgreSQL-only por default; cualquier bootstrap local legado con SQLite requiere opt-in explicito y no representa la ruta canonica de WMS.

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

## Reconciliacion puntual 2026-05-27

- `KAN-29`: reconciliado como cierre tecnico defendible. Evidencia principal:
  - `PR #20` mergeado (`fix(KAN-29): isolate canonical PostgreSQL release/bootstrap flow`).
  - `scripts/release/build-release.ps1` ya bloquea `DbMode=local` por default y solo permite bootstrap SQLite legado con opt-in explicito (`-AllowLegacyLocalBootstrap`).
  - `prisma.config.ts` mantiene schema y migraciones canonicas en `prisma/postgresql/*`.
- `KAN-77`: reconciliado como cierre tecnico-operativo defendible. Evidencia principal:
  - `ProductionOrder.kind=GENERIC` operativo de punta a punta en `lib/production/generic-order-service.ts`.
  - Semantica terminal `GENERIC -> COMPLETADA` implementada como consumo + liberacion de reservas + reconciliacion scoped (`productId`,`locationId`) en una transaccion con auditoria.
  - UI minima operativa en detalle/alta generica:
    - `app/(shell)/production/orders/[id]/page.tsx`
    - `app/(shell)/production/orders/new/generic/page.tsx`
  - Suite PostgreSQL especifica KAN-77 en verde:
    - `npm run test:postgres -- tests/generic-order-service.test.ts --maxWorkers=1`
  - Regresion PostgreSQL en verde:
    - `npm run test:regression:postgres`
  - Build en verde:
    - `npm run build`
  - Corrida operativa AWS PostgreSQL real (2026-05-27):
    - `npm run env:postgres:check` -> OK
    - `npm run env:postgres:tcp` -> OK
    - `npm run prisma:validate` -> OK
    - `npm run prisma:generate` -> OK
    - `npm run db:push` -> OK
    - `npm run test:postgres -- tests/generic-order-service.test.ts --maxWorkers=1` -> OK (1 archivo, 6 tests)
    - `npm run test:regression:postgres` -> OK (25 archivos, 113 tests)
    - `npm run build` -> OK
  - Eliminado legacy `lib/inventory-service.js` para evitar riesgo transaccional por resolucion de modulo (lock en cierre).

## Reconciliacion Jira vs repo

### Reconciliacion historica pre KAN-54+ (corte 2026-05-08)

| Ticket | Estado Jira | Estado reconciliacion | Nota |
|---|---|---|---|
| `KAN-64` | Finalizada | Reconciliado/cerrado | Drift Prisma/AWS documentado y cerrado. |
| `KAN-11` | Finalizada | Reconciliado/cerrado | Evidencia PostgreSQL y cierre tecnico registrado. |
| `KAN-13` | Finalizada | Reconciliado/cerrado | Evidencia funcional kardex y cierre tecnico registrado. |
| `KAN-15` | Finalizada | Reconciliado/cerrado | MaterialRequest separado y handoff a KAN-17 documentado. |
| `KAN-2` | Idea | Abierto valido | Epic abierto por deuda operativa pendiente. |
| `KAN-3` | Idea | Abierto valido | Epic abierto; faltan cierres funcionales hijos. |
| `KAN-9` | Idea | Abierto valido | Requiere cierre funcional/evidencia final ticket-scoped. |
| `KAN-14` | Idea | Abierto valido | Politica de reservas no cerrable por inferencia. |
| `KAN-17` | Idea | Abierto valido | Conversion operativa desde MaterialRequest pendiente. |
| `KAN-18` | Idea | Abierto valido | Cierre de entrega con impacto final de inventario pendiente. |

Regla de gate pre `KAN-54+`:
- Triple paridad obligatoria: Jira correcto + GitHub sin ruido historico abierto + documentacion canonica actualizada en la misma ventana.

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

- `KAN-53`: QA, RBAC y regresion de flujos criticos, especialmente tras PR #16.
- `KAN-50`: dashboard admin/manager centrado en pedidos por surtir.
- `KAN-52`: UX de flujo de pedidos, `flowStage`, timeline y filtros.
- `KAN-2`, `KAN-3`, `KAN-9`, `KAN-14`, `KAN-17`, `KAN-18`: se mantienen abiertos con motivo valido segun reconciliacion historica pre `KAN-54+` (2026-05-08).

### Cerrado y reconciliado

- `KAN-29`: release/bootstrap PostgreSQL-only reconciliado. Evidencia base: `PR #20` mergeado, bloqueo explicito de SQLite por default en `scripts/release/build-release.ps1`, y `prisma.config.ts` alineado al schema canonico PostgreSQL.
- `KAN-49`: administracion de usuarios para `SYSTEM_ADMIN` ya validada en `main` y cerrada en Jira el 2026-05-05. Evidencia base: PR mergeado `#19`, GitHub Actions CI run `#55` en `success`, cobertura PostgreSQL en `tests/users/admin-service.integration.test.ts` y `tests/users/auth-login.integration.test.ts`, y guardas RBAC de rutas `/users*`.
- `KAN-77`: orden generica reconciliada como capacidad operativa real. Evidencia base: servicio generico operativo (`lib/production/generic-order-service.ts`), UI minima de alta/detalle generica, suite PostgreSQL KAN-77 en verde, `test:regression:postgres` en verde, `build` en verde y eliminacion de `lib/inventory-service.js` legacy por riesgo de lock transaccional.

## Pendiente tecnico inmediato

- Ejecutar regresion `KAN-53` para clientes, pedidos y RBAC tras PR #16.
- Mantener este documento reconciliado con cierres funcionales ya confirmados en Jira, registrando evidencia verificable de GitHub (PR, SHA y CI).

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
