# Implementación L01–L04

Fecha de corte: 2026-07-31
Alcance: primeros cuatro lotes del plan de 54 elementos Jira.

## Resultado ejecutivo

Los lotes quedaron implementados de forma parcial-controlada en código local. Las
validaciones estáticas y unitarias son la primera evidencia; PostgreSQL, E2E
autenticada, migración aplicada y aceptación de operación siguen siendo gates
pendientes.

## L01 — Gobierno, auditoría y calidad

Tickets: `KAN-6`, `KAN-7`, `KAN-26`.

- La pantalla de auditoría traduce los eventos críticos nuevos a lenguaje operativo:
  asignación, toma y cierre de ensamble, preparado para entrega y resolución de
  excepciones.
- Se conserva el manifiesto de cierre: criterios Jira, 5 Why's, PR/SHA, migración,
  pruebas, runtime, riesgos y decisión.
- Estado: avance local; cierre pendiente de gate transversal y runtime.

## L02 — Maestro técnico y compatibilidad

Tickets: `KAN-4`, `KAN-19`, `KAN-20`, `KAN-21`.

- Las especificaciones técnicas ahora validan contradicciones dimensionales, presión
  de ruptura y temperaturas sin bloquear la edición de registros históricos
  incompletos.
- Las reglas activas de compatibilidad se evalúan al configurar un ensamble.
  `BLOCK` detiene la configuración; `WARN` queda como revisión explícita.
- Se eliminó una segunda sincronización que podía borrar la fuente técnica curada
  después de guardar el producto.
- Estado: contrato local y pruebas unitarias; falta validar datos reales de marcas,
  migración aplicada y bloqueo backend en PostgreSQL.

## L03 — Captura comercial y promesa

Tickets: `KAN-16`, `KAN-76`, `KAN-128`, `KAN-129`, `KAN-54`, `KAN-118`.

- El resumen móvil muestra la misma promesa que escritorio: almacén, solicitado,
  disponible, reservado, estado y hora de verificación.
- Se corrigió la presentación del nombre del almacén en móvil.
- La promesa continúa validándose contra inventario actual en servidor; el cierre de
  `KAN-128` requiere la prueba controlada disponibilidad → confirmación → reserva.
- Estado: avance local; UX transversal y runtime siguen pendientes.

## L04 — Contrato ventas → almacén

Tickets: `KAN-133`, `KAN-127`.

- El flujo existente conserva ownership físico, estados de handoff, idempotencia y
  auditoría para pedido directo, ensamble y pedido mixto.
- Picking y cierre de ensamble propagan el operador físico al pedido comercial y
  registran `CLAIM_WAREHOUSE_ASSEMBLY` y `COMPLETE_WAREHOUSE_ASSEMBLY`.
- Estado: contrato implementado localmente; falta revisión de operador y prueba
  PostgreSQL/E2E para aprobar el mapa y cerrar la discrepancia Jira-operación.

## Registro 5 Why's de este lote

### Discrepancia A — Promesa ausente en móvil

- Observación: la promesa era visible en escritorio pero no en el resumen móvil.
- Why 1: la variante móvil no recibía `commercialPromise`.
- Why 2: escritorio y móvil tenían contratos de props distintos.
- Why 3: la validación se concentró en la existencia del bloque desktop.
- Why 4: no había prueba contractual de paridad móvil.
- Why 5 / causa controlable: el componente compartido no definía la promesa como
  requisito transversal.
- Corrección: prop compartida, bloque móvil y prueba de no regresión.

### Discrepancia B — Compatibilidad sólo informativa

- Observación: la regla podía verse en catálogo, pero no impedir configurar un
  ensamble.
- Why 1: no existía un servicio que leyera reglas activas al configurar.
- Why 2: el modelo de datos estaba separado del flujo de producción.
- Why 3: la aceptación se verificaba visualmente, no en backend.
- Why 4: no existía prueba de combinación incompatible.
- Why 5 / causa controlable: faltaba conectar el contrato técnico con la transición
  operativa.
- Corrección: evaluación `allowed/review/blocked`, bloqueo `BLOCK` y prueba unitaria.

### Discrepancia C — Fuente técnica potencialmente perdida

- Observación: editar un producto podía dejar sus especificaciones sin fuente.
- Why 1: la sincronización se ejecutaba dos veces.
- Why 2: la segunda llamada no conservaba `sourceId`.
- Why 3: no había prueba de persistencia de fuente después de editar.
- Why 4: la escritura técnica no estaba centralizada en un único paso.
- Why 5 / causa controlable: duplicidad de lógica en el flujo de guardado.
- Corrección: eliminar la segunda sincronización y mantener una sola fuente curada.

## Evidencia local

- `npm run typecheck`: verde.
- `npm run test:unit`: verde; 38 archivos, 112 pruebas.
- `npm run lint`: verde.
- `npm run prisma:validate`: verde.
- `npm run build`: verde.
- `npm run test:sales:service`: bloqueado antes de iniciar pruebas porque el RDS
  `wms-web-dev-pg.cvb2fezndc4e.us-east-1.rds.amazonaws.com:5432` no responde.
- No se aplicaron migraciones ni se hicieron escrituras AWS.
