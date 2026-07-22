# Matriz de estados y responsabilidades: Sales → Almacén

Fecha original: 2026-07-09
Última validación: 2026-07-21
Estado: matriz operativa contrastada con código, E2E Chromium y persistencia de fixtures temporales.

## Objetivo

Definir una lectura común del proyecto: qué hace cada rol, en qué pantalla, con qué estado inicia, qué acción ejecuta y a quién entrega el siguiente paso.

## Roles

| Rol | Responsabilidad principal | No debe confundirse con |
|---|---|---|
| `SALES_EXECUTIVE` | Capturar el pedido, validar promesa y confirmar contexto comercial | Responsable físico del surtido |
| `WAREHOUSE_OPERATOR` | Ejecutar surtido, recepción, ensamble operativo y preparación hacia staging | Propietario comercial del pedido |
| `MANAGER` | Resolver excepciones, reasignar trabajo y supervisar capacidad | Operador que ejecuta cada movimiento |
| `SYSTEM_ADMIN` | Supervisar acceso, configuración y auditoría | Responsable cotidiano del flujo |

## Matriz principal

| Etapa | Pantalla actual | Rol primario | Entrada | Acción primaria | Salida | Siguiente responsable | Evidencia requerida |
|---|---|---|---|---|---|---|---|
| Captura | `/production/requests/new` | Sales | Cliente y contexto comercial | Resolver cliente, producto, almacén y fecha | Pedido con encabezado y línea válida | Sales | Cliente, producto, cantidad, almacén, fecha |
| Promesa | `/production/availability` | Sales | Producto, cantidad y almacén | Verificar disponibilidad vigente | Promesa segura, insuficiente, vencida o no verificada | Sales / Manager | `checkedAt`, disponible, almacén, cantidad |
| Sustitución | `/production/equivalences` | Sales | Producto original y alternativas | Seleccionar y confirmar sustituto | Producto alterno con origen trazable | Sales | Producto original, sustituto, motivo/confirmación |
| Confirmación | `/production/requests/[id]` | Sales | Pedido completo y línea válida | Confirmar pedido comercial | Pedido listo para ejecución | Warehouse | Estado, fecha compromiso y línea persistida |
| Priorización | `/production/requests` | Warehouse / Manager | Pedidos confirmados | Elegir cola física y siguiente tarea | Trabajo priorizado | Warehouse | Prioridad, vencimiento, bloqueo |
| Surtido directo | `/production/fulfillment/[id]` | Warehouse | Pedido con líneas surtibles | Confirmar cantidades y ubicación | Pick liberado, en progreso, parcial o completo | Warehouse / Manager | Producto, ubicación, cantidad, usuario, timestamp |
| Ensamble | `/production/orders/[id]` | Warehouse | Configuración y componentes | Liberar/pickear/consumir orden | Ensamble abierto, en proceso o completado | Warehouse | Componentes, WIP, consumo, pick status |
| Verificación | Detalle de pedido / cola | Warehouse | Surtido o ensamble completado | Validar que líneas y cantidades coincidan | Listo para staging o bloqueado | Warehouse | Verificación por línea y faltantes |
| Preparado para entrega | `/production/requests/[id]` | Warehouse | Surtido directo y ensambles completos | Registrar área física, responsable y nota | Listo para entrega persistente | Sales / Manager | Ubicación, responsable, fecha, nota y auditoría |
| Entrega | `/production/requests/[id]` | Sales / Manager | Pedido preparado para entrega | Registrar entrega al cliente | Entregado | Sales / Manager | Fecha, usuario, movimientos y comprobante PDF |

## Estados de negocio unificados propuestos

Estos nombres son una propuesta de lenguaje UX; no implican alterar todavía los enums ni la base de datos.

