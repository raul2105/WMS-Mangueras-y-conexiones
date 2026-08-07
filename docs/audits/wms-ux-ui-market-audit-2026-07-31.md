# Auditoría UX/UI WMS por perfiles y referencia de mercado

Fecha: 2026-07-31
Checkout auditado: `main`
SHA observado: `33d4f3e`
Modo: lectura; no se crearon pedidos, reservas, movimientos, recepciones, asignaciones ni cambios administrativos.

## 1. Alcance

Se revisaron los cuatro perfiles declarados por el producto:

- `SALES_EXECUTIVE`: consola comercial, catálogo, disponibilidad, equivalencias, clientes y captura de pedido.
- `WAREHOUSE_OPERATOR`: trabajo del día, ejecución de surtido, inventario, recepción, compras operativas y ensamble.
- `MANAGER`: supervisión, asignación, excepciones, compras, inventario y pedidos.
- `SYSTEM_ADMIN`: administración de usuarios, auditoría, trazabilidad y supervisión transversal.

La inspección combinó inventario de rutas/RBAC, lectura de componentes y captura runtime de las superficies principales. Las capturas aceptadas están en `output/playwright/`.

## 2. Veredicto

El producto tiene una base útil de WMS: distingue perfiles, adapta la navegación, conserva la entidad pedido entre ventas y almacén y ya expone disponibilidad por almacén, ubicación origen/destino, lista de surtido y estados de recepción.

No está todavía al nivel de una experiencia WMS madura para operación diaria. El riesgo principal no es visual: es que el sistema presenta varios estados simultáneos del mismo pedido sin explicar cuál gobierna la siguiente acción. En la captura de runtime de `PI-2026-0010` aparecen `CONFIRMADA`, `EN SURTIDO` y `POR SURTIR` a la vez, mientras el texto indica que está listo para iniciar. Esto puede producir doble trabajo, liberaciones prematuras o promesas comerciales incorrectas.

Nivel global: **parcialmente listo; requiere una corrección estructural de estados, operación móvil y maestro técnico antes de considerarlo market-grade**.

## 3. Evidencia visual runtime

| Paso | Superficie | Salud general | Evidencia |
|---|---|---|---|
| 1 | Inicio Ventas | Buena entrada; tarjetas y acciones truncadas | [01-sales-result.png](../../output/playwright/01-sales-result.png) |
| 2 | Nuevo pedido | Flujo guiado claro, pero la promesa y el handoff necesitan mayor rigor | [05-sales-new-order.png](../../output/playwright/05-sales-new-order.png) |
| 3 | Disponibilidad | Buena comparación por almacén; demasiadas acciones por fila | [10-sales-availability.png](../../output/playwright/10-sales-availability.png) |
| 4 | Trabajo de hoy | Buena priorización inicial | [03-warehouse-home.png](../../output/playwright/03-warehouse-home.png) |
| 5 | Cola de almacén | Problema crítico de estados y filtros horizontales | [06-warehouse-queue.png](../../output/playwright/06-warehouse-queue.png) |
| 6 | Cola móvil | Hay overflow/clipping en filtros | [11-warehouse-queue-mobile.png](../../output/playwright/11-warehouse-queue-mobile.png) |
| 7 | Surtido | Origen/destino y liberación son comprensibles; falta flujo scan-first | [07-warehouse-fulfillment.png](../../output/playwright/07-warehouse-fulfillment.png) |
| 8 | Inicio Manager | Buen enfoque en decisiones y bloqueos | [02-manager-home.png](../../output/playwright/02-manager-home.png) |
| 9 | Pedidos Manager | Vista potente, pero mezcla comercial y ejecución | [08-manager-requests.png](../../output/playwright/08-manager-requests.png) |
| 10 | Usuarios Admin | Completa, pero densa y contaminada por usuarios de pruebas | [09-admin-users.png](../../output/playwright/09-admin-users.png) |
| 11 | Producto en móvil | Defecto responsive y posible inconsistencia marca/imagen | [12-sales-product-detail.png](../../output/playwright/12-sales-product-detail.png) |

## 4. Hallazgos por perfil

### SALES_EXECUTIVE

Fortalezas:

