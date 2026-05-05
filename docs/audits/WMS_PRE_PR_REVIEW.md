# WMS Pre-PR Review

Fecha: 2026-04-30  
Rama evaluada: `ci/wms-quality-gate`  
Base de comparación: `git diff main` (working tree tracked + untracked, sin commits adelantados sobre `main`)

## Resumen ejecutivo

La revisión pre-PR confirma avances reales en CI, seguridad de usuarios (KAN-49), flujo interno de pedidos (KAN-51), pruebas de regresión PostgreSQL y reconciliación documental.  
Sin embargo, **no se recomienda abrir un PR único**: el working tree mezcla cambios de dominios distintos (CI/QA, código funcional, documentación amplia e infraestructura CDK de scheduling DEV) y además el gate de lint falla.

Recomendación principal: **dividir PR + corregir lint antes de merge**.

## Clasificación de cambios

| Grupo/archivo | Tipo | Impacto | Riesgo | ¿En PR actual o separado? |
|---|---|---|---|---|
| `.github/workflows/ci.yml`, `docs/testing.md`, `package.json` (`test:regression:postgres`) | CI | Define quality gate real con Postgres efímero y regresión | Medio | PR A (CI/QA gate) |
| `lib/users/admin-service.ts`, `lib/sales/request-service.ts`, `lib/sales/internal-orders.ts`, `app/(shell)/production/requests/[id]/page.tsx` | Código funcional | Endurece reglas backend KAN-49/KAN-51 | Alto | PR B (funcional + pruebas) |
| `tests/sales-request-service.test.ts`, `tests/users/admin-service.integration.test.ts`, `tests/dashboard/*`, `tests/customers/postgresql-customer-order.integration.test.ts`, `tests/inventory-integrity.test.ts` | Pruebas | Cubre reglas críticas y regresión PostgreSQL | Medio-Alto | PR B (funcional + pruebas) |
| `README.md`, `CONTRIBUTING.md`, `docs/process/atlassian-github-operating-guide.md`, `docs/WMS_CAPABILITIES_STATUS.md`, `docs/jira/WMS_KAN_48_51_RECONCILIATION.md`, `docs/audits/*`, `docs/ADR/*`, `docs/IMPLEMENTATION_SUMMARY.md`, `docs/README.md` | Documentación | Reconciliación Jira/GitHub + estado canónico PostgreSQL | Medio | PR C (docs/gobernanza) |
| `infra/cdk/config/dev.json`, `infra/cdk/lib/wms-web-stack.js`, `docs/runbooks/AWS_DEV_SCHEDULE_CONTROL.md` | Configuración/infra | Agrega scheduler DEV (Lambdas/EventBridge/Scheduler/alarms) | Alto | PR D (infra DEV scheduling) |

## Riesgos cerrados

- CI ya contempla gate real con PostgreSQL y regresión determinística (`test:regression:postgres`).
- KAN-49: protección del último `SYSTEM_ADMIN` en backend + pruebas de integración.
- KAN-51: bloqueo backend de entrega sin toma/asignación + pruebas de transiciones inválidas/válidas.
- Dashboard KAN-50: ahora existe cobertura dedicada (`tests/dashboard/fulfillment-dashboard.integration.test.ts` y `tests/dashboard/fulfillment-signals.unit.test.ts`).
- Documentación principal migrada a PostgreSQL canónico y jerarquía documental definida.

## Riesgos aún abiertos

- **Lint en rojo**: error real en `tests/customers/request-new-customer-page.runtime.test.ts:33` (`@next/next/no-assign-module-variable`).
- Mezcla de cambios de infraestructura DEV (`infra/cdk/*`) con PRs de CI/feature/docs incrementa riesgo de review incompleto y rollback difícil.
- Contradicción de trazabilidad histórica: auditorías previas describían un CI parcial; el workflow actual ya ejecuta regresión PostgreSQL completa.
- Persisten validaciones manuales administrativas Jira/GitHub no verificables desde repo.
- Queda deuda E2E visual para cierre operativo completo de KAN-49/KAN-51.

## Hallazgos críticos detectados

