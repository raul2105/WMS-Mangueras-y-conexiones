# QA Nightly Handoff — 2026-05-26

## Objetivo de la corrida
Aumentar la evidencia ejecutable para integración segura y reconciliar tickets Jira de QA/testing contra el estado real del repositorio.

## Tickets Jira revisados (en repositorio)
- KAN-48, KAN-49, KAN-50, KAN-51 (`docs/jira/WMS_KAN_48_51_RECONCILIATION.md`).
- KAN-53 (prioridad abierta de QA/regresión) (`docs/WMS_CAPABILITIES_STATUS.md`).
- KAN-77 (riesgo operativo aún abierto) (`docs/WMS_CAPABILITIES_STATUS.md`, `docs/KAN-77_closed.md`).

## Contraste Jira vs código (corte técnico)

### Implementado con evidencia técnica fuerte
- **KAN-49**: implementación + integración RBAC/servicio de usuarios con evidencia de tests de integración (`tests/users/*`, `tests/rbac/*`).
- **KAN-51**: flujo asignación/toma/entrega con validación de reglas de servicio y flujo interno (`tests/sales-request-service.test.ts`, `tests/sales-internal-order-flow.test.ts`).

### Implementado pero con validación operativa todavía débil/parcial
- **KAN-48**: cobertura contractual/integración amplia + e2e específico, pero sigue pendiente validación administrativa/operativa final en Jira.
- **KAN-50**: buena cobertura backend/integración, pero falta evidencia visual-operativa E2E robusta del tablero.

### Riesgos abiertos priorizados
- **KAN-53**: deuda de QA/regresión transversal aún vigente según estado consolidado.
- **KAN-77**: no hay cierre defendible punta a punta; mantener en seguimiento activo.

## Cambios atendidos en esta corrida
1. Se amplió el perfil canónico de regresión PostgreSQL para incluir dos suites de contrato del dashboard que no estaban en el gate:
   - `tests/dashboard/home-fulfillment.contract.test.ts`
   - `tests/dashboard/fulfillment-priority-queue.contract.test.ts`
2. Resultado: más cobertura enfocada en flujo sensible de tablero/fulfillment dentro del comando estándar de regresión.

## Inconsistencias Jira vs código detectadas
- Existen tickets con estado recomendado “Validate manually” pese a evidencia técnica relevante en repo (KAN-48/KAN-50); esto no es inconsistencia de código, pero sí brecha de cierre administrativo/operativo.
- KAN-77 mantiene narrativa de cierre histórico en documento, mientras el estado operativo consolidado lo considera no reconciliado y en curso; debe prevalecer la lectura de riesgo activo.

## Pruebas agregadas o ajustadas
- No se creó nueva suite; se **incorporaron suites existentes críticas al gate de regresión** para hacer visible su ejecución en el circuito estándar de QA.

## Validaciones ejecutadas esta noche
- Intento de ejecución focalizada de nuevas suites incorporadas al gate:
  - `node scripts/db/run-vitest-postgres.cjs run tests/dashboard/home-fulfillment.contract.test.ts tests/dashboard/fulfillment-priority-queue.contract.test.ts`
  - **Bloqueado** por falta de `DATABASE_URL` PostgreSQL en el entorno.

## Qué cambios de otros frentes se alcanzaron a validar
- Validación documental/técnica de trazabilidad sobre KAN-48..51 y prioridades KAN-53/KAN-77 contra evidencia del repositorio.
- Ajuste del gate de regresión para reforzar evidencia reusable mañana.

## Riesgos restantes
1. Falta de ejecución real de regresión PostgreSQL en este entorno por dependencia de `DATABASE_URL`.
2. Falta de smoke/E2E operativa de tablero (KAN-50) y ciclo visual completo de algunos flujos.
3. Brecha administrativa Jira: tickets con evidencia técnica podrían no estar cerrados con evidencia publicada formalmente.

## Orden recomendado de integración mañana
1. Levantar `DATABASE_URL` PostgreSQL y ejecutar `npm run test:regression:postgres` completo.
2. Ejecutar smoke operativo web (`npm run smoke:web -- --base-url <url-dev>`), conservando salida.
3. Publicar evidencia (SHA + checks + comandos + resultados) en Jira KAN-48/KAN-50/KAN-53.
4. Mantener KAN-77 como riesgo abierto hasta evidencia ejecutable de punta a punta.
