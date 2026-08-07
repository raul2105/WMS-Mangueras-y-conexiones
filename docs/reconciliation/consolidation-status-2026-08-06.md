# Consolidación del plan operativo — 2026-08-06

## Estado de publicación

| Elemento | Estado | Evidencia |
|---|---|---|
| `origin/main` | `33d4f3e` antes de consolidar | `git rev-parse origin/main` |
| Rama vigente | `codex/plan-complete` publicada | PR #94 |
| Commit vigente | `716585e` | `git rev-parse HEAD` |
| PR | Abierta, lista para fusión, dirigida a `main` | https://github.com/raul2105/WMS-Mangueras-y-conexiones/pull/94 |
| GitHub Actions | Quality Gate y AWS Read-only E2E verdes en el SHA vigente | workflow `31129261492` |
| Base operativa | PostgreSQL canónico en AWS | `.env`/runtime AWS y evidencia de reconciliación |

## Validación local

- `npm run typecheck`: verde.
- `npm run lint`: verde.
- `npm run prisma:validate`: verde.
- `npm run test:unit`: 42 archivos, 122 pruebas, verde.
- `npm run build`: verde.
- Pruebas PostgreSQL de flujo comercial–almacén sobre AWS RDS: 3 escenarios críticos verdes.

## Validación AWS

La corrección acotada de reservas de `PI-2026-0010` y su verificación posterior están documentadas en `aws-reservation-reconciliation-2026-08-06.md`. El gate AWS read-only se ejecutó correctamente contra el ambiente publicado usando las credenciales E2E configuradas en GitHub Actions.

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

## Estado de cierre

- `Quality Gate (required)`: verde en el SHA vigente.
- `AWS Read-only E2E (required)`: verde en el SHA vigente.
- Conversaciones de revisión: 0 hilos sin resolver.
- La fusión queda sujeta únicamente a que GitHub reconozca los checks oficiales de la app configurada para la protección de `main`; no se usará bypass administrativo.
