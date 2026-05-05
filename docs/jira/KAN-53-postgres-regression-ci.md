# KAN-53 — QA, RBAC y regresión PostgreSQL en CI

Fecha de creación: 2026-04-30  
Rama: `ci/KAN-53-postgres-regression`

## Objetivo

Cerrar la brecha de calidad donde CI declaraba `DATABASE_URL` PostgreSQL pero no levantaba un servicio PostgreSQL real para pruebas de integración.

## Cambios aplicados

- `.github/workflows/ci.yml` ahora agrega `services.postgres` con PostgreSQL 16.
- El job `quality` valida conectividad con `node scripts/db/assert-postgres-env.cjs --check-connection`.
- CI ejecuta Prisma validate y generate antes de pruebas.
- CI ejecuta regresión mínima WMS:
  - RBAC integration.
  - Customer PostgreSQL integration.
  - Sales service regression.
  - Customer contract tests.
- Build corre después de pruebas para evitar falso positivo de build sin validación funcional.

## Quality gates esperados

```bash
npm ci
node scripts/db/assert-postgres-env.cjs --check-connection
npm run prisma:validate
npm run prisma:generate
npm run lint
npm run typecheck
npm run test:rbac:integration
npm run test:customers:postgres
npm run test:sales:service
npm run test:customers:contracts
npm run build
```

## Criterios de cierre Jira

KAN-53 puede avanzar si:

- El PR corre en GitHub Actions con PostgreSQL service.
- Los checks de calidad pasan o se documentan fallos reales.
- No requiere secretos para pruebas básicas.
- No ejecuta migraciones destructivas fuera de entorno test.

## Riesgos

- Si las pruebas requieren seed adicional, el CI fallará correctamente y deberá ajustarse fixture/seed.
- Si `next typegen` o `next build` depende de artefactos locales no versionados, CI expondrá esa deuda.
- Este PR puede revelar fallos ocultos; no deben omitirse ni marcarse como no relacionados sin evidencia.
