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

## Compras / correo OC
- Contrato vigente: asunto `Orden de Compra {folio} - WMS Mangueras y Conexiones`.
- Cuerpo: texto plano en español, generado desde la OC oficial congelada y su PDF oficial.
- Destinatario: email congelado del snapshot oficial; fallback al email vivo del proveedor solo si el snapshot está vacío.
- Estados: `NOT_SENT`, `SENT`, `RESENT`, `FAILED`.
- Historial: `PurchaseOrderEmailAttempt` registra cada intento futuro; KAN-94 no envía correo real.
- UI: el botón de envío se muestra deshabilitado con nota explícita de que KAN-85 habilitará el transporte real.

## Operacion remota
- Ver `docs/ai/remote-agents-jira-github-playbook.md` para ejecucion diaria con agentes sobre Jira/GitHub.
