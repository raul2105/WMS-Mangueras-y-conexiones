# Project Context Template (WMS-SCMayher)

## Objetivo del repo
Sistema WMS para mangueras y conexiones con foco operativo en PostgreSQL y despliegue web AWS.

## Arquitectura resumida
- Frontend/Backend: Next.js App Router + React + TypeScript.
- Persistencia canonica: Prisma sobre PostgreSQL (`prisma/postgresql/schema.prisma`).
- Automatizacion operativa: scripts en `scripts/` para validacion, despliegue y sincronizacion.

## Entrypoints clave
- `app/` rutas y UI principal.
- `lib/` dominio, servicios y reglas de negocio.
- `prisma/postgresql/` schema y migraciones canonicas.
- `.github/workflows/ci.yml` quality gate de CI.

## Comandos canonicos
- `npm run dev`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npm run lint`
- `npm run typecheck`
- `npm run test:postgres`
- `npm run build`

## Validaciones necesarias
- Ejecutar validaciones proporcionales al alcance del cambio.
- Confirmar integridad de flujo afectado y no solo compilacion.

## Riesgos abiertos
- Drift entre documentacion historica y estado real del repo.
- Costos cloud por configuraciones fuera de baseline low-cost.
- Riesgo de regresion en flujos cross-view de produccion si no hay prueba dirigida.

## Zonas sensibles / regresiones frecuentes
- Flujos de `production/requests`, `fulfillment` y `orders`.
- RBAC y guards de rutas/acciones.
- Cambios Prisma/schema y efectos en runtime/CI.
