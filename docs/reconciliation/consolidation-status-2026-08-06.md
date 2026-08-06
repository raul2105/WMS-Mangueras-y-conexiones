# Consolidación del plan operativo — 2026-08-06

## Estado de publicación

| Elemento | Estado | Evidencia |
|---|---|---|
| `origin/main` | `33d4f3e` antes de consolidar | `git rev-parse origin/main` |
| Rama vigente | `codex/plan-complete` publicada | PR #94 |
| Commits a integrar | `3d19c10`, `65377f2` | `git log origin/main..codex/plan-complete` |
| PR | Draft, dirigida a `main` | https://github.com/raul2105/WMS-Mangueras-y-conexiones/pull/94 |
| GitHub Actions | Bloqueada hasta configurar credenciales E2E | workflow `AWS Read-only E2E (required)` |
| Base operativa | PostgreSQL canónico en AWS | `.env`/runtime AWS y evidencia de reconciliación |

## Validación local

- `npm run typecheck`: verde.
- `npm run lint`: verde.
- `npm run prisma:validate`: verde.
- `npm run test:unit`: 42 archivos, 122 pruebas, verde.
- `npm run build`: verde.

## Validación AWS

La corrección acotada de reservas de `PI-2026-0010` y su verificación posterior están documentadas en `aws-reservation-reconciliation-2026-08-06.md`. La prueba AWS read-only requiere credenciales E2E por rol; la corrida local se detuvo antes del login porque esas variables no están configuradas en este entorno.

No se creó una segunda base de datos, no se ejecutó una migración destructiva y no se modificó otro pedido.

## PR y ramas

- PR #85 está cerrada sin merge; no forma parte del trabajo a integrar.
- `feat/sales-worklist-navigation-simplification` conserva un commit único y no se elimina hasta comparar su contenido con el estado actual.
- Ramas con upstream `gone` o PR fusionada se eliminarán sólo después de confirmar que su tip está alcanzado por `origin/main`.
- Ramas con commits únicos o PR activas se conservarán y se registrarán como excepciones.

Después de la limpieza conservadora, las excepciones remotas que permanecen son:

| Rama | Motivo de conservación |
|---|---|
| `codex/plan-complete` | PR #94 pendiente de checks y merge |
| `feat/sales-worklist-navigation-simplification` | PR #85 cerrada, pero conserva diff único para revisión |
| `feat/KAN-65-material-request-link`, `feature/KAN-65-mr-so-idempotency` | trabajo divergente de KAN-65 |
| `ci/KAN-53-postgres-regression`, `ci/wms-quality-gate` | líneas de CI históricas no equivalentes por tip |
| `docs/KAN-8-standardize-atlassian-github-process` | documentación divergente |
| `fix/KAN-8-*`, `refactor/commercial-workflow-hierarchy`, `test/KAN-49-user-admin-validation`, `fix/KAN-73-overdelivery-concurrency` | commits únicos no alcanzados por `origin/main` |

Las ramas locales cuyo tip ya estaba alcanzado por `origin/main` fueron eliminadas. No se eliminaron ramas divergentes.

## Bloqueadores para merge

1. Configurar en GitHub los secretos `WMS_E2E_SALES_EXECUTIVE_*` y `WMS_E2E_WAREHOUSE_OPERATOR_*`.
2. Ejecutar `Quality Gate (required)` y `AWS Read-only E2E (required)` en PR #94.
3. Confirmar que el SHA fusionado es el SHA desplegado en AWS.

Hasta cumplir esos puntos, la PR permanece sin merge y KAN-128 no se declara finalizado.
