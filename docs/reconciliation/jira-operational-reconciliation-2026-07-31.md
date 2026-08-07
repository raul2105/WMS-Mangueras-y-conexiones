# Reconciliación Jira–código–operación

Fecha de corte: 2026-07-31
Proyecto Jira: `KAN`
Regla de consulta: `project = KAN AND statusCategory != Done ORDER BY key ASC`
Resultado: 54 tickets abiertos o en revisión.

## Regla de cierre

Un ticket sólo puede pasar a `Finalizada` cuando su manifiesto individual contiene:

- objetivo y criterios de aceptación de Jira;
- causa raíz documentada con 5 Why's;
- código, PR/SHA y migraciones aplicables;
- pruebas técnicas verdes;
- evidencia runtime del entorno correspondiente;
- dependencias y enlaces Jira verificados;
- riesgos residuales y decisión de cierre.

La consulta Jira define alcance y prioridad. `main` define el código integrable. El
schema y las migraciones PostgreSQL definen el contrato de datos. El entorno AWS
define el comportamiento operativo desplegado. Ninguna fuente sustituye a las otras.

## Frentes de trabajo

| Frente | Tickets | Estado de cartera | Criterio de salida |
|---|---|---|---|
| WMS técnico y comercial | KAN-4, KAN-16, KAN-19, KAN-20, KAN-21, KAN-54, KAN-76, KAN-79, KAN-118, KAN-125, KAN-127–KAN-135 | Mixto: parcialmente implementado, en revisión y por hacer | Contrato de estados, promesa, ownership, picking, ensamble, staging y E2E completos |
| Gobierno, calidad y observabilidad | KAN-6, KAN-7, KAN-26, KAN-27, KAN-28 | Por hacer | Auditoría crítica, KPI definido, regresión y gates de release |
| Compras y reabasto | KAN-5, KAN-23, KAN-85–KAN-90, KAN-121–KAN-124 | Por hacer | OC, recepción, correo, reintentos y reabasto verificables |
| Fiscal MX | KAN-99–KAN-109, KAN-111 | Idea | Modelo fiscal, CFDI, impuestos, retenciones y evidencia integrados |
| Plataforma Prisma | KAN-112–KAN-117 | Idea | Baseline, cliente, adapter, scripts, AWS y release validados |

## Matriz WMS

| Ticket | Estado Jira al corte | Estado de implementación | Causa raíz / 5 Why's | Siguiente evidencia |
|---|---|---|---|---|
| KAN-4 | Tareas por hacer | Parcial | El catálogo industrial aún depende de atributos libres y no de una matriz técnica tipada | Especificaciones por familia y validación de datos reales |
| KAN-16 | Tareas por hacer | No verificado | La captura rápida no tiene todavía un contrato de operación de piso cerrado | Flujo teclado-first y pruebas de captura |
| KAN-19 | Tareas por hacer | Parcial | Las compatibilidades no estaban persistidas ni auditadas como reglas | Reglas publicadas, bloqueo y excepción aprobada |
| KAN-20 | Tareas por hacer | No completado | La compatibilidad técnica todavía no gobierna OT, surtido y entrega | Prueba de bloqueo backend |
| KAN-21 | Tareas por hacer | No completado | No existe recomendación de equivalentes basada en compatibilidad y stock | Pruebas de equivalentes válidos/no válidos |
| KAN-54 | En revisión | Parcial | La UX por rol mejora por superficie, pero no está certificada como sistema transversal | Matriz de rutas, RBAC, responsive y regresión |
| KAN-76 | Tareas por hacer | Parcial | El encabezado y la promesa todavía no forman un paso totalmente continuo | E2E de encabezado → líneas → promesa |
| KAN-79 | Tareas por hacer | Parcial | El cockpit gerencial necesita señales ortogonales de riesgo, ownership y capacidad | KPI con definición y evidencia de cálculo |
| KAN-118 | Idea | Parcial | Existen superficies antiguas con deuda de tokens y densidad | Auditoría de tokens y light/dark |
| KAN-125 | Idea | Integrador pendiente | La cadena completa depende de todos los contratos posteriores | E2E integral y evidencia de handoff |
| KAN-127 | Idea | Parcial | El mapa existe, pero falta convertirlo en contrato transaccional | Transiciones, permisos, idempotencia y auditoría |
| KAN-128 | Idea | Parcial con contrato local ampliado | La promesa visible no estaba probada contra la misma reserva; faltaba exponer la reserva usada para explicar cualquier diferencia | Escenario controlado disponibilidad → confirmación → reserva en PostgreSQL/AWS |
| KAN-129 | Idea | Parcial | El resumen existe, pero no cubre todo el progreso guiado | Validaciones, progreso y contexto persistente |
| KAN-130 | Idea | No verificable todavía | Las pruebas locales no sustituyen la E2E autenticada por rol | Escenarios directo, ensamble, mixto y excepciones |
| KAN-131 | Idea | Parcial con asignación manual implementada | La cola mezclaba owner comercial con trabajo físico y no tenía UI para resolver `MANAGER_REQUIRED` | PostgreSQL: asignación manager → operador, claim, scan-first y siguiente acción |
| KAN-132 | Idea | Parcial con ownership físico alineado | La preparación ya valida ubicación, excepciones y trabajo completo, pero mezclaba responsable comercial con responsable físico | Prueba PostgreSQL/E2E de asignación física → staging, ubicación, cantidades y bloqueo de entrega |
| KAN-133 | En revisión | Parcial/documentado | El proceso está documentado, pero falta cerrar discrepancias entre contrato y Jira | Mapa enlazado, dependencias corregidas y validación técnica |
| KAN-134 | Idea | Parcial con retorno visible | El pedido ya enlaza cada ensamble y valida su cierre, pero la UX no explicaba cuándo el ensamble se incorpora al handoff | Prueba directo, configurado, mixto y retorno de estado |
| KAN-135 | Idea | Fundacional parcial | Faltan normalización completa, duplicados, búsqueda semántica y recomendaciones | Datos tipados y pruebas explicables |