1. `lint` falla (bloqueante para merge de quality gate):
- Archivo: `tests/customers/request-new-customer-page.runtime.test.ts:33`
- Error: `Do not assign to the variable module` (`@next/next/no-assign-module-variable`)

2. Cambios de infraestructura mezclados:
- `infra/cdk/config/dev.json`
- `infra/cdk/lib/wms-web-stack.js`
- Esto no corresponde al mismo alcance que CI/QA/KAN y debe ir en PR separado.

3. Diferencia entre estado de CI declarado anteriormente y estado actual:
- Reportes previos mencionaban subset (`test:rbac:unit` + `test:customers:contracts`).
- Estado actual del workflow: `lint`, `typecheck`, `prisma:validate`, `prisma:generate`, `db:push`, `test:regression:postgres`, `build`.

4. Validaciones manuales pendientes:
- Estado Jira de KAN-48/49/50/51.
- Estado administrativo de PR #15.
- Alineación de required checks en branch protection con los nombres actuales de jobs.

## Tests ejecutados y resultado real

| Comando | Resultado |
|---|---|
| `npm run lint` | ❌ Falló (1 error, 4 warnings). Error bloqueante en `tests/customers/request-new-customer-page.runtime.test.ts:33`. |
| `npm run typecheck` | ✅ OK |
| `npm run prisma:validate` | ✅ OK |
| `npm run prisma:generate` | ✅ OK |
| `npm run test:regression:postgres` | ✅ OK (18 archivos de test, 85 tests pasados) |
| `npm run build` | ✅ OK |

## Contradicciones documentales observadas

- `docs/WMS_CAPABILITIES_STATUS.md` quedó actualizado y consistente con estado técnico reciente.
- `docs/jira/WMS_KAN_48_51_RECONCILIATION.md` y `docs/process/atlassian-github-operating-guide.md` están alineados con la reconciliación y reglas de gobernanza.
- `docs/IMPLEMENTATION_SUMMARY.md` fue etiquetado como snapshot histórico, reduciendo riesgo de interpretación incorrecta.
- Persiste potencial ambigüedad operativa si no se separan PRs: cambios de docs de reconciliación pueden quedar opacados por cambios de infra/feature.

## Qué validar manualmente (checklist)

- [ ] Confirmar estado Jira de KAN-48.
- [ ] Confirmar estado Jira de KAN-49.
- [ ] Confirmar estado Jira de KAN-50.
- [ ] Confirmar estado Jira de KAN-51.
- [ ] Verificar estado final de PR #15 (abierto/merged/cerrado sin merge).
- [ ] Verificar branch protection: que `Quality Gate (required)` sea required y que `Security Audit (optional)` / `Smoke Published Links (optional, push only)` no bloqueen merge.

## Recomendación final

**Recomendación: dividir PR + corregir antes de PR.**

No abrir PR único en el estado actual.  
Primero corregir lint bloqueante; luego separar en:

1. PR A (CI/QA gate): `.github/workflows/ci.yml`, `docs/testing.md`, `package.json`.
2. PR B (KAN-49/KAN-51 funcional + pruebas): `lib/*`, `app/(shell)/production/requests/[id]/page.tsx`, `tests/*` relacionados.
3. PR C (documentación/gobernanza/reconciliación): `README`, `CONTRIBUTING`, `docs/process/*`, `docs/WMS_CAPABILITIES_STATUS.md`, `docs/jira/*`, `docs/audits/*`, ADR/snapshot.
4. PR D (infra DEV scheduling): `infra/cdk/config/dev.json`, `infra/cdk/lib/wms-web-stack.js`, runbook AWS.

## Descripción sugerida del PR (para PR A: CI/QA gate)

`ci: enforce PostgreSQL regression quality gate for PRs`

Propuesta de cuerpo:
- Implementa gate requerido de calidad con PostgreSQL efímero en GitHub Actions.
- Estandariza orden fail-fast: lint → typecheck → prisma validate/generate → db push → regression postgres → build.
- Mantiene checks opcionales separados (`security`, `smoke-published`) para no bloquear por ruido.
- Documenta comandos locales equivalentes en `docs/testing.md`.
- Nota: el repo mantiene un fallo de lint preexistente que debe corregirse para merge en verde.