| Estado UX | Significado | Acción siguiente |
|---|---|---|
| `Borrador` | Encabezado en captura; no ejecutable | Completar cliente, línea y datos obligatorios |
| `Promesa pendiente` | Producto existe, pero disponibilidad no está validada | Consultar disponibilidad |
| `Listo para confirmar` | Datos comerciales y línea válida completos | Confirmar pedido |
| `Listo para surtir` | Pedido confirmado y sin bloqueo crítico | Liberar o tomar tarea física |
| `En surtido` | Pick activo con movimiento reciente | Continuar surtido |
| `Surtido parcial` | Parte de la cantidad está disponible | Resolver faltante o sustitución |
| `En ensamble` | Componentes o configuración requieren producción | Ejecutar orden de ensamble |
| `Bloqueado` | Excepción que impide avanzar | Resolver causa indicada |
| `Preparado para entrega` | Surtido/ensamble completos y área física registrada | Registrar entrega |
| `Listo para entrega` | Pedido preparado y elegible para entrega comercial | Registrar entrega |
| `Entregado` | Entrega registrada | Consultar trazabilidad |

## Mapeo con señales existentes

El código actual ya distingue señales útiles para priorización gerencial: vencido, vence hoy, surtido parcial, surtido sin movimiento, no liberado, ensamble pendiente y sin responsable. Estas señales deben convertirse en una vista compacta de excepción, no en instrucciones repetidas.

| Señal existente | Lectura operativa | Prioridad UX |
|---|---|---|
| `OVERDUE_UNRELEASED` | Vencido sin liberación de surtido | Alta |
| `STALE_PICK` | Surtido activo sin movimiento | Alta |
| `PICK_PARTIAL` | Surtido parcial con faltante | Alta |
| `ASSEMBLY_PENDING` | Ensamble ligado pendiente | Media |
| `DUE_TODAY_UNRELEASED` | Vence hoy y no está liberado | Media |
| `UNASSIGNED` | Pedido sin responsable | Media |

## Matriz RBAC documental

| Acción | Sales | Warehouse | Manager | Admin |
|---|---:|---:|---:|---:|
| Capturar pedido | Sí | No | Sí | Sí |
| Consultar disponibilidad | Sí | No | Sí | Sí |
| Confirmar contexto comercial | Sí | No | Sí | Sí |
| Ver cockpit de pedidos | Sí, con enfoque comercial | Sí, con enfoque operativo | Sí | Sí |
| Ejecutar surtido directo | No | Sí | Sí | Sí |
| Ejecutar ensamble | No | Sí | Sí | Sí |
| Resolver bloqueos | No | Parcial, según acción | Sí | Sí |
| Reasignar trabajo | No | No | Sí | Sí |
| Registrar entrega | Sí, sólo cuando el pedido esté preparado y completo | No | Sí, con las mismas validaciones | Sí |
| Administrar RBAC/configuración | No | No | No | Sí |

## Validación realizada — 2026-07-21

- PR #77: https://github.com/raul2105/WMS-Mangueras-y-conexiones/pull/77
- E2E Chromium: producto directo, ensamble configurado y pedido mixto desde captura hasta entrega.
- Cada fixture temporal registra y valida `preparedForDeliveryAt`, ubicación física, nota de preparación y `deliveredToCustomerAt`.
- Se valida la descarga del PDF de surtido por Operador y del comprobante de entrega por Ventas.
- El servicio impide preparar o entregar si falta surtido directo, una orden de ensamble ligada o el área física de entrega.

## Pendientes explícitos

- Confirmar en navegador la descarga de comprobante de recepción de compras y revisar visualmente los tres formatos PDF con un renderizador disponible.
- Documentar, sin alterar la regla actual, si la asignación comercial y la responsabilidad física deben persistirse como campos separados.
- Mantener KAN-127, KAN-130, KAN-132 y KAN-134 abiertos hasta completar la evidencia documental y los escenarios de excepción.

## Criterio de aceptación del levantamiento funcional

La matriz se considerará validada cuando cada transición tenga: pantalla, rol autorizado, acción observable, persistencia verificable y prueba E2E o evidencia de servicio equivalente.
