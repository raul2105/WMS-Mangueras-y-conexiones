# Reconciliación AWS de reservas — KAN-128

Fecha de ejecución: 2026-08-06
Fuente: PostgreSQL AWS RDS canónico (`wms-web-dev-pg`)
Pedido acotado: `PI-2026-0010`

## Evidencia previa

El `DRY_RUN` detectó una única diferencia:

| Producto | Ubicación | Esperada | Real | Diferencia |
|---|---|---:|---:|---:|
| `DEV-ASM-HOSE-DN10-R2AT` | ubicación de surtido del pedido | 1 | 0 | +1 |

No se encontraron otros pedidos, tareas o movimientos creados durante la ventana auditada del 5 de agosto (hora de Ciudad de México). Sí existían las auditorías de liberación y reclamación del picking.

## Corrección aplicada

La aplicación se ejecutó con el servicio de inventario, usuario `SYSTEM_ADMIN`, motivo explícito y alcance limitado a `PI-2026-0010`.

- No se modificó `quantity`.
- No se borraron registros.
- No se modificó ningún otro pedido.
- Se generó movimiento `663d3d39-bccb-41e2-a60c-78dd4d1139dd` de tipo `ADJUSTMENT`, cantidad física `0`, asociado al pedido.
- Se generó auditoría `1636154b-86d9-4e6e-9aaa-d8da9c945c97` con acción `RECONCILE_ORDER_RESERVATIONS`.

## Verificación posterior

| Control | Resultado |
|---|---|
| `Inventory.quantity` | 15 |
| `Inventory.reserved` | 1 |
| `Inventory.available` | 14 |
| `PickTask.reservedQty` | 1 |
| `PickTask.pickedQty` | 0 |
| `PickTask.status` | `PENDING` |
| `PickList.status` | `IN_PROGRESS` |
| Pedido | `CONFIRMADA` |
| Preparado para entrega | No |
| Entregado | No |
| Segundo `DRY_RUN` | `alreadyConsistent=true` |

## Validación de interfaz

El E2E AWS de sólo lectura pasó después de la corrección, verificando:

- Ventas ve la promesa comercial.
- Almacén ve el mismo pedido en etapa `En proceso`.
- El propietario físico `Operador Almacen` permanece visible.

La corrección no constituye surtido físico ni validación de entrega.