- `/home/sales` tiene una entrada comercial reconocible: buscar producto, disponibilidad, equivalencias, clientes y pedido nuevo.
- La disponibilidad permite decidir por almacén y conserva contexto de producto, cantidad y promesa al enlazar con Nuevo pedido.
- El stepper Cliente → Producto → Entrega reduce la carga inicial del formulario.

Riesgos:

1. **P0 — La promesa comercial no es una decisión suficientemente visible.** La disponibilidad muestra “Disponible” y cantidad, pero la fila no prioriza reservado, unidad de venta, fecha/hora de verificación, cantidad solicitada, frescura ni motivo de sustitución. El enlace sí transporta esos datos por query string, pero no los presenta como una tarjeta de decisión que el usuario pueda revisar y confirmar.
2. **P1 — Exceso de acciones por producto.** `Crear pedido (WH-01)`, `Crear pedido (WH-02)`, `Revisar equivalencias` y `Ver producto` compiten en cada fila. La tabla se vuelve especialmente estrecha en viewport reducido.
3. **P1 — Terminología mezclada.** Ventas navega hacia “Todos los Pedidos”, pero la misma entidad aparece como “Pedidos”, “Pedidos y surtidos”, “surtido”, “ensamble” y “trabajo de almacén”.
4. **P1 — El producto no comunica suficiente seguridad técnica.** La pantalla observada muestra diámetro, rosca, material, presión, medida y uso, pero no presenta de forma estructurada presión de trabajo/ruptura, temperatura, ID/OD, radio de curvatura, conexión compatible, norma, fluido o advertencias.
5. **P1 — Inconsistencia de confianza.** En la captura móvil el producto se identifica como Gates, mientras la imagen visible contiene una marca Continental. Aunque puede ser un asset incorrecto del dataset, el usuario lo percibe como una contradicción de fabricante.
6. **P2 — Acciones iconográficas sin nombre accesible claro.** En el snapshot runtime algunos enlaces de acción contienen un botón sin nombre textual expuesto; requiere revisión de `aria-label` y nombre accesible.

Recomendación: convertir Ventas en una secuencia `Producto técnico → Disponibilidad prometible → Cliente → Pedido`, con una única acción primaria por fila y alternativas como decisión secundaria.

### WAREHOUSE_OPERATOR

Fortalezas:

- `/home/warehouse` empieza por “Siguiente trabajo” y ofrece “Ver trabajo”.
- `/production/fulfillment/[id]` comunica pedido, almacén, compromiso, lista de surtido, origen, destino y liberación.
- Los controles de surtido permanecen bloqueados antes de liberar la lista; esto evita una confirmación prematura.

Riesgos:

1. **P0 — No existe una única verdad operativa de la tarea.** La cola muestra tres estados simultáneos y el copy contradice las etiquetas. Debe existir un estado principal de ejecución, por ejemplo `Por liberar → Liberado → En surtido → Parcial/Bloqueado → En staging → Listo para entrega`.
2. **P0 — El “responsable” es comercial, no propietario físico.** La cola informa `Responsable: Ejecutivo Ventas`; eso no responde quién tiene la tarea en piso ni evita que dos operadores la ejecuten. Separar `owner comercial`, `warehouse assignee/claim` y `último operador`.
3. **P1 — Falta una experiencia scan-first.** El operador ve origen/destino, pero no un paso directo de escanear ubicación, producto/LPN y cantidad. En un almacén de mangueras y conexiones, el control de identidad y compatibilidad física importa más que leer una tarjeta larga.
4. **P1 — Staging incompleto como operación.** Se muestra `STAGING-WH-02`, pero no hay una vista de bahía/ubicación de staging, cantidades físicamente colocadas, empaque, carga, excepción pendiente ni responsable de entrega.
5. **P1 — Filtros móviles no reflow.** La captura móvil corta la fila de filtros (`Para actuar`, `Por surtir`, `En proceso`, `Bloqueados`) y deja parte de la navegación fuera del viewport.
6. **P2 — Densidad técnica sin jerarquía para el piso.** `Req`, `Reservado`, `Pendiente` y `Faltante` son útiles, pero deberían aparecer como una línea de progreso de cantidad y no como una cadena de microdatos secundarios.

