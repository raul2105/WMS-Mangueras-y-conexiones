# Levantamiento UX/UI de flujos operativos

Fecha: 2026-07-09
Alcance: revisión visual y funcional de superficies operativas por rol, sin modificar componentes de diseño ni datos de AWS.

## Resultado ejecutivo

La aplicación ya separa las entradas principales de Ventas, Operación de almacén y Gerencia, y la navegación respeta el rol autenticado. El problema principal no es la ausencia de pantallas: es que el mismo proceso se explica y representa con demasiadas capas de texto, estados y tarjetas. Esto aumenta la carga cognitiva y hace que un usuario operativo tenga que leer el flujo antes de actuar.

La recomendación es evolucionar hacia una experiencia basada en **siguiente acción**, con información secundaria progresiva y un lenguaje distinto para cada rol:

- Ventas: capturar, validar disponibilidad y confirmar.
- Almacén: tomar trabajo, surtir/ensamblar, verificar y dejar listo.
- Gerencia: detectar atrasos/bloqueos y reasignar.

No se implementaron cambios visuales durante este levantamiento.

## Evidencia capturada

Las capturas se obtuvieron en el entorno local con usuarios de prueba por rol.

| Evidencia | Rol | Superficie | Observación principal |
|---|---|---|---|
| [01 warehouse queue](evidence/operational-flow-2026-07-09/01-warehouse-execution-queue.png) | WAREHOUSE_OPERATOR | `/production/requests` | Cola vacía correctamente presentada; los filtros horizontales requieren revisar comportamiento responsive. |
| [02 inventory receive](evidence/operational-flow-2026-07-09/02-inventory-receive.png) | WAREHOUSE_OPERATOR | `/inventory/receive` | Recepción estructurada, pero con demasiadas instrucciones y campos secundarios visibles de inicio. |
| [03 sales home](evidence/operational-flow-2026-07-09/03-sales-home.png) | SALES_EXECUTIVE | `/home/sales` | Buena entrada comercial; tarjetas recientes presentan texto lavado y datos `N/D` poco accionables. |
| [04 new order empty](evidence/operational-flow-2026-07-09/04-new-order-empty.png) | SALES_EXECUTIVE | `/production/requests/new` | Mayor concentración de fricción: instrucciones repetidas, resumen persistente y estado obligatorio duplicado. |
| [05 manager home](evidence/operational-flow-2026-07-09/05-manager-home.png) | MANAGER | `/home/manager` | La pantalla distingue métricas de atraso/bloqueo y acciones de gestión; necesita priorizar la excepción sobre el menú. |

## Hallazgos por flujo

### 1. Ventas — Inicio y Nuevo Pedido

**Fortalezas observadas**

- La acción `Nuevo Pedido` es visible y está acompañada por accesos de seguimiento, clientes y equivalencias.
- El formulario bloquea la creación operativa si no existe un producto resuelto; esto protege el handoff hacia almacén.
- El resumen persistente hace visible el avance del proceso.

**Fricciones visuales y de experiencia**

- `Nuevo pedido comercial`, el texto introductorio, las instrucciones de `Cliente` y `Datos del pedido`, y el resumen lateral comunican parcialmente la misma información.
- El usuario ve simultáneamente el formulario, herramientas de apoyo, pasos, pendientes, badge de datos obligatorios y botón deshabilitado.
- El estado `Cliente pendiente`, `Almacén pendiente` y `Fecha pendiente` compite con el estado del formulario; conviene tener una sola fuente visual de verdad.
- En Inicio Ventas, `N/D` no ayuda a decidir y los textos de pedidos recientes tienen contraste visual débil.

**Dirección propuesta**

- Mantener una sola columna de captura como foco principal.
- Convertir el resumen en una barra de progreso compacta que solo muestre el siguiente requisito.
- Mover contexto, equivalencias y herramientas a paneles secundarios.
- Mostrar el pedido reciente con cliente, etapa y próxima acción, no con campos vacíos.

### 2. Almacén — Cola de ejecución

**Fortalezas observadas**

- El rol llega a una cola operativa específica y no a una pantalla comercial.
- Existen filtros por estado y responsabilidad, además de un estado vacío explícito.

**Fricciones visuales y de experiencia**

- `Mis pedidos` y `Tomar pedido` son conceptos heredados de ventas y pueden confundir con la propiedad física del trabajo.
- Los filtros en una sola fila pueden desbordar o perder legibilidad en anchos menores.
- En una cola vacía no se comunica la próxima acción del operador: revisar otra cola, escanear una entrada o esperar asignación.

**Dirección propuesta**

