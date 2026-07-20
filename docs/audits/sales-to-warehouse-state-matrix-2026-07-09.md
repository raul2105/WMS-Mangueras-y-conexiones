# Matriz de estados y responsabilidades: Sales → Almacén

Fecha: 2026-07-09
Estado: levantamiento documental; validación AWS pendiente hasta disponibilidad autorizada.

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
| Staging | Actualmente representado como destino/eligibilidad | Warehouse | Pedido verificado | Confirmar ubicación y preparación física | Listo para entrega | Warehouse / Manager | Bahía/ubicación, cantidad, responsable |
| Entrega | Cola/detalle de pedido | Sales / Manager según autorización | Pedido listo para entrega | Registrar entrega al cliente | Entregado | Sales / Manager | Fecha, usuario, evidencia de entrega |

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
| `Listo para verificar` | Surtido/ensamble reportado como completo | Validar líneas y cantidades |
| `Listo para entrega` | Verificación y staging confirmados | Registrar entrega |
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
| Registrar entrega | Pendiente de confirmar autorización final | No definido | Sí | Sí |
| Administrar RBAC/configuración | No | No | No | Sí |

## Gaps que requieren validación mañana

- Confirmar en AWS si existe una transición persistida y trazable para `Listo para entrega` distinta de la elegibilidad calculada.
- Confirmar quién está autorizado actualmente para registrar entrega.
- Confirmar si existe ownership físico separado de `assignedToUserId` comercial.
- Validar que las cantidades surtidas, staging y entrega sean consistentes con líneas directas y de ensamble.
- Ejecutar E2E completo con datos controlados desde pedido confirmado hasta entrega.

## Criterio de aceptación del levantamiento funcional

La matriz se considerará validada cuando cada transición tenga: pantalla, rol autorizado, acción observable, persistencia verificable y prueba E2E o evidencia de servicio equivalente.