Recomendación: crear una cola de trabajo físico por tarea, no por pedido; cada tarea debe responder en una pantalla: qué recoger, dónde, cuánto, a dónde llevarlo, cómo validar y qué hacer si falta.

### MANAGER

Fortalezas:

- El inicio gerencial prioriza atrasos, bloqueos, órdenes de compra y recepciones.
- Las acciones del día están agrupadas en decisiones, lo que es más útil que un dashboard puramente numérico.
- La vista administrativa de pedidos permite una lectura transversal sin quitar la vista comercial principal.

Riesgos:

1. **P0 — El manager no puede confiar en los contadores si los estados no son ortogonales.** `Pedidos atrasados`, `Bloqueos`, `Para tomar`, `En curso` y `Listos` pueden contar dimensiones distintas, pero la interfaz no explica sus reglas ni evita que el mismo pedido aparezca en varias categorías.
2. **P1 — Mezcla de supervisión y ejecución.** “Crear pedido”, “Asignar vendedores”, “Resolver bloqueos” y “Operar surtido” conviven con el mismo peso. El manager necesita primero riesgo, ownership y SLA; la ejecución física debe quedar secundaria.
3. **P1 — “Asignación comercial” no equivale a capacidad de almacén.** El panel informa vendedores asignados, pero no capacidad por almacén, cola por zona, carga por operador ni antigüedad de tareas.
4. **P2 — El lenguaje de excepciones no está normalizado.** “Bloqueado”, “revisar bloqueo”, “sin líneas”, “por surtir” y “en surtido” aparecen como acciones/estados sin un modelo visible de causa, dueño y resolución.

Recomendación: separar el cockpit gerencial en `Riesgo`, `Capacidad`, `Excepciones` y `Flujo`; cada tarjeta debe incluir definición, timestamp, owner y siguiente decisión.

### SYSTEM_ADMIN

Fortalezas:

- RBAC y navegación administrativa están claramente separados.
- Usuarios incluye filtros por nombre/email, rol y estado, paginación y acciones de ver/editar.
- El inicio expone auditoría y trazabilidad como superficies distintas.

Riesgos:

1. **P1 — La auditoría expone eventos demasiado crudos.** En el inicio se ven `CONFIRM_REQUEST`, `ADD_PRODUCT_LINE`, `REBUILD_DIRECT_PICKLIST` y `RESERVE_STOCK`; son útiles para ingeniería, pero no para una revisión operativa sin traducir entidad, actor, motivo, antes/después y resultado.
2. **P1 — La tabla de usuarios es demasiado ancha para administración cotidiana.** Fecha de creación y actualización ocupan espacio comparable a nombre, rol y estado; conviene un modo compacto con columnas configurables y detalle lateral.
3. **P1 — Los datos de prueba contaminan la supervisión.** La lista observada está dominada por usuarios `Full Flow`, `Deliver`, `Visibility`, `Pull`, etc. Si esto es un entorno operativo, el admin no puede distinguir usuarios reales de fixtures.
4. **P2 — “Dashboard” se mantiene como nombre superior aunque el contenido es específico del rol.** Para admin, “Administración” sería más coherente que heredar el nombre genérico del shell.

Recomendación: diferenciar `operación`, `seguridad` y `trazabilidad`; ocultar fixtures del entorno operativo o marcarlos explícitamente.

## 5. Hallazgos transversales

### A. Estados y ownership — prioridad P0

Hay al menos cuatro dimensiones distintas que deben dejar de mostrarse como si fueran una sola:

| Dimensión | Ejemplo | Quién la usa |
|---|---|---|
| Estado comercial | Borrador, Confirmada, Cancelada | Ventas / Manager |
| Etapa de flujo | Captura, Por asignar, En surtido, Listo, Entregado | Ventas / Manager |
| Estado de lista/tarea | Draft, Released, In progress, Partial, Completed | Almacén |
| Estado de excepción | Sin líneas, Bloqueado, Faltante, Discrepancia | Todos, con distinto detalle |

La UI debe mostrar un solo `Siguiente paso` principal y colocar las otras dimensiones bajo `Detalle de estado`. No se debe corregir solo el color de los badges.

### B. Arquitectura de información y duplicidades — P1

