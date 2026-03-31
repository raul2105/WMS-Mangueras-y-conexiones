# WMS Capabilities Status

Fecha de corte: 2026-02-12

## Implementado en codigo

- Catalogo maestro de productos y categorias.
- Almacenes y ubicaciones (creacion y detalle por almacen).
- Inventario por ubicacion con campos `quantity`, `reserved` y `available`.
- Recepcion (`IN`) con referencia documental y adjuntos.
- Picking (`OUT`) validando inventario disponible.
- Ajustes de inventario en servicio (`ADJUSTMENT`) por API interna.
- Ordenes de produccion con reserva y consumo de inventario por estado.
- Pruebas de integridad para `InventoryService`.

## Implementado en esta iteracion (KAN)

- `KAN-10`: alta de producto no crea inventario invalido sin ubicacion.
- `KAN-9`: validaciones server-side con Zod en `receive`, `pick` y `orders`.
- `KAN-26`: bitacora de auditoria (`AuditLog`) para acciones criticas.
- `KAN-11`: UI de ajustes de inventario (`/inventory/adjust`).
- `KAN-12`: transferencias internas atomicas (`/inventory/transfer` + `transferStock`).
- `KAN-13`: vista de kardex con filtros (`/inventory/kardex`).
- `KAN-14`: reconciliacion automatica de reservas en ordenes de produccion.

## Pendiente

- Flujo completo de solicitudes internas (KAN-15 a KAN-18).
- Reglas tecnicas de compatibilidad (KAN-19 a KAN-21).
- Compras/reabasto (KAN-22 a KAN-24).
- Auth/RBAC y KPI (KAN-25, KAN-27).
- E2E y migracion productiva (KAN-28, KAN-29).

## Nota operativa

Para habilitar `AuditLog` en la base local, aplicar migraciones:

```bash
npm run db:migrate
```