## Dependencias a reconciliar

La secuencia operativa canónica es:

`KAN-128 → KAN-133 → KAN-127 → KAN-131 → KAN-134 → KAN-132 → KAN-130 → KAN-125`

Los enlaces Jira actuales deben revisarse antes de transicionar tickets. La
descripción de KAN-133 exige que el mapa sea revisado antes de cerrar KAN-127,
por lo que KAN-133 debe actuar como prerrequisito documental de KAN-127.

## Registro de 5 Why's

Cada discrepancia debe registrarse con esta estructura:

```text
Observación:
Impacto operativo:
Why 1:
Why 2:
Why 3:
Why 4:
Why 5 / causa controlable:
Corrección:
Ticket responsable:
Evidencia requerida:
Condición de cierre:
```

## Estado de esta reconciliación

- No se han cerrado tickets automáticamente.
- La implementación local existente se considera evidencia parcial hasta tener PR,
  migración y runtime reconciliados.
- Las migraciones de ownership y gobierno técnico requieren aplicación controlada
  antes de declarar completa la capacidad.
- Compras, fiscal y Prisma quedan separados del lote WMS para conservar trazabilidad.

## Evidencia local generada en esta ejecución

- La promesa comercial ahora conserva `reservedQuantity` y la pantalla de disponibilidad,
  el resumen de pedido y la auditoría de revalidación muestran el reservado por almacén.
- La toma de tareas sigue siendo exclusiva y, para `MANAGER_REQUIRED`, sólo permite al
  operador al que se asignó la tarea.
- Se añadió `assignSalesRequestPickTasks`: valida pedido, tarea, estado, modo de
  asignación y rol activo `WAREHOUSE_OPERATOR`; actualiza el responsable físico del
  pedido y registra `ASSIGN_WAREHOUSE_PICK_TASKS`.
- La pantalla de surtido ya muestra la acción manager-only para asignar las tareas
  pendientes y diferencia `Requiere asignación`, `Asignada a operador`, `Tomada por ti`
  y `Tomada por otro operador`.
- El preparado para entrega ya usa un contrato común de ownership físico: prefiere
  `warehouseAssigneeUserId/warehouseClaimedByUserId` y conserva fallback para pedidos
  históricos con responsable comercial tomado.
- El detalle del pedido separa explícitamente `Responsable comercial` de
  `Responsable físico` y comunica cuándo un ensamble está completo e incluido en la
  preparación, o cuándo bloquea el handoff.
- El picking y el cierre del ensamble vinculado a un pedido ahora propagan el
  responsable físico al pedido comercial y registran `CLAIM_WAREHOUSE_ASSEMBLY` y
  `COMPLETE_WAREHOUSE_ASSEMBLY`; el caso de integración queda preparado para
  validarse cuando PostgreSQL esté disponible.
- `npm run typecheck`: verde.
- `npm run lint`: verde.
- `npm run build`: verde; compilación productiva y generación de rutas completadas.
- `npm run test:unit`: verde (37 archivos, 108 pruebas), incluyendo promesa,
  ownership físico y retorno visible de ensamble.
- `npm run test:sales:service`: no verificable en esta ejecución porque PostgreSQL no
  respondió en `wms-web-dev-pg.cvb2fezndc4e.us-east-1.rds.amazonaws.com:5432`. Esto
  bloquea la evidencia de integración, no el cierre del ticket.
- El plan de ejecución de mañana quedó en
  `docs/reconciliation/validation-runbook-2026-08-01.md`, con escenarios V1–V8,
  evidencia mínima y control de autorización para escrituras AWS.

## Decisiones de cierre y pendientes bloqueados

- KAN-128 y KAN-131 permanecen abiertos: el código local es parcial y no existe todavía
  PR/SHA, migración aplicada en el entorno objetivo ni E2E autenticada por rol.
- No se debe cerrar KAN-133 sólo por tener el mapa local: el mapa existe, pero falta
  vincularlo a Jira, corregir o documentar la discrepancia de dependencias y obtener la
  revisión operativa formal.
- La migración y la prueba PostgreSQL deben ejecutarse en una ventana controlada. No se
  autoriza una prueba que cree reservas, movimientos o pedidos en AWS sin identidad,
  SKU, almacén, cantidades, registros esperados y tratamiento de limpieza explícitos.