La navegación tiene un vocabulario distinto por rol para la misma ruta `/production/requests`: “Todos los Pedidos”, “Pedidos” y “Ejecución”. Además, existen wrappers `/sales/*` y superficies `/production/*` que representan la misma continuidad comercial. Esto puede funcionar internamente, pero el usuario debe ver una sola arquitectura:

- `Ventas`: buscar, prometer, capturar y seguir.
- `Almacén`: ejecutar, verificar, staging y entrega física.
- `Supervisión`: riesgo, capacidad, excepciones y asignación.
- `Administración`: usuarios, configuración y auditoría.

Los nombres de ruta pueden mantenerse por compatibilidad, pero no deben aparecer como conceptos rivales en navegación y breadcrumbs.

### C. Maestro de producto para mangueras, conexiones y herramientas — P0/P1

El modelo actual tiene `sku`, referencia, tipo, unidad, marca, subcategoría, precio, proveedor y atributos flexibles JSON. Esto es una buena base, pero no basta para seleccionar una manguera o conexión de forma segura.

Campos recomendados por familia:

- Manguera: ID/OD, longitud de venta, presión de trabajo, presión de ruptura, temperatura mínima/máxima, radio mínimo de curvatura, refuerzo, cubierta, fluido/compatibilidad, norma SAE/EN/ISO, conductividad y fabricante.
- Conexión: familia/serie, estándar de rosca, tamaño nominal, sexo, ángulo, forma, material, sello/O-ring, método de unión/crimpado y compatibilidad de manguera.
- Ensamble: manguera base, conexión de entrada/salida, longitud, orientación, cantidad, presión/temperatura derivadas, prueba y documento técnico.
- Herramienta: aplicación, rango, capacidad, compatibilidad de consumibles, calibración y seguridad.

Los atributos deben ser tipados y comparables; el JSON libre puede permanecer como extensión, pero no como fuente primaria de promesa o equivalencia.

### D. Responsive y accesibilidad — P1

- El viewport móvil observado presenta overflow horizontal y filtros cortados.
- Las tablas comerciales necesitan vista de tarjeta o acción primaria fija; no deben reducir tipografía hasta volver ilegible SKU y especificaciones.
- Revisar nombres accesibles de botones iconográficos y links que en el snapshot aparecen sin nombre.
- Revisar foco de teclado, `aria-invalid`/`aria-describedby`, mensajes de error, lectura de cambios de estado y zoom al 200%. Esta auditoría no certifica WCAG.

## 6. Contraste de mercado

La comparación se usó como referencia de patrones operativos, no como afirmación de satisfacción estadística de usuarios.

### SAP EWM

SAP EWM separa el trabajo RF por picking guiado por sistema, cola, solicitud, orden o unidad de manipulación; durante el picking valida ubicación origen, unidad, producto, cantidad y destino, y contempla códigos de excepción. También modela actividades como recepción, putaway, picking, packing, loading e inventario. Esto refuerza que el operador debe recibir una tarea concreta y validable, no una tarjeta de pedido con estados agregados.

