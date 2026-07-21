# Auditoría operativa por rol — 2026-07-11

## Alcance y evidencia

La revisión se realizó en `http://localhost:3002` con las sesiones reales de
`operator@scmayher.com`, `manager@scmayher.com` y `sales@scmayher.com`.
Las capturas se encuentran en `output/playwright/role-audit-2026-07-11/`.
No se modificaron datos de usuarios. La prueba E2E de composición creó y limpió
una fixture temporal con prefijo propio.

## Recorrido

| Rol | Pantallas revisadas | Salud |
| --- | --- | --- |
| Ventas | Inicio, Clientes, Catálogo, Todos los pedidos, Nuevo pedido y elección de línea | Parcial: la captura está más clara; el tablero aún mezcla seguimiento comercial y estados operativos. |
| Operador | Inicio, Ejecución, Inventario, Compras y Catálogo | Requiere corrección de foco: las cifras de Inicio no concuerdan con la cola y hay accesos comerciales ajenos a la ejecución física. |
| Manager | Inicio, Pedidos, Nuevo pedido, Catálogo, Almacenes, Inventario, Compras y Auditoría | Parcial: la revisión, asignación, Compras y búsqueda de clientes existentes son accesibles; falta la E2E completa de la cadena. |

## Hallazgos priorizados

### P0 — coherencia operativa antes de cerrar el flujo

1. **Inicio Operador y Ejecución no hablan del mismo trabajo.** Inicio muestra
   `5` pickings pendientes y `3` ensambles activos, mientras que Ejecución
   muestra `0 de 0 pedidos` y una cola vacía. Debe unificarse la fuente o
   explicarse la diferencia mediante buckets físicos accionables.
2. **La evidencia E2E aún se detiene en la creación.** Está probada la orden
   con dos ensambles y un producto directo; falta probar asignación Manager →
   toma/Ejecución Operador → surtido/ensamble → entrega Ventas.

> Validación posterior: Manager sí puede buscar y seleccionar `Cliente prueba`.
> La observación inicial ocurrió antes de que terminara el debounce de búsqueda;
> no requiere cambio de RBAC.

### P1 — reducir ruido y ajustar cada rol a su trabajo

4. **Operador ve una narrativa comercial en Catálogo** (`disponibilidad →
   equivalencias → crear pedido`) aunque su rol es surtir, recibir y ensamblar.
   Reemplazarla por ficha técnica y existencia por ubicación; ocultar creación
   de pedido y equivalencias comerciales.
5. **Compras del Operador ofrece el mismo tablero de creación que Manager.**
   Separar la recepción física (`Recibir OC`, pendientes, ubicación destino)
   de crear/confirmar/cerrar órdenes de compra.
6. **Inicio Ventas presenta estados comerciales crudos y `N/D` en pedidos
   recientes.** Mostrar solo el estado UX y la siguiente acción; los pedidos
   entregados/cancelados deben permanecer en historial, no como prioridad.

### P2 — consistencia visual

7. Inventario concentra acciones, cuatro filtros y Trace ID antes del listado.
   Dejar búsqueda y acción física principal visibles; mover filtros avanzados y
   resolución de trace a un panel secundario.
8. Mantener las tarjetas como resumen, no como instrucciones: Manager debe
   priorizar `Revisar pedidos`, `Asignar vendedor` y `Resolver bloqueos`; el
   resto puede quedar como herramientas secundarias.

## Lote recomendado

1. Corregir el contrato de cola Operador y sus métricas de Inicio.
2. Crear una E2E serial, con fixture aislada, que cubra asignación, ejecución
   física y entrega; entonces ejecutar también móvil y accesibilidad.
3. Aplicar el recorte de superficies por rol a Catálogo/Compras/Inventario.

## Validación actual

- `31` pruebas unitarias y de contrato aprobadas.
- E2E Chromium aprobada: pedido con producto directo y dos ensambles.
- Matriz Chromium aprobada para Admin, Manager, Operador y Ventas.
- La preparación para cierre total permanece bloqueada hasta completar el
  recorrido físico y resolver los hallazgos P0.
