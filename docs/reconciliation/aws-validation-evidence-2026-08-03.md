# Evidencia de validación AWS — 2026-08-03

## Alcance

Validación funcional controlada contra el entorno AWS de desarrollo:

- URL: `https://d2b1ltxtvypxr4.cloudfront.net`
- Región: `us-east-1`
- Base de datos: PostgreSQL canónico en AWS
- Pedido histórico `PI-2026-0010`: no modificado
- Datos creados: únicamente pedidos de prueba autorizados para esta validación

## Controles previos

Los siguientes controles locales pasaron antes de la validación remota:

- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm run prisma:validate`
- `npm run test:unit` — 40 archivos, 116 pruebas

El endpoint remoto `/api/health` respondió `200` con `db: "up"` después del despliegue.

## V2 — Pedido directo

### Identificación

- Pedido: `PI-2026-0011`
- ID: `b98e31f8-c040-4afd-8a6a-ce062594d30d`
- Cliente: `Cliente prueba`
- Almacén: `WH-02`
- SKU: `DEV-ASM-HOSE-DN10-R2AT`
- Cantidad: `1`

### Resultado observado

1. Ventas creó y confirmó el pedido.
2. Almacén liberó el surtido, tomó la tarea y confirmó la cantidad.
3. La tarea quedó `COMPLETED`; el pick list quedó `COMPLETED`.
4. Almacén confirmó `Preparado para entrega` en `STAGING-WH-02`.
5. Ventas tomó el pedido y confirmó la entrega al cliente.
6. La interfaz mostró `Entregado`, comprobante PDF e historial.

### Evidencia persistida

- Reserva inicial de una unidad y liberación al completar la entrega.
- Movimiento de transferencia de una unidad y movimiento de salida de una unidad.
- Auditoría completa: creación, confirmación, liberación, toma física, surtido, preparación, toma comercial y entrega.
- No se observó una segunda auditoría de entrega ni una segunda salida para el mismo pedido.

## V3 — Ensamble de tres componentes

### Identificación

- Pedido: `PI-2026-0012`
- ID: `4684b36f-c0db-4970-bb13-f2e547e9e927`
- Orden de ensamble: `ENS-2026-0006`
- ID de orden de producción: `a962bb72-44ae-4325-8528-eb94aff800ec`
- Cliente: `Cliente prueba`
- Almacén: `WH-02`
- Componentes, cantidad requerida por componente: `1`
  - `DEV-ASM-FIT-IN-DN10-JIC`
  - `DEV-ASM-HOSE-DN10-R2AT`
  - `DEV-ASM-FIT-OUT-DN10-RECTA`

### Resultado observado

1. Ventas configuró y confirmó el pedido.
2. Almacén liberó materiales.
3. Almacén confirmó las tres tareas de surtido.
4. La orden quedó `COMPLETADA`; las tres líneas quedaron `CONSUMED` con `required=1`, `reserved=1`, `picked=1`, `consumed=1`, `short=0`.
5. Almacén confirmó la preparación física en `STAGING-WH-02`.
6. Ventas tomó el pedido y confirmó la entrega.
7. La interfaz mostró `Entregado` y `Orden de ensamble completada`.

### Evidencia persistida

- Pick list `PK-ENS-2026-0006` quedó `COMPLETED` con tres tareas completadas.
- Orden de ensamble quedó `CONSUMED` y cerrada.
- La auditoría de entrega apareció una sola vez.
- Las reservas de los tres componentes quedaron liberadas después del consumo.

## Matriz de perfiles

| Perfil | Comprobación | Resultado |
|---|---|---|
| Ejecutivo de Ventas | Tomar pedido preparado y confirmar entrega | Verificado |
| Operador de Almacén | Liberar, surtir, consumir ensamble y preparar entrega | Verificado |
| Manager | Consultar pedido entregado, historial y comprobante | Verificado |
| Admin | Consultar pedido entregado, historial y comprobante | Verificado |

La preparación física permanece separada de la responsabilidad comercial: Almacén prepara; el Ejecutivo responsable confirma normalmente la entrega.

## V4 — Pedido mixto

### Identificación

- Pedido: `PI-2026-0013`
- ID: `dba2c1c5-76a2-4405-a988-8fcdc1374137`
- Línea directa: `DEV-ASM-HOSE-DN10-R2AT`, cantidad `1`
- Línea configurada: los tres componentes de ensamble, cantidad `1`

### Resultado observado

- La línea directa se liberó y completó en `PK-SUR-2026-0007`.
- La orden `ENS-2026-0007` se liberó y consumió sus tres componentes.
- El pedido no pasó a preparado hasta que ambas líneas terminaron.
- Almacén confirmó `STAGING-WH-02`; Ventas tomó y entregó el mismo pedido.
- La interfaz mostró simultáneamente `Surtido completado`, `Orden de ensamble completada` y después `Preparado para entrega`.

## V7 — Gate de faltante

Se intentó crear un ensamble de `7` unidades cuando el componente de salida disponía de `6` unidades. La interfaz mostró la advertencia de stock insuficiente y el servidor rechazó la creación con:

```text
Assembly order requires exact stock for all three components
```

No se creó pedido, orden de producción, reserva ni movimiento de inventario. Esto confirma que el sistema bloquea la promesa antes de generar trabajo físico incompleto.

## V8 — Idempotencia observable

Consulta posterior en AWS:

- `PI-2026-0011`: una auditoría `MARK_DELIVERED_TO_CUSTOMER`, un movimiento de salida.
- `PI-2026-0012`: una auditoría `MARK_DELIVERED_TO_CUSTOMER`.
- `PI-2026-0013`: una auditoría `MARK_DELIVERED_TO_CUSTOMER`, un movimiento de salida.

Los pedidos entregados no muestran una segunda acción de entrega en la interfaz. Esta corrida verifica idempotencia observable en el estado final; no sustituye una prueba de concurrencia con dos sesiones simultáneas.

### V8.1 — Concurrencia de toma de tarea en dos sesiones

Se ejecutó una corrida controlada contra AWS con dos sesiones de navegador abiertas simultáneamente sobre el mismo pedido:

- Pedido: `PI-2026-0014`
- ID: `4765a9c1-1fd1-49d5-901b-118d21e73c8f`
- Lista: `PK-SUR-2026-0008`
- Tarea: `1a6449db-b115-461f-9595-4d819a55afa6`
- SKU: `DEV-ASM-HOSE-DN10-R2AT`, cantidad `1`

Las dos sesiones estuvieron autenticadas como `Operador Almacen`; por tanto, esta prueba valida la carrera transaccional de toma de una misma tarea y no sustituye una matriz de permisos entre dos operadores distintos.

Resultado observado:

1. La primera sesión confirmó la toma y obtuvo `Tareas tomadas (1)`.
2. La segunda sesión intentó confirmar la misma toma y recibió el mensaje del servidor `Una o más tareas fueron tomadas mientras confirmabas`.
3. La tarea persistió con un solo `claimedByUserId`, `status=COMPLETED`, `pickedQty=1` y `shortQty=0` después de completar el flujo.
4. La lista persistió como `COMPLETED`.
5. El pedido continuó hasta `Preparado para entrega` y `Entregado`.
6. La auditoría contiene exactamente una acción `CLAIM_WAREHOUSE_PICK_TASKS` y exactamente una `MARK_DELIVERED_TO_CUSTOMER`.
7. Sólo existe un movimiento `OUT` de cantidad `1` para la entrega.

La evidencia visual de rechazo está en `output/playwright/kan130-concurrency-rejection-aws-2026-08-03.png`; la evidencia visual del cierre está en `output/playwright/kan130-concurrency-final-aws-2026-08-03.png`.

## No verificado todavía

Estos escenarios no se declaran cerrados con esta corrida:

- V1: precisión de disponibilidad/promesa en `Nuevo Pedido` ligada a la misma reserva transaccional.
- V7: ensamble incompleto ya persistido y autorización de excepción Manager/Admin.
- Validación operativa con usuarios humanos externos al integrador.

No se modificaron estados Jira ni se cerraron KAN-128, KAN-133, KAN-134, KAN-130 o KAN-125 con esta evidencia.
