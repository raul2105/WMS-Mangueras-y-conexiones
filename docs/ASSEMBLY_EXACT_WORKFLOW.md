# Assembly Exact Workflow (3 piezas)

## Uso operativo

1. Ir a `Producción` -> `Nueva orden exacta`.
2. Configurar:
   - conexión de entrada
   - manguera
   - conexión de salida
   - longitud y cantidad
3. Ejecutar `Previsualizar disponibilidad`.
4. Solo si el resultado es **exacto**, ejecutar `Crear orden exacta`.
5. En detalle de orden:
   - `Liberar surtido`
   - confirmar cada tarea de pick por ubicación
   - `Cerrar y consumir` para consumo final desde WIP
6. Si aplica, `Cancelar orden` libera reservas no surtidas.

## Reglas implementadas

- La orden exacta no se crea con faltantes.
- `reserved`: apartado en ubicación origen.
- `picked_to_wip`: movido a ubicación WIP.
- `consumed`: consumo final desde WIP.
- Se registra trazabilidad por documento (`ASSEMBLY_ORDER`) y línea.
- Cada tarea de picking mantiene ubicación exacta de origen.

## Integración

- Servicios de dominio:
  - `lib/assembly/availability-service.ts`
  - `lib/assembly/work-order-service.ts`
  - `lib/assembly/picking-service.ts`
- UI mínima:
  - `app/production/orders/new/page.tsx`
  - `app/production/orders/[id]/page.tsx`
  - `app/production/orders/page.tsx`
  - `app/production/page.tsx`

## Criterios de aceptación cubiertos

- Configuración de orden de ensamble con 3 piezas.
- Propuesta y uso de inventario real por ubicación.
- Lista de surtido por ubicación exacta.
- Flujo separado: reserva -> picking a WIP -> consumo final.
- Distinción de estados: reservado, surtido a WIP, consumido.
- Trazabilidad operativa persistida.

## Riesgos y casos borde

- Si una tarea de pick se confirma parcial, la orden no debe cerrarse hasta completar WIP requerido.
- Las suites de pruebas que mutan SQLite en paralelo pueden competir por la misma DB local.
- En esta iteración, el detalle de orden `GENERIC` quedó en modo consulta (sin edición operativa).
