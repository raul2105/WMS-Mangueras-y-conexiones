# KAN-133 - Mapa operativo de pedido ventas a almacén

Fecha de corte: 2026-07-30

Estado: en revisión; reglas operativas implementadas en rama de integración, validación AWS pendiente de migración y prueba por rol
Ámbito: pedido comercial directo, ensamble configurado y pedido mixto

## Propósito

Definir un único proceso operativo desde la captura comercial hasta la entrega
al cliente. Este documento describe el comportamiento existente que ha sido
verificado en código y en AWS; no declara que todos los requisitos posteriores
de KAN-127 a KAN-132 estén terminados.

La fuente técnica de los estados es `lib/sales/internal-orders.ts`. La fuente
operativa de validación es la aplicación AWS Dev y PostgreSQL RDS. Las fechas
de compromiso son días de negocio; las marcas de auditoría son instantes.

## Actores y responsabilidad

| Actor | Responsabilidad | No puede hacer |
|---|---|---|
| Ejecutivo de Ventas | Captura, confirma el pedido, consulta promesa y da seguimiento comercial. Puede confirmar entrega sólo si se cumplen todas las precondiciones. | Surtir directamente ni preparar físicamente la entrega sin permiso operativo. |
| Manager / Administrador | Supervisa, asigna o reasigna antes de la toma, atiende excepciones y puede intervenir según RBAC. | Saltar las validaciones de surtido, ensamble, preparado o entrega. |
| Operador de almacén | Libera y ejecuta surtido directo, registra faltantes y prepara físicamente el pedido para entrega. | Prometer disponibilidad comercial ni declarar entrega al cliente. |
| Producción / ensamble | Completa las órdenes de ensamble configuradas ligadas a la línea comercial. | Marcar el pedido listo o entregado mientras haya trabajo pendiente. |
| Sistema / auditoría | Crea reservas, listas de surtido, tareas, movimientos y eventos auditables. | Convertir una condición no cumplida en una transición válida. |

## Estados canónicos visibles

| Etapa visible | Condición de entrada | Propietario de la siguiente acción | Condición de salida | Evidencia requerida |
|---|---|---|---|---|
| Captura | Pedido `BORRADOR`. | Ventas. | Cliente, almacén, fecha y al menos una línea válidos; Ventas confirma. | Pedido y líneas guardadas. |
| Por asignar | Pedido `CONFIRMADA` sin responsable. | Manager / Administrador. | Responsable asignado. | `assignedToUserId`, `assignedAt` y evento de asignación. |
| En surtido | Pedido confirmado y asignado, con surtido directo o ensamble pendiente. | Almacén o Producción, según la línea. | Surtido directo completo y todos los ensambles requeridos completos. | Lista de surtido/tareas y órdenes de producción ligadas. |
| Separar para entrega | Surtido directo completo y ensambles completos, sin ubicación física de entrega. | Almacén. | Se registra área de entrega. | `preparedForDeliveryAt`, ubicación, usuario y nota opcional. |
| Preparado para entrega | Área de entrega registrada y trabajo requerido completado. | Ventas responsable, Manager o Administrador. | Se confirma la entrega al cliente. | Validación de entrega y evento de auditoría. |
| Entregado | `deliveredToCustomerAt` registrado. | Ninguno; sólo consulta y comprobante. | Terminal. | Usuario, fecha y PDF de entrega. |
| Cancelado | Pedido cancelado. | Ninguno; sólo consulta y auditoría. | Terminal. | Evento de cancelación y liberación aplicable. |

## Matriz de transiciones, validación y visibilidad

Ninguna transición operativa es sólo de interfaz: cada una que cambia el
pedido, una reserva, una lista de surtido, una excepción, una devolución o una entrega requiere validación de
backend. La interfaz sólo presenta el estado, la siguiente acción y el motivo
de bloqueo; no puede sustituir las reglas de servicio.

| Transición | Validación backend obligatoria | Presentación para Ventas | Presentación para Almacén / Producción | Supervisión |
|---|---|---|---|---|
| Captura → Por asignar | Pedido `BORRADOR`, cliente, almacén, fecha y líneas válidos; promesa revalidada y reserva/lista de surtido creadas cuando aplica. | Confirma el pedido y luego ve `Por asignar`. | No recibe trabajo hasta que exista pedido confirmado y asignado. | Puede localizar el pedido para asignar o reasignar. |
| Por asignar → En surtido | La toma o asignación no puede duplicar responsable ni aceptar pedido cancelado o ya tomado. | El ejecutivo elegible puede `Tomar pedido` o `Continuar pedido`; si no, ve el responsable o bloqueo. | Recibe el trabajo de surtido o ensamble sólo después de la asignación. | Puede asignar o reasignar antes de la toma, dentro de RBAC. |
| En surtido → Separar para entrega | Surtido directo completado y todos los ensambles configurados ligados completados. | Ve seguimiento y bloqueo mientras falte trabajo físico. | Ejecuta surtido o ensamble; al completarse recibe `Preparar pedido`. | Ve el avance y atiende excepciones. |
| Separar para entrega → Preparado para entrega | Se registra área física, usuario responsable, nota/evidencia y marca de preparado; una excepción abierta bloquea la transición. | Ve `En espera de almacén`. | Registra el área y preparado físico. | Puede verificar responsable, ubicación y evidencia. |
| Preparado para entrega → Entregado | Pedido confirmado, asignado y tomado; surtido/ensamble completos; área de entrega registrada; sin excepción abierta; se exige quién recibió y método. | Sólo el ejecutivo responsable confirma normalmente; Manager/Admin exige motivo excepcional. | No habilita la entrega comercial antes de completar preparación. | Puede confirmar sólo si las mismas precondiciones se cumplen. |
| Activo → Solicitud de cancelación → Cancelado | Si el surtido ya fue liberado se crea una excepción, Manager/Admin decide, Almacén realiza reversión física y sólo entonces se confirma cancelación. | Ve el bloqueo y seguimiento. | Recibe reversión física antes del cierre. | Gestiona decisión y auditoría. |