Fuentes: [SAP RF Framework](https://help.sap.com/docs/PRODUCT_ID/25cf88dfa94c49e4a440f3f1d752b8a1/4d4fa477c9c20c7ae10000000a42189c.html), [SAP Picking](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/9832125c23154a179bfa1784cdc9577a/48d2a6730128581de10000000a42189c.html), [SAP RF Picking Flow](https://help.sap.com/docs/SAP_EXTENDED_WAREHOUSE_MANAGEMENT/3d97bec9bf1649099384bb8167df3cf2/e0cccb53ad377114e10000000a174cb4.html).

### Oracle WMS Cloud

Oracle WMS Cloud organiza el menú móvil por módulos como Receiving, Putaway, Picking y Loading, mantiene visible la instalación/facility y permite escanear o capturar LPN, ubicación e item. También documenta layouts configurables por pantalla. Para este WMS, el equivalente sería una experiencia móvil por operación, con facility/almacén visible y captura rápida por escaneo.

Fuente: [Oracle WMS Cloud Mobile App Guide](https://docs.oracle.com/en/cloud/saas/warehouse-management/21c/owmma/oracle-warehouse-management-cloud-mobile-app-guide.pdf), [Oracle WMS Users, Groups, and Menus](https://docs.oracle.com/en/cloud/saas/warehouse-management/26c/owmol/what-is-an-rf-menu.html).

### Gates, Parker, Dixon y Continental

Los proveedores mantienen catálogos orientados a selección técnica, con número de parte/familia y datos comparables. Gates publica construcción, refuerzo, cubierta, temperatura, tamaño y presión de trabajo; Parker expone tamaño de conexión, ID de manguera, estilo, material y temperaturas/presiones; Dixon exige considerar tamaño, temperatura, aplicación, medio y presión, y advierte que la presión máxima de un ensamble es la menor entre manguera y conexión; Continental publica tablas de ID, OD, presión de trabajo, radio de curvatura, presión de ruptura, fitting y peso.

Fuentes: [Gates Hydraulic Hose Products Catalog 2026](https://www.gates.com/content/dam/documents-library/catalogs/gates-hydraulic-catalog-en.pdf), [Parker hydraulic hoses and fittings](https://www.parker.com/content/dam/parker/lam/catalogs/pdf/4---conectores---mangueiras---v%C3%A1lvulas---instrumentos-para-flu%C3%ADdos/6---mangueiras-e-conex%C3%B5es/Hydraulic%20Hoses%2C%20Fittings%20%20and%20Equipment.pdf), [Dixon coupling selection guidance](https://canada.dixonvalve.com/sites/default/files/documents/Holedall-fittings-data-sheet-2024.pdf), [Continental SFS technical data](https://www.continental-industry.com/en/solutions/fluid-handling/hydraulic-hoses/special-applications/sfs).

## 7. Backlog recomendado

### P0 — antes de ampliar funcionalidades

1. Definir el contrato de estados y separar estado comercial, etapa, tarea y excepción.
2. Implementar ownership físico de almacén y una cola de tareas con siguiente acción única.
3. Hacer que la promesa comercial muestre producto, almacén, unidad, solicitado, disponible, reservado, fecha/hora de verificación, frescura y sustituto.
4. Normalizar el maestro técnico mínimo y resolver validación de marca/imagen/asset.

### P1 — siguiente lote coherente

1. Rediseñar la ejecución móvil con filtros que hagan wrap o menú, escaneo de ubicación/producto y confirmación de origen/destino.
2. Convertir staging y listo para entrega en una operación física con ubicación, cantidades y handoff.
3. Reducir la tabla de disponibilidad a una acción primaria y un menú secundario.
4. Unificar vocabulario y breadcrumbs de `/sales/*` y `/production/*` sin romper compatibilidad de rutas.
5. Normalizar auditoría legible y vista admin compacta; separar fixtures de usuarios operativos.
6. Añadir pruebas de accesibilidad para nombre de controles, foco, errores y responsive.

### P2 — polish después de la corrección estructural

1. Tokenizar las superficies antiguas con estilos oscuros hard-coded.
2. Agregar preferencias de densidad, columnas y filtros guardados por rol.
3. Añadir personalización de layouts por dispositivo solo después de definir el flujo operativo base.

## 8. Validación pendiente

- No se ejecutaron mutaciones; falta probar el ciclo autorizado de disponibilidad → confirmación → reserva → surtido → staging → entrega con una transacción de prueba controlada.
- No se completó una inspección exhaustiva de cada formulario de compras, recepción, ajustes, transferencias, etiquetas y trazabilidad; se revisaron rutas, RBAC, código y superficies representativas.
- No se certifica conformidad WCAG ni aceptación real de usuarios. Hace falta prueba con operadores de piso, ventas y supervisión, especialmente en escaneo, faltantes, sustitutos, staging y devoluciones.
- Los contadores y datos visibles corresponden al runtime actual conectado al entorno configurado por el checkout; no deben interpretarse como datos de producción sin reconciliar el entorno.

## 9. Recomendación de decisión

**Proceed**, pero solo con un lote P0/P1 coherente centrado en el contrato de estados, ownership de almacén, promesa técnica y ejecución móvil. **No conviene dividirlo en tickets aislados de colores, badges o dashboard**: esos cambios dejarían intacta la ambigüedad que más riesgo operativo introduce.
