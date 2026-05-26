# Playbook operativo: agentes remotos para Jira + GitHub (WMS)

## Objetivo
Resolver deuda técnica y pendientes de Jira/GitHub de forma remota, con trazabilidad completa, para sincronizar al entorno local al día siguiente sin fricción.

## Principios operativos (WMS)
- Cada agente trabaja con **1 ticket** de Jira y **1 branch** dedicado.
- Todo cambio debe cerrar el ciclo: análisis → implementación → pruebas → PR → evidencia.
- Ningún ticket se considera resuelto sin:
  - PR abierto con checklist de validación.
  - Evidencia de pruebas ejecutadas.
  - Enlace bidireccional Jira ↔ PR.

## Estructura de trabajo recomendada

### 1) Cola única de trabajo (fuente de verdad)
Usar un tablero único (Jira) con estas columnas:
1. `Ready-Remote`
2. `In Progress (Agent)`
3. `PR Open`
4. `Ready to Merge`
5. `Done`

Campos mínimos por ticket:
- Tipo: Bug / Tech Debt / Improvement.
- Riesgo: Bajo / Medio / Alto.
- Módulo: `app`, `lib`, `prisma`, `scripts`.
- Criterios de aceptación verificables.
- Comandos de validación requeridos.

### 2) Plantilla de branch y commits
- Branch: `feat/<JIRA-KEY>-short-slug` o `fix/<JIRA-KEY>-short-slug`.
- Commits semánticos:
  - `feat(<scope>): ... [JIRA-KEY]`
  - `fix(<scope>): ... [JIRA-KEY]`
  - `refactor(<scope>): ... [JIRA-KEY]`

### 3) Definición de listo por ticket (DoD)
Un ticket pasa a `Ready to Merge` solo si cumple:
- Lint y typecheck sin errores.
- Pruebas del flujo afectado en verde.
- Build exitoso cuando aplique.
- Migraciones/Prisma validadas cuando aplique.
- PR con resumen técnico, riesgos, rollback y evidencias.

## Runbook para agentes remotos

### Fase A — Triage (agente coordinador)
1. Extraer tickets en `Ready-Remote`.
2. Priorizar por impacto operativo:
   - P0: bloquea operación/ventas/despacho.
   - P1: riesgo funcional alto o deuda crítica.
   - P2: mejoras de mantenibilidad.
3. Agrupar por módulo para minimizar conflicto de merge.

### Fase B — Ejecución paralela (agentes implementadores)
Para cada ticket:
1. Crear branch.
2. Implementar cambio mínimo suficiente (no scope creep).
3. Ejecutar validación proporcional.
4. Abrir PR con plantilla estándar.
5. Mover ticket a `PR Open` y adjuntar evidencia.

### Fase C — Integración (agente revisor)
1. Revisar diffs de PR por riesgo.
2. Confirmar checklist DoD.
3. Pedir cambios si faltan pruebas o trazabilidad.
4. Aprobar y mover ticket a `Ready to Merge`.

### Fase D — Cierre diario (agente release)
1. Consolidar PRs aprobados.
2. Ordenar merge por dependencia técnica.
3. Publicar reporte de cierre:
   - tickets cerrados,
   - tickets bloqueados,
   - deuda residual y plan siguiente.

## Matriz de validación por tipo de cambio

### UI / rutas / componentes (`app/*`)
- `npm run lint`
- `npm run typecheck`
- prueba dirigida de flujo afectado
- `npm run build` (si cambia routing/rendering)

### Dominio / servicios (`lib/*`)
- `npm run lint`
- `npm run typecheck`
- pruebas del módulo o flujo de negocio

### Datos / Prisma (`prisma/*`)
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npm run test:postgres` (si toca lógica con DB)
- revisión de impacto en migraciones

## Plantilla mínima de PR
- **Contexto del ticket**: problema y alcance.
- **Qué se cambió**: lista concreta de archivos y comportamiento.
- **Validación ejecutada**: comandos + resultado.
- **Riesgos y rollback**: cómo revertir.
- **Evidencia**: capturas/logs enlazados.
- **Trazabilidad**: `JIRA-KEY`, links a ticket y PR.

## Sincronización local (día siguiente)

### Checklist de actualización local
1. `git fetch --all --prune`
2. `git checkout <rama-base>`
3. `git pull --ff-only`
4. Revisar PRs merged desde último corte.
5. Ejecutar validación base local:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
6. Si hubo cambios de Prisma:
   - `npm run prisma:generate`
   - validaciones DB requeridas.

### Política de conflictos
- Resolver primero conflictos de `prisma/*` y contratos de `lib/*`.
- Revalidar flujos sensibles: `production/requests`, `fulfillment`, `orders`.

## Indicadores de control (semanal)
- Lead time por ticket (Ready-Remote → Done).
- % tickets con retrabajo post-review.
- % PRs con validación completa en primer intento.
- Deuda técnica neta: creada vs cerrada.

## Backlog de deuda técnica (propuesta de etiquetas)
- `techdebt:risk-high`
- `techdebt:testing-gap`
- `techdebt:prisma-drift`
- `techdebt:performance`
- `techdebt:observability`

## Recomendación práctica para arrancar hoy
1. Seleccionar 5–10 tickets de mayor impacto operativo.
2. Ejecutar paralelo máximo de 2–4 agentes para evitar conflictos.
3. Exigir DoD completo desde el primer PR (evita deuda invisible).
4. Cerrar el día con reporte y plan del siguiente lote.
