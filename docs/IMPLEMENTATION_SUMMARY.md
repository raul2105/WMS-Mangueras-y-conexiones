# Resumen técnico de implementación

## Resumen

La rama `main` contiene un WMS orientado a operación local para catálogo, almacenes, inventario por ubicación y órdenes de producción. La arquitectura actual está centrada en App Router de Next.js, Prisma sobre SQLite y lógica de negocio en servicios de inventario reutilizables.

## Arquitectura actual

- Frontend y servidor en la misma aplicación Next.js usando App Router.
- Acceso a datos mediante Prisma Client.
- Persistencia local en SQLite (`prisma/dev.db`).
- Flujos operativos resueltos principalmente con server actions en páginas de `app/`.
- CI en GitHub Actions con lint, typecheck, build y validación Prisma.

## Dominios publicados en `main`

### Catálogo

- Modelo `Product` con `sku`, `referenceCode`, `imageUrl`, atributos JSON y relación opcional a `Category`.
- Consulta principal en `/catalog`.
- Alta de artículos en `/catalog/new`.
- Detalle de producto en `/catalog/[id]`.

### Almacenes y ubicaciones

- Modelo `Warehouse` con código único, estado y dirección.
- Modelo `Location` con código único, zona, pasillo, rack y nivel.
- Pantallas para listar almacenes, crear almacén, ver detalle y crear ubicaciones.

### Inventario

- Modelo `Inventory` por combinación `productId + locationId`.
- Campos operativos:
  - `quantity`: existencias físicas.
  - `reserved`: existencias reservadas.
  - `available`: existencias disponibles.
- Modelo `InventoryMovement` para entradas, salidas, transferencias y ajustes.
- Flujos publicados:
  - `/inventory/receive`
  - `/inventory/pick`
  - `/inventory`
  - `/inventory/[id]`

### Producción

- Modelo `ProductionOrder` con estados `BORRADOR`, `ABIERTA`, `EN_PROCESO`, `COMPLETADA` y `CANCELADA`.
- Modelo `ProductionOrderItem` ligado a producto y ubicación.
- Al pasar a `EN_PROCESO`, la orden reserva inventario.
- Al pasar a `COMPLETADA`, consume inventario y registra salida.
- Al cancelar, libera reservas disponibles.

## Servicios y reglas clave

### `InventoryService`

El servicio en `lib/inventory-service.js` concentra la lógica base de inventario:

- `receiveStock`
  - crea o incrementa inventario por ubicación
  - recalcula `available`
  - registra movimiento `IN`
- `pickStock`
  - valida existencia y stock disponible
  - decrementa inventario
  - registra movimiento `OUT`
- `adjustStock`
  - ajusta delta positivo o negativo
  - protege contra stock negativo
  - registra movimiento `ADJUSTMENT`

### Importación CSV

El script `scripts/import-products-from-csv.cjs`:

- valida encabezados y tipos
- hace upsert de productos por `sku`
- crea o vincula categorías
- crea almacén/ubicaciones por defecto cuando faltan
- reemplaza inventario por SKU de forma idempotente usando `adjustStock`

## Pruebas y validación

- `tests/inventory-integrity.test.ts` cubre recepción, picking, importación y unicidad de inventario.
- El pipeline de CI ejecuta:
  - lint
  - `tsc --noEmit`
  - build
  - `prisma validate`
- Para correr pruebas localmente en un checkout limpio primero hay que instalar dependencias.
- Estado verificado en esta ejecución:
  - `npm run test` pasa.
  - `npm run build` falla por un error de tipos preexistente en `app/catalog/[id]/page.tsx`.

## Implementado vs parcial vs pendiente

Implementado en `main`:

- Catálogo
- Almacenes
- Ubicaciones
- Recepción
- Picking
- Producción
- Importación CSV

Parcial en `main`:

- Ajustes de inventario: existe la regla en servicio, no la pantalla dedicada.
- Transferencias: existe soporte de tipo de movimiento, no el flujo operativo completo.

Pendiente en `main`:

- Kardex/exportación
- Compras/proveedores
- Auth/RBAC
- Auditoría formal

## Nota de publicación

La documentación actual se restringe deliberadamente a la rama `main`. El workspace local del usuario contiene trabajo adicional no integrado; ese trabajo no debe documentarse aquí como si ya estuviera publicado.
