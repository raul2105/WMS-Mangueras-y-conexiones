# Testing Guide (PostgreSQL Regression)

Este repositorio usa PostgreSQL como base canónica de pruebas de backend.

## Prerrequisitos locales

- Node.js 22+
- PostgreSQL local o contenedor en `127.0.0.1:5432`
- `DATABASE_URL` con formato `postgres://` o `postgresql://`

Ejemplo:

```powershell
$env:DATABASE_URL="postgresql://ci:ci@127.0.0.1:5432/wms?schema=public"
```

## Comandos de preparación

```bash
npm run env:postgres:check
npm run env:postgres:tcp
npm run prisma:validate
npm run prisma:generate
npm run db:push
```

`env:postgres:check` valida formato/campos de `DATABASE_URL`.  
`env:postgres:tcp` valida además conectividad TCP real al host/puerto.

## Suites principales

```bash
npm run test:rbac
npm run test:customers:contracts
npm run test:customers:postgres
npm run test:sales:service
npm run test:regression:postgres
```

`test:regression:postgres` ejecuta un set determinístico para:
- KAN-48 customers
- KAN-49 users admin
- KAN-50 fulfillment dashboard
- KAN-51 assignment/pull/delivery
- RBAC y AuditLog crítico

## CI

El workflow de CI levanta PostgreSQL efímero y ejecuta este gate requerido:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run prisma:validate`
4. `npm run prisma:generate`
5. `npm run db:push`
6. `npm run test:regression:postgres`
7. `npm run build`

Sin secretos productivos ni data productiva.

Tiempo esperado del gate `quality` en CI: ~10-25 min (depende del runner y carga).

## Required vs optional checks

- Required para merge de PR:
  - `Quality Gate (required)`
- Optional / informativos:
  - `Security Audit (optional)` (no bloqueante)
  - `Smoke Published Links (optional, push only)` (no se ejecuta en PR)

## Ruta canónica KAN-29 (local -> CI -> deploy DEV)

Secuencia operativa recomendada para validar entorno/migración/despliegue sin falsos verdes:

```bash
npm run env:postgres:check
npm run env:postgres:tcp
npm run prisma:validate
npm run prisma:generate
npm run db:push
npm run test:regression:postgres
npm run build
npm run deploy:aws:web
npm run smoke:web -- --base-url <cloudfront-dev-url>
```

Para smoke auth web opcional:

```powershell
$env:WMS_SMOKE_AUTH_EMAIL="usuario@dominio.com"
$env:WMS_SMOKE_AUTH_PASSWORD="******"
npm run smoke:web -- --base-url <cloudfront-dev-url>
```

Si faltan credenciales de auth, `smoke:web` reporta `SKIPPED` explícito y no debe marcarse como validación completa de login.

## Evidencia mínima reproducible

- Local PostgreSQL:
  - `env:postgres:check`, `env:postgres:tcp`, `prisma:*`, `db:push`, `test:regression:postgres`, `build`.
- CI:
  - `Quality Gate (required)` con el orden definido en `.github/workflows/ci.yml`.
- Deploy DEV web:
  - salida de `deploy:aws:web` + `smoke:web` contra URL real de CloudFront.

Nota de alcance: `mobile staging` es un entorno intermedio móvil útil para su propio flujo, pero no reemplaza el smoke web de KAN-29.

## Troubleshooting

- Error `DATABASE_URL es requerido`:
  - Define `DATABASE_URL` antes de correr pruebas.
- Error `DATABASE_URL debe iniciar con postgres://`:
  - Corrige el scheme.
- Error de conexión TCP:
  - Verifica que PostgreSQL esté activo y escuchando en `host:port` del `DATABASE_URL`.
- Error de schema mismatch:
  - Ejecuta `npm run db:push` después de `prisma:generate`.

### Cobertura KAN-53 (regresión PostgreSQL)

`test:regression:postgres` incluye cobertura para:
- `customers.view` / `customers.manage` (contratos + runtime branch con fallback manual).
- `users.manage` (admin service + guardas RBAC).
- snapshot `customerId` + `customerName` y pedidos históricos sin `customerId`.
- segmentación de visibilidad/operación sales por `assignedToUserId`.
- entrega al cliente y bloqueos de flujo antes de completar condiciones.
