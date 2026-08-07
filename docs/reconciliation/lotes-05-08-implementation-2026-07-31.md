# Implementación L05–L08

Fecha de corte: 2026-07-31
Alcance: continuidad operativa, certificación, supervisión y recepción.

## Resultado ejecutivo

L05–L08 quedan preparados en código local para la validación del 2026-08-01.
La implementación mantiene el flujo pedido → surtido/ensamble → staging →
preparado → entrega, agrega indicadores con definición explícita y elimina una
ambigüedad de recepción. La validación autenticada, PostgreSQL y la aceptación de
operación siguen siendo gates; no se declara cierre Jira.

## L05 — Ejecución física y ownership

Tickets relacionados: `KAN-130`, `KAN-131`, `KAN-132`, `KAN-133`, `KAN-134`.

- Se conserva el trabajo directo y de ensamble en superficies continuables por
  pedido; el pedido mixto no puede avanzar a preparado hasta completar ambas ramas.
- La pantalla de surtido mantiene asignación, toma física, bloqueo cuando otro
  operador tiene la tarea y siguiente acción visible.
- El detalle del pedido mantiene separado responsable comercial y responsable físico,
  y muestra el bloqueo de preparado cuando falta una rama o ownership.
- La ruta heredada `/production/fulfillment` quedó como redirect-only; se eliminó
  código muerto que aparentaba ser un tablero alterno y podía confundir la ruta
  canónica de trabajo.
- Estado: implementado localmente; requiere V2–V8 en entorno autenticado.

## L06 — Cobertura E2E y certificación

Tickets relacionados: `KAN-28`, `KAN-127`, `KAN-130`, `KAN-131`, `KAN-132`, `KAN-134`.

- Se añadió un contrato que mantiene alineados el runbook V1–V8 y los tres flujos
  E2E existentes: directo, sólo ensamble y mixto.
- Se hacen explícitas las negativas de preparación, ownership y doble claim en la
  cobertura contractual.
- El E2E transaccional queda listo para mañana, pero no se ejecutó hoy porque
  necesita PostgreSQL y autorización de datos de prueba.
- Estado: cobertura preparada; resultado runtime pendiente.

## L07 — Supervisión y KPIs accionables

Tickets relacionados: `KAN-27`, `KAN-79`.

- El dashboard ahora muestra una ventana móvil de 30 días con:
  - fill-rate de surtido;
  - exactitud de surtido;
  - ciclo promedio de surtido;
  - ciclo promedio de OT.
- Las definiciones quedan visibles en la UI y sólo usan tareas/ciclos con cierre
  registrado; cuando no existe evidencia se muestra `—`, no cero.
- La tarjeta de compras se renombró de “Compras urgentes” a “OCs por recibir”
  porque el conteo actual no tiene relación determinística con pedidos en riesgo.
- Los KPIs se integraron también en las entradas reales de `MANAGER` y
  `SYSTEM_ADMIN` (`/home/manager` y `/home/admin`), no sólo en la ruta raíz.
- Estado: implementado localmente; debe contrastarse contra la operación y datos
  reales antes de convertirlo en KPI oficial.

## L08 — Compras y recepción operable

Tickets relacionados: `KAN-5`, `KAN-23`, `KAN-85`, `KAN-121`, `KAN-122`, `KAN-123`, `KAN-124`.

- La recepción muestra por línea pedido, recibido y pendiente, además de permitir
  buen estado, diferencias, motivo y revisión previa a confirmar.
- Se conserva la validación de ubicación `RECV`, límites de cantidad, concurrencia,
  movimientos de inventario, etiquetas y documento de recepción.
- El conteo del tablero enlaza a la bandeja “por recibir”, no a una etiqueta de
  urgencia que el dato actual no puede probar.
- Estado: implementado localmente; faltan pruebas de operador y confirmación del
  contrato de compras/reabasto.

## 5 Why's del tramo

### Discrepancia D — KPI de compras sobrerotulado

- Observación: “Compras urgentes” contaba todas las OCs entrantes.
- Why 1: el conteo no relacionaba líneas de OC con pedidos en riesgo.
- Why 2: esa relación requiere una regla de abastecimiento todavía no definida.
- Why 3: la etiqueta convirtió un indicador de volumen en una decisión de urgencia.
- Why 4: no existía definición publicada del KPI.
- Why 5 / causa controlable: faltaba separar señal operativa actual de métrica futura.
- Corrección: renombrar a “OCs por recibir” y enlazar a su bandeja real.

### Discrepancia E — Recepción parcial difícil de interpretar

- Observación: el operador sólo veía la cantidad pendiente de cada línea.
- Why 1: no se mostraban pedido y recibido junto al campo de captura.
- Why 2: se asumía que la bandeja ya explicaba el contexto.
- Why 3: la recepción parcial se opera desde una pantalla independiente.
- Why 4: el resumen de confirmación no sustituye el contexto por línea.
- Why 5 / causa controlable: faltaba un contrato visual pedido–recibido–pendiente.
- Corrección: mostrar las tres cantidades antes de capturar y confirmar.

## Criterio para mañana

No cerrar Jira hasta contar con V1–V8 ejecutados, evidencia de datos antes/después,
validación por rol, resultado del KPI contra la operación y confirmación de que no
se generaron movimientos o auditorías duplicados.

## Evidencia local de esta entrega

- `npm run typecheck`: verde.
- `npm run lint`: verde.
- `npm run test:unit`: verde; 40 archivos, 116 pruebas.
- `npm run prisma:validate`: verde.
- `npm run build`: verde.
- `git diff --check`: sin errores; sólo advertencias de normalización CRLF.
- La suite transaccional `test:sales:service` no se considera aprobada: el RDS
  `wms-web-dev-pg.cvb2fezndc4e.us-east-1.rds.amazonaws.com:5432` no responde.
- No se aplicaron migraciones, no se hizo deploy y no se escribieron datos AWS.
