# Fulfillment Operational Presets (KAN-56)

## Objetivo
Definir una clasificación operativa canónica para cola de pedidos de surtido con:
- preset primario único por precedencia;
- presets secundarios para explicación/analítica;
- trazabilidad por pedido (`reasons` y `facts`);
- compatibilidad total con `queue=*` legacy.

## Inputs operativos reutilizados
- Señales de cola existentes: `isOverdue`, `isDueToday`, `isPartial`, `isStale`, `isUnreleased`, `assemblyBlocked`.
- Estado de asignación: `assignedToUserId`.
- Etapa de flujo homologada: `flowStage`.
- Elegibilidad real de entrega: `canMarkDelivered`.
- Timestamps operativos: `lastOperationalUpdateAt`.

## Determinismo y timezone
- `evaluateOperationalPresets(input, options)` acepta:
  - `options.now`
  - `options.timezone` (default: `America/Mexico_City`)
  - `options.staleHours` (reutiliza umbral actual del caller; fallback explícito: `4`)
- El cálculo de `vencido` y `vence hoy` se hace contra día operativo por timezone de negocio.

## Definición de presets
- `BLOQUEADOS`: `isPartial || assemblyBlocked || isUnreleased`.
- `URGENTES`: `isOverdue || (isDueToday && (isUnreleased || isPartial || assemblyBlocked))`.
- `SIN_MOVIMIENTO`: `isStale`.
- `VENCEN_HOY`: `isDueToday && !URGENTES`.
- `SIN_ASIGNAR`: pedido en cola operativa activa y `assignedToUserId == null`.
- `LISTOS_PARA_ENTREGA`: `flowStage === "listo_entrega"` y `canMarkDelivered === true`.

## Precedencia (primario único)
1. `BLOQUEADOS`
2. `URGENTES`
3. `SIN_MOVIMIENTO`
4. `VENCEN_HOY`
5. `SIN_ASIGNAR`
6. `LISTOS_PARA_ENTREGA`

Los presets restantes que también apliquen se devuelven como `secondaryPresets`.

## Trazabilidad por pedido
Cada evaluación expone:
- `primaryPreset`
- `secondaryPresets`
- `reasons[]` con `{ code, message, evidence }`
- `facts` con contexto operativo

La generación de razones hace dedupe por `code` para evitar ruido redundante.

## Mapeo de transición legacy -> preset
Los filtros `queue=*` legacy **no cambian semántica** en KAN-56.  
Solo se habilita `preset=` en paralelo para transición gradual.

Referencias de alineación (no equivalencia 1:1):
- `queue=overdue` -> relacionado con `URGENTES`
- `queue=today` -> relacionado con `VENCEN_HOY` / `URGENTES`
- `queue=partial` -> relacionado con `BLOQUEADOS`
- `queue=stale` -> relacionado con `SIN_MOVIMIENTO`
- `queue=unreleased` -> relacionado con `BLOQUEADOS`
- `queue=assembly_blocked` -> relacionado con `BLOQUEADOS`
