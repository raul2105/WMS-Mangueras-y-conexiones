# ADR-002: Capa movil AWS sobre WMS local maestro

**Estado:** Aceptado  
**Fecha:** 2026-04-07  
**Decisores:** Tech Lead + Arquitectura

## Contexto

El WMS actual opera con Next.js 16, TypeScript y Prisma, usando PostgreSQL como base canónica del runtime web/AWS.  
SQLite se mantiene únicamente para compatibilidad de runtime portable/legado.  
La operacion de piso (inventario maestro, recepcion, picking, ensamble y trazabilidad) no debe migrarse a cloud.

Se requiere habilitar movilidad de bajo costo con AWS para:

- consulta de inventario (read model),
- solicitudes de ensamble (intake),
- borradores de productos nuevos (intake).

## Decision

Se adopta arquitectura hibrida con estas reglas:

1. **Local sigue siendo source of truth** para operacion critica y decisiones finales.
2. **Cloud solo sera edge/mobile layer** con:
- S3 + CloudFront para PWA,
- Cognito para identidad,
- API Gateway HTTP API + Lambda para API movil,
- DynamoDB y SQS diferidos a fases posteriores (no en la base de fase 1),
- CloudWatch para logs y metricas.
3. Contratos moviles versionados en `/v1/mobile/*`.
4. Toda capacidad cloud entra controlada por feature flags y debe ser reversible sin afectar operacion local.

## Alcance por fase

- **Fase 0:** baseline, contratos, flags, matriz RBAC movil.
- **Fase 1:** PWA shell + auth Cognito + API minima (`health`, `version`, `me/permissions`).
- **Fase 2:** inventario remoto consultable y sync outbound.
- **Fase 3:** intake remoto (`assembly-requests`, `product-drafts`) e inbound hacia local.

## Consecuencias

### Positivas

- Se habilita movilidad sin redisenar el monolito local.
- Costos fijos iniciales bajos (sin RDS/Aurora/NAT/ECS).
- Camino preparado para escalar endpoints puntuales sin romper contratos.

### Negativas / Tradeoffs

- Habra dos planos (local y cloud) y se requiere control estricto de sincronizacion.
- Cognito no debe confundirse con autorizacion de negocio local.
- Se agrega disciplina de flags y versionado de API desde el inicio.

## Restricciones explicitas

- No migrar core operativo local a cloud.
- No introducir ECS, Aurora, RDS Proxy, NAT Gateway ni microservicios completos en fase temprana.
- No reestructurar el repo completo; cambios incrementales y por PR pequenos.

## Rollback

- Apagar `mobile_enabled` y flags derivadas desactiva la capa movil.
- El WMS local continua operando sin dependencia del plano cloud.