Los indicadores, tarjetas, etiquetas de etapa, PDFs de consulta y enlaces de
navegación son **UI-only**: reflejan el estado calculado, pero no autorizan ni
ejecutan transiciones por sí mismos.

## Flujo principal

```mermaid
flowchart LR
  A["Captura - Ventas"] -->|"Confirmar pedido"| B["Por asignar"]
  B -->|"Asignar responsable"| C["En surtido"]
  C --> D{"Tipo de línea"}
  D -->|"Producto directo"| E["Reserva y surtido"]
  D -->|"Ensamble configurado"| F["Orden de ensamble"]
  E --> G{"Todo completado"}
  F --> G
  G -->|"Sí"| H["Separar para entrega"]
  H -->|"Registrar área física"| I["Preparado para entrega"]
  I -->|"Confirmar entrega"| J["Entregado"]
  A --> K["Cancelado"]
  B --> K
  C --> K
```

## Reglas de negocio que bloquean transiciones

1. Un pedido sólo puede confirmarse desde `BORRADOR` y con al menos una línea.
2. La promesa de disponibilidad se revalida contra el almacén antes de crear el
   pedido; la evidencia KAN-128 visible se conserva en el flujo comercial.
3. Al confirmar líneas directas, el sistema crea una lista de surtido en
   borrador, reserva cantidades y genera tareas por ubicación.
4. Una tarea no puede confirmarse hasta que la lista de surtido esté liberada.
5. Un pedido no puede prepararse para entrega hasta que el surtido directo esté
   completado y todos los ensambles configurados ligados estén completados.
6. Un pedido no puede entregarse si falta responsable/toma, surtido directo,
   ensamble, área de entrega, evidencia mínima de entrega o existe una excepción abierta.
7. Cancelar libera reservas de listas aún en borrador. Si existe surtido liberado,
   crea una solicitud de cancelación y exige decisión, reversión física y auditoría.
8. Un pedido entregado inicia una devolución; nunca se convierte en cancelación.

## Diferencia por tipo de pedido

| Caso | Trabajo operativo | Criterio para avanzar a preparado |
|---|---|---|
| Directo | Lista de surtido y tareas desde ubicación origen hasta área de entrega. | Lista de surtido en `COMPLETED`. |
| Ensamble | Orden de producción ligada a la línea configurada. | Todas las órdenes ligadas en `COMPLETADA`. |
| Mixto | Surtido directo y ensamble en paralelo. | Ambos criterios anteriores se cumplen. |

## Evidencia AWS usada como referencia

El pedido controlado `PI-2026-0010` muestra la cadena ya existente:

- producto `DEV-ASM-HOSE-DN10-R2AT` en almacén `WH-02`;
- disponibilidad comercial actual: 19;
- pedido confirmado con una unidad;
- reserva existente y tarea de surtido pendiente;
- lista `PK-SUR-2026-0005` con destino `STAGING-WH-02`.

Esta evidencia demuestra disponibilidad, confirmación, reserva y handoff; no
autoriza por sí misma el cierre de las historias posteriores.

## Excepciones y decisiones

La implementación persistente usa `SalesInternalOrderException` para faltantes
y solicitudes de cancelación, y `SalesInternalOrderReturn` para reversión de
surtido y devolución del cliente. Estos registros conservan actor, fecha,
motivo, decisión, ubicación y disposición física; además bloquean preparación
y entrega mientras permanezcan abiertos.

| Excepción | Estado esperado | Responsable | Acción visible |
|---|---|---|---|
| Promesa insuficiente o vencida | No se crea compromiso válido. | Ventas. | Revisar disponibilidad o equivalente. |
| Sin responsable | Por asignar. | Manager / Administrador. | Asignar o reasignar. |
| Faltante al surtir | En surtido, con bloqueo/parcial. | Almacén y supervisión. | Registrar faltante y revisar excepción. |
| Ensamble incompleto | En surtido. | Producción. | Completar ensamble o resolver bloqueo. |
| Área de entrega ausente | Separar para entrega. | Almacén. | Registrar ubicación física. |
| Intento de entrega prematura | Sin transición. | Sistema. | Mostrar condición bloqueante. |

## Límites actuales y trabajo posterior

Este mapa confirma que el modelo actual ya contiene los hitos principales. Los
siguientes tickets convierten el proceso en contrato y experiencia consistente:

1. **KAN-127:** formalizar eventos, permisos, idempotencia, errores y auditoría.
2. **KAN-131:** asegurar que la cola de almacén muestre sólo trabajo accionable.
3. **KAN-134:** completar el detalle del retorno de ensamble al pedido comercial.
4. **KAN-132:** endurecer la evidencia y UX de preparado para entrega.
5. **KAN-130:** certificar directo, ensamble, mixto y excepciones mediante E2E.
6. **KAN-125:** cerrar la capacidad integral sólo con evidencia operativa de toda la cadena.

## Gate de revisión KAN-133

KAN-133 puede considerarse revisada cuando Producto/Operación confirme que:

- los siete estados visibles corresponden a su operación real;
- la propiedad de cada transición es correcta;
- las excepciones cubren faltantes, ensambles y cancelación;
- no existe una transición administrativa que permita entregar antes de estar
  preparado;
- el mapa se enlace desde KAN-125 o desde la PR que introduzca KAN-127.
