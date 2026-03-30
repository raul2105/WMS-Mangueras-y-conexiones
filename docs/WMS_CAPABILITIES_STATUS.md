# Estado de capacidades WMS

Fecha de corte: 2026-03-30

Este documento refleja el estado real de la rama `main`.

## Matriz de capacidades

| Área | Estado | Evidencia en `main` | Notas |
| --- | --- | --- | --- |
| Catálogo | Implementado | `/catalog`, `/catalog/new`, `/catalog/[id]` | Alta de productos, categorías, atributos JSON y consulta de stock agregado. |
| Almacenes | Implementado | `/warehouse`, `/warehouse/new`, `/warehouse/[id]` | Gestión de almacenes con métricas y detalle. |
| Ubicaciones | Implementado | `/warehouse/[id]/locations/new` | Alta de ubicaciones por almacén y jerarquía lógica. |
| Inventario por ubicación | Implementado | `Inventory`, `Location`, `Warehouse` en Prisma | Stock físico, reservado y disponible por producto/ubicación. |
| Recepción | Implementado | `/inventory/receive` | Entrada con referencia, notas y adjuntos. |
| Picking | Implementado | `/inventory/pick` | Salida validando stock disponible en ubicación específica. |
| Producción | Implementado | `/production/orders` y detalle | Reserva al pasar a `EN_PROCESO`, consumo al completar y liberación al cancelar. |
| Importación CSV | Implementado | `scripts/import-products-from-csv.cjs` | Upsert de productos/categorías y ajuste de inventario por ubicación. |
| Pruebas de inventario | Implementado | `tests/inventory-integrity.test.ts` | Integridad básica de recepción, picking e importación. |
| Ajustes de inventario | Parcial | `InventoryService.adjustStock`, enum `ADJUSTMENT` | Existe a nivel de servicio, no hay pantalla dedicada en `main`. |
| Transferencias internas | Parcial | enum `TRANSFER` | Preparado en modelo de movimientos, sin flujo UI ni servicio específico en `main`. |
| Kardex / exportación | Pendiente | Sin ruta en `main` | No publicado en esta rama. |
| Compras / proveedores | Pendiente | Sin modelos ni rutas en `main` | Existe trabajo local fuera de `main`, pero no forma parte de esta publicación. |
| Auth / RBAC | Pendiente | Sin integración | No implementado en `main`. |

## Hallazgos relevantes

- La documentación previa marcaba como implementadas o en curso capacidades que no coinciden con el código actual de `main`.
- El workspace local del usuario contiene cambios adicionales que no forman parte de esta rama publicada.
- El estado funcional debe validarse contra rutas `app/`, modelos Prisma, scripts y pruebas, no contra roadmaps históricos.

## Estado de pruebas

- `npm run test` pasa en esta rama después de instalar dependencias.
- `npm run build` falla hoy en `main` por un error de tipos existente en `app/catalog/[id]/page.tsx`.
- En el workspace local del usuario existe una falla pendiente adicional sobre `InventoryServiceError.name`, pero ese cambio no pertenece a esta rama `main`.
