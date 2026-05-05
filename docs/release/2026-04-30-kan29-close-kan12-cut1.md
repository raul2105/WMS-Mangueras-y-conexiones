# Cierre tecnico KAN-29 y Corte 1 KAN-12

Fecha: 2026-04-30
Proyecto Jira: KAN
Repositorio: raul2105/WMS-Mangueras-y-conexiones

## KAN-29 — Estado tecnico actual

Decision tecnica vigente: PostgreSQL es la base canonica para release/prod (runtime, schema, migraciones, generate y validaciones).

### Evidencia ejecutada hoy (local)

1. `npm run prisma:validate` -> OK (schema PostgreSQL valido).
2. `npm run prisma:generate` -> OK (client generado con schema PostgreSQL).
3. `npm run typecheck` -> OK.
4. `node scripts/db/run-vitest-postgres.cjs run` -> OK parcial con suites Postgres habilitadas; suites SQLite-only se omiten cuando `RUN_POSTGRES_TESTS=1`.
5. `npm run build` -> OK.
6. `npm run smoke:published` -> FAIL por configuracion faltante en entorno local (`MOBILE_PUBLISHED_URL`, `MOBILE_API_BASE_URL`).

### Cambios aplicados para alinear KAN-29

- `package.json`
  - Se agrega `test:postgres` para runner canonico PostgreSQL.
  - `verify:release` ahora usa `test:postgres` (no `test` SQLite).
- `tests/sales-request-service.test.ts`
  - Se marca como suite SQLite-only cuando el runner Postgres esta activo.
- `tests/inventory-integrity.test.ts`
  - Se marca como suite SQLite-only cuando el runner Postgres esta activo.

### Bloqueadores residuales para cerrar administrativamente KAN-29 hoy

1. Smoke publicado no ejecutable en este workspace sin variables reales:
   - `MOBILE_PUBLISHED_URL`
   - `MOBILE_API_BASE_URL`
2. Validacion Jira/GitHub pendiente fuera del repo:
   - Asignar owner de KAN-29.
   - Adjuntar evidencia en Jira KAN-29, issue #14 y PR #15.

### Criterio de Done recomendado para KAN-29

- `verify:release` en verde con `DATABASE_URL` PostgreSQL.
- Smoke publicado en verde con URLs reales de DEV.
- Jira/GitHub/PR alineados sin contradiccion de SQLite como runtime operativo.

## KAN-12 — Corte 1 implementable

Objetivo: asegurar un primer corte ejecutable y verificable del compromiso con vencimiento 2026-05-02.

### Alcance minimo

1. Cobertura de transferencias internas atomicas sobre flujo operativo principal.
2. Validaciones de negocio minimas:
   - origen != destino
   - no permitir mover mas de disponible
   - registro de movimiento `TRANSFER`
3. Evidencia de integridad post-operacion:
   - decremento en origen
   - incremento en destino
   - sin cantidades negativas

### Backlog tecnico atomico (orden sugerido)

1. Revisar contrato actual de servicio de inventario para transfer.
2. Completar/ajustar pruebas de integridad de transferencia en runner canónico definido para este ticket.
3. Validar trazabilidad de movimiento y metadata minima (motivo/ref).
4. Ejecutar validaciones finales de calidad (`prisma:validate`, `prisma:generate`, `typecheck`, test target de KAN-12, build).

### Aceptacion del corte

- Escenarios criticos de transferencia pasan.
- No hay regresion en validaciones base de build/typecheck.
- Queda evidencia adjunta para Jira KAN-12 con comandos y resultados.
