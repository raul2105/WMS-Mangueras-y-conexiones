# Runbook de validación operativa — 2026-08-01

## Objetivo

Validar el lote `ensamble → staging → preparado para entrega` y el ownership
físico de almacén, sin cerrar Jira por evidencia parcial.

## Control previo obligatorio

Antes de ejecutar pruebas con escritura en AWS se debe registrar explícitamente:

- entorno y URL exacta;
- identidad y roles utilizados;
- almacén, SKU y cantidades de prueba;
- pedido/documento que se creará o modificará;
- reservas, movimientos, tareas y auditorías esperadas;
- tratamiento de limpieza o conservación de los datos generados.

Si alguno falta, sólo se ejecutan pruebas locales, lectura o contratos unitarios.

## Escenarios

| ID | Escenario | Resultado esperado | Evidencia mínima | Tickets |
|---|---|---|---|---|
| V1 | Promesa con reserva existente | La promesa muestra solicitado, disponible y reservado; una cantidad insuficiente no confirma | Captura/UI, auditoría de revalidación, inventario antes/después | KAN-128 |
| V2 | Pedido directo | Confirmar crea lista draft/reserva; liberar habilita claim; claim y scan válido permiten surtir; destino es staging | Pedido, pick list, tarea, movimiento, auditoría | KAN-127, KAN-131 |
| V3 | Pedido sólo configurado | Cada línea tiene orden ligada; ensamble pendiente bloquea preparación; `COMPLETADA` habilita el handoff | Pedido, orden de producción, estado de ensamble, pantalla de retorno | KAN-134 |
| V4 | Pedido mixto | Directo y ensamble avanzan independientemente; preparación sólo aparece cuando ambos están completos | Dos trabajos, estados, ubicación de staging, auditoría | KAN-130, KAN-134 |
| V5 | Ownership físico | Manager asigna tarea `MANAGER_REQUIRED`; operador asignado puede tomarla; otro operador recibe bloqueo | `assignedToUserId`, `claimedByUserId`, bitácora | KAN-131 |
| V6 | Preparado para entrega | Sólo almacén/manager/admin con ownership físico puede registrar ubicación; ventas distingue responsable comercial/físico | `preparedForDelivery*`, ubicación, usuario, UI | KAN-132 |
| V7 | Excepción | Faltante, ensamble incompleto o excepción abierta bloquean preparación y entrega; resolución queda auditada | Excepción, motivo, resolución, intento bloqueado | KAN-127, KAN-130 |
| V8 | Idempotencia y concurrencia | Repetir preparar/entregar no duplica eventos ni movimientos; dos claims no se pisan | Conteo de registros y auditorías | KAN-127, KAN-132 |

### V1 (reconciliación controlada; no es un E2E de escritura en CI)

| Componente | Path |
|---|---|
| **Regla** | `reservedQty - pickedQty - shortQty` debe coincidir con `Inventory.reserved` por producto y ubicación |
| **Servicio** | `reconcileSalesRequestReservations` con `DRY_RUN` o `APPLY` explícito |
| **Endpoint** | `/api/admin/reconciliation/sales-reservations`, deshabilitado por defecto y protegido por `inventory.adjust` |
| **Pedido acotado** | `PI-2026-0010`; no se corrigen otros pedidos automáticamente |
| **E2E** | `tests/e2e/kan128-aws-readonly-evidence.spec.ts` sólo lectura; no crea ni elimina datos AWS |
| **Pruebas de lógica** | `tests/sales/reservation-reconciliation.unit.test.ts` |

> **Estado**: la prueba V1 anterior que escribía directamente con Prisma fue retirada. Primero se ejecuta `DRY_RUN`, después la corrección acotada y finalmente el E2E AWS de sólo lectura.

## Indicadores L07 que deben contrastarse

El dashboard reporta una ventana móvil de 30 días:

- `Fill-rate`: unidades surtidas / unidades solicitadas en tareas directas cerradas.
- `Exactitud`: tareas directas cerradas sin faltante / tareas directas cerradas.
- `Ciclo de surtido`: desde `pulledAt` hasta `preparedForDeliveryAt`.
- `Ciclo de OT`: desde creación de la OT hasta `closedAt`.

Si no existe evidencia suficiente, el valor esperado es `—`. No se debe convertir
un cero por falta de datos en una conclusión operativa.

## Criterio de aceptación del lote

El lote queda listo para revisión cuando:

1. V1–V8 tienen resultado y evidencia anexados.
2. No existen reservas o movimientos inesperados.
3. La pantalla no confunde responsable comercial con responsable físico.
4. El pedido mixto no puede saltar a preparado con una sola rama completa.
5. Los mensajes de bloqueo identifican la siguiente acción y su propietario.
6. `npm run typecheck`, `npm run lint`, `npm run test:unit` y `npm run build` siguen verdes.
7. L07 se contrasta contra una muestra operativa y L08 confirma que el conteo de
   OCs por recibir no se presenta como urgencia si no existe relación de demanda.

## Registro 5 Why's para cualquier discrepancia

```text
Observación:
Impacto en almacén/ventas:
Why 1:
Why 2:
Why 3:
Why 4:
Why 5 / causa controlable:
Corrección aplicada:
Ticket y dependencia:
Evidencia:
Resultado: corregido / pendiente / bloqueado
```

## No cerrar todavía

KAN-128, KAN-131, KAN-132, KAN-133, KAN-134, KAN-130 y KAN-125 requieren además
PR/SHA integrado, migración aplicada en el entorno objetivo y validación autenticada
por rol. El runbook no autoriza escrituras ni limpieza sobre AWS por sí mismo.

**KAN-128**: En progreso - reconciliación implementada; falta ejecutar `DRY_RUN`, aplicar únicamente la corrección autorizada para `PI-2026-0010` y completar el E2E AWS read-only.