- Sustituir filtros comerciales por buckets físicos: `Por surtir`, `En proceso`, `Bloqueados`, `Listos para verificar`, `Listos para entrega`.
- En cada tarjeta, hacer dominante la próxima acción física y mostrar responsable/ubicación como metadatos.
- En estado vacío, incluir una acción contextual según el rol y el turno.

### 3. Almacén — Recepción

**Fortalezas observadas**

- El flujo está secuenciado y contiene los datos necesarios para registrar una entrada.
- Hay soporte para escaneo, destino, documento de referencia y evidencia.

**Fricciones visuales y de experiencia**

- Los cuatro pasos se perciben como un formulario largo antes de iniciar la operación.
- Datos esenciales (`SKU`, cantidad, almacén, ubicación) aparecen junto con evidencia, alias y notas.
- La ayuda textual explica el proceso varias veces; para un operador recurrente debería ser secundaria.

**Dirección propuesta**

- Primer plano: escanear/buscar artículo, cantidad y destino.
- Segundo plano: documento, archivo, alias y notas bajo `Agregar evidencia`.
- Confirmación final con una línea compacta: artículo, cantidad, destino y usuario.

### 4. Gerencia — Dashboard

**Fortalezas observadas**

- Las métricas de `Pedidos Atrasados` y `Bloqueos Activos` dan una lectura rápida.
- Las acciones de reasignación, resolución y reportes están separadas del menú.

**Fricciones visuales y de experiencia**

- El espacio principal muestra acciones generales, pero no explica cuál excepción requiere atención primero.
- Las métricas `0` y `4` necesitan una relación más directa con una lista filtrada y una prioridad.
- El menú completo de módulos puede competir con el tablero de excepciones.

**Dirección propuesta**

- Convertir cada métrica en entrada directa a una cola filtrada.
- Ordenar bloqueos por antigüedad, impacto y responsable.
- Mantener reportes como acción secundaria y destacar la intervención inmediata.

## Principios de unificación del proyecto

1. **Una pantalla, una decisión primaria.** La acción dominante debe responder qué debe hacer el usuario ahora.
2. **Estado antes que explicación.** Mostrar etapa, bloqueo, responsable y siguiente acción; dejar la explicación extensa bajo demanda.
3. **Lenguaje por rol.** Ventas trabaja con pedido y promesa; almacén con tarea, ubicación y verificación; gerencia con excepción y capacidad.
4. **Divulgación progresiva.** Evidencia, notas, equivalencias y auditoría deben estar disponibles sin ocupar el primer plano.
5. **Tokens compartidos.** Estados como pendiente, bloqueado, listo y confirmado deben tener el mismo color, iconografía y posición en todas las pantallas.
6. **Responsive operativo.** Los filtros y acciones deben colapsar sin overflow horizontal y conservar una acción primaria visible.

## Riesgos de accesibilidad a validar en la siguiente actividad

- Contraste de textos secundarios y filas recientes en Inicio Ventas.
- Dependencia del color en badges como `Live` y `FALTAN DATOS OBLIGATORIOS`.
- Tamaño y jerarquía de textos auxiliares en recepción y Nuevo Pedido.
- Foco visible, navegación por teclado y lectura de estados por tecnologías asistivas; esto no puede concluirse solo desde capturas.

## Límites de esta revisión

- La evidencia corresponde a entorno local y datos de prueba; no representa volumen productivo.
- Se verificaron navegación y renderizado por rol, pero no se afirma cobertura completa de accesibilidad.
- No se hicieron cambios de UI/UX, migraciones, borrados ni despliegues en AWS.

## Validación funcional realizada

- `tests/e2e/sales-new-order-guided-summary.spec.ts`: **9 pruebas pasaron** en Chromium, incluyendo acceso por `SALES_EXECUTIVE`, `MANAGER` y `SYSTEM_ADMIN`, bloqueo de confirmación incompleta y revisión móvil.
- `tests/e2e/product-aware-handoff.spec.ts`: **5 pruebas pasaron** en Chromium después de corregir dos expectativas del arnés: la redirección debía conservar el `callbackUrl`, y el selector del contexto de equivalencia debía ser exacto. La suite cubre catálogo → Nuevo Pedido, disponibilidad/equivalencias → Nuevo Pedido, contexto inválido, bloqueo de guardado sin producto y validación móvil para Gerencia.

## Siguiente lote recomendado

1. Cerrar la cobertura funcional del handoff Sales → Almacén con el E2E `tests/e2e/product-aware-handoff.spec.ts` y sus puntos de confirmación.
2. Levantar una matriz de estados por rol para `/production/requests`, detalle, fulfillment, recepción y staging.
3. Diseñar un wireframe de baja fidelidad para `Siguiente acción`, filtros físicos y recepción progresiva.
4. Implementar después una única tanda visual tokenizada, validada con desktop, móvil, teclado y matriz RBAC.
