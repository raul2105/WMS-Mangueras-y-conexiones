# Reconciliacion Repo GitHub - Atlassian

Fecha: 2026-04-28
Proyecto Jira: KAN / WMS project
Repositorio: raul2105/WMS-Mangueras-y-conexiones

## Decision ejecutiva

PostgreSQL queda definido como runtime canonico y unica base operativa del WMS.

SQLite queda degradado a legado historico/offline y no debe usarse como fuente de verdad para desarrollo diario, pruebas integradas, migraciones ni despliegue.

## Cambios aplicados en repo

- `prisma.config.ts` apunta a `prisma/postgresql/schema.prisma` y `prisma/postgresql/migrations`.
- `scripts/db/validate-prisma-schemas.cjs` valida solo PostgreSQL y falla si `DATABASE_URL` no es PostgreSQL.
- `scripts/db/generate-default-prisma-client.cjs` genera Prisma Client contra PostgreSQL.
- `scripts/db/run-vitest-postgresql.cjs` se agrega como runner canonico de pruebas.
- `package.json` apunta scripts canonicos a PostgreSQL.
- `.github/pull_request_template.md` exige ticket Jira y verificacion PostgreSQL.
- `CONTRIBUTING.md` exige trazabilidad Jira y define PostgreSQL como base tecnica obligatoria.
- `docs/WMS_CAPABILITIES_STATUS.md` queda actualizado con corte 2026-04-28.

## Reconciliacion Jira

### Tickets a marcar como implementado/parcial segun evidencia de repo

- KAN-10: implementado.
- KAN-9: implementado/parcial segun cobertura real.
- KAN-11: implementado.
- KAN-12: implementado.
- KAN-13: implementado.
- KAN-14: implementado/parcial.
- KAN-22: implementado a nivel modelo base.
- KAN-25: implementado a nivel modelo/RBAC base; falta validar UI y permisos completos.
- KAN-26: implementado a nivel modelo; falta validar cobertura transversal.
- KAN-51: parcialmente implementado a nivel schema; falta cierre UI/flujo/auditoria.

### Tickets que siguen abiertos como prioridad

- KAN-48: clientes formales en pedidos.
- KAN-49: administracion de usuarios para SYSTEM_ADMIN.
- KAN-50: dashboard operativo admin/manager.
- KAN-52: UX flowStage, timeline y filtros.
- KAN-53: QA, RBAC y regresion.
- KAN-29: migracion productiva PostgreSQL y retiro total de SQLite operativo.

## Quality gates requeridos

Ejecutar con `DATABASE_URL` PostgreSQL:

```bash
npm run prisma:validate
npm run prisma:generate
npm run typecheck
npm run test
npm run build
```

## Riesgos

1. CI puede fallar si no existe `DATABASE_URL` PostgreSQL en secretos/variables.
2. Scripts legacy pueden seguir invocando SQLite si no se retiran en una segunda limpieza.
3. Tests que dependian de SQLite pueden requerir fixtures/seed PostgreSQL.
4. `package-lock.json` podria requerir actualizacion si `package.json` estaba desincronizado antes del PR.

## Siguiente PR recomendado

`feat(KAN-48): integrar clientes formales en pedidos`

No avanzar a KAN-48 hasta que el PR de sincronizacion base este integrado y CI pase con PostgreSQL.
