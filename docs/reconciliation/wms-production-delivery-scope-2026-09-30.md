# Alcance de cierre operativo — 30 de septiembre de 2026

El propietario solicita completar el WMS con todos sus perfiles y relaciones de datos, especialmente producción y ensamble. Excluye expresamente Gmail, Prisma 7, backlog fiscal e IA. Producción comprende tanto el proceso de fabricación/surtido como la preparación del sistema para uso operativo; una prueba de DEV no convierte automáticamente ese entorno en producción.

## Jira consultado en esta revisión

La consulta `project = KAN AND statusCategory != Done ORDER BY key ASC` devolvió 49 pendientes sin páginas adicionales: 25 incluidos y 24 excluidos. No se cambiaron sus estados por esta clasificación.

| Frente incluido | Tickets pendientes | Comprobación requerida |
|---|---|---|
| Solicitudes y captura | KAN-3, KAN-16 | Captura por teclado, confirmación, reserva, surtido y entrega |
| Seguridad hidráulica | KAN-4, KAN-19, KAN-20, KAN-21 | Reglas persistentes, fuentes, presión/temperatura, equivalencias vigentes y rechazo de bypass |
| Compras y reabasto | KAN-5, KAN-23, KAN-83, KAN-86, KAN-87 | OC, PDF, recepción, discrepancias, inventario, presets, móvil y temas |
| Gobierno y entrega técnica | KAN-6, KAN-7, KAN-26, KAN-28, KAN-137, KAN-138 | Actor/auditoría atómica, perfiles reales, CI, recuperación, runtime y acceso seguro |
| Ventas, almacén y producción | KAN-125, KAN-127, KAN-128, KAN-130, KAN-131, KAN-132, KAN-133, KAN-134 | V1–V8, ownership, directo/configurado/mixto, excepciones, staging y entrega |

Excluidos: KAN-85 y KAN-121–124 (correo); KAN-99–109 y KAN-111 (fiscal); KAN-112–117 (Prisma 7); KAN-135 (IA). Mantener Prisma 6 y sus protecciones de seguridad vigentes. La reducción de vulnerabilidades de KAN-137 sigue incluida y no supone migrar a Prisma 7.

## Evidencia y brechas

El candidato anterior `9020001355360a5f7e82332fbb70a81aa8748bf0` tiene evidencia de CI y AWS en `output/aws-seedguard-*` y CI manual [36693182582](https://github.com/raul2105/WMS-Mangueras-y-conexiones/actions/runs/36693182582). Es una evidencia histórica de ese SHA, no validación de los cambios de esta revisión. El PR [108](https://github.com/raul2105/WMS-Mangueras-y-conexiones/pull/108) permanecía draft; falta reconciliar integración final y runtime del nuevo candidato.

Las suites existentes cubren los recorridos directo, sólo ensamble y mixto, además de V1/V5/V7/V8. Para cerrar V1–V8 se requiere mapear las aserciones específicas de V2/V3/V4/V6 y completar la evidencia faltante, incluyendo excepciones y acciones por perfil. El mapa operativo está en `docs/process/kan-133-sales-to-warehouse-process-map.md`.

La revisión de órdenes genéricas identificó auditoría con actor `system`, creación auditada por código en lugar de ID y falta de coordinación entre edición y cierre concurrente. Cambios preparados: actor obtenido de la sesión autorizada, estados before/after, control concurrente previo a efectos en inventario, rechazo de orden vacía y de ubicación inactiva/ajena. Hay cinco casos de regresión nuevos para AWS PostgreSQL, incluido fallo real de auditoría mediante un trigger acotado al esquema desechable. No ejecutar ese fault injector en `public`.

También debe comprobarse y completar la auditoría/actor de cancelación y liberación de surtido de ensamble: `cancelAssemblyWorkOrder` y `releaseAssemblyPickList`. No declarar KAN-26 terminado sólo porque el helper de auditoría ya propague errores.

### Regresión PostgreSQL y migraciones de esta revisión en AWS

- Seguridad de sesiones, usuarios, salud y órdenes genéricas: 32 pruebas en seis archivos aprobadas en `security0930_abe661b`; seis esquemas aislados limpiados. La suite adicional de administradores/auditoría aprobó 11 pruebas en tres archivos en `admin0930_972ee27`, con limpieza de los tres esquemas. Ocho pruebas de usuarios se repitieron; no sumar ambas corridas como pruebas únicas.
- Migración PostgreSQL real 25→26: aplicada en una base temporal del mismo RDS. Fingerprints históricos idénticos, campo nuevo nullable sin backfill, diferencia de esquema cero y base temporal eliminada (`output/technical-snapshot-migration-20260930/fresh-evidence.json`). Esto no afirma aplicación en `public`.
- Regresión transversal `flows0930_0be8abd`: 130 aprobadas y 29 fallidas en 21 archivos; todos los esquemas de la corrida quedaron limpios. Se conserva el log original. Las fallas incluyen fixtures sin roles, orden de limpieza contrario a FKs, contratos anteriores a los cambios y atribución de auditoría de borradores; requieren corrección y repetición, no cierre por mayoría de pruebas verdes.
- Recepción de compras tras corregir fixtures y aserción del campo real del movimiento: 15/15 aprobadas en `receivingretry10930_df66`; esquema temporal eliminado. Incluye concurrencia, rollback real por rechazo de auditoría y conservación de plantillas desactivadas por Manager.
- Segunda corrida focalizada `flowsretry10930_3263543`: 87/88 aprobadas en nueve archivos; nueve esquemas temporales eliminados. Ventas, ownership, fuentes, especificaciones y RBAC aprobaron. El único fallo restante fue un motivo de ocho caracteres en el fixture que pretendía comprobar una revisión obsoleta: corregir el dato sin reducir la exigencia de motivo. La revisión posterior detectó que debe distinguirse aprobación de combinación para ensamble de aprobación de sustitución; ese ajuste exige regresión adicional antes del despliegue.
- Regresión de propósito `flowsretry20930_cfaccf3`: 50/52 aprobadas, cinco esquemas limpiados. Se conservaron dos errores de fixture (propósito antiguo y disponibilidad previa a reserva). En `flowsretry30930_9855554`, el caso de snapshot de Ventas aprobó; el caso nuevo detectó la restricción unique por par orientado y propósito. El fixture se corrigió para coexistencia de bloqueo/aprobación en sentidos opuestos, que el evaluador consulta juntos. `flowsretry40930_d405463` aprobó el escenario completo y limpió su esquema: bloqueo prevalece, rechazo sin efectos, reserva 1 reduce disponible 10→9 y snapshot histórico permanece idéntico al retirar su regla.
- `npm audit --omit=dev` del 30/09/2026: cero avisos en dependencias productivas. La seguridad del acceso y de los datos se valida separadamente.

Los logs y manifiestos están bajo `output/aws-production-*20260930*`. Las comprobaciones de TypeScript, ESLint, generación Prisma y síntesis CDK son estáticas; no se usó un runtime local para reemplazar pruebas AWS. Aún falta validar el candidato construido y desplegado con navegador, migración canónica y recuperación final.

KAN-138 resolvió técnicamente la exposición de las claves públicas: las cinco identidades conservaron IDs, correos y perfiles; sus claves privadas y los secretos E2E se renovaron, con recuperación DPAPI guardada antes de escribir. Los cinco accesos aprobaron en el navegador AWS y rechazaron claves públicas y JWT previos (`output/live-credential-rotation-20260930/evidence.json`). Las 25 fixtures históricas se desactivaron sin borrar relaciones (`output/historical-test-user-retirement-20260930.json`). `rrios@rigentec.com` pertenece al contexto Google y no sustituye sus correos WMS.

## Validación y despliegue pendientes

1. AWS `Raul_ITsupport` confirmó la cuenta `904891391424`. CloudFormation terminó `UPDATE_COMPLETE`; el runtime canónico `3f2b4de9513a89fdd71b0cbcd2fe662b6971744f` respondió `environment: prod`, `db: up`. Las 26 migraciones están aplicadas en `public`, incluida la columna de snapshot técnico con datos históricos conservados. No ejecutar pruebas locales como sustituto.
2. Confirmar cuenta/región, estado RDS y runtime canónicos. Recuperar conexión únicamente en la sesión y preservar snapshots, migraciones e historial operativo.
3. Ejecutar regresión PostgreSQL en esquemas nuevos de esta corrida; limpiar sólo esos esquemas. Crear manifiesto separado para las escrituras de navegador y sus fixtures propios, con fingerprints antes/después.
4. Completar los criterios incluidos; construir el artefacto nuevo y revisar el change set sin reemplazo de RDS. Probar producción, compras, permisos y visuales en AWS del SHA exacto.
5. Preservar la transición de acceso ya comprobada: cinco identidades originales con claves privadas, secretos E2E renovados y 25 fixtures históricas inactivas. Verificar estas propiedades en la recuperación final; no repetir la rotación ni el retiro sobre usuarios ya protegidos.
6. Reconciliar PR/main, CI, SHA desplegado, migraciones y Jira. Cerrar cada ticket sólo con sus criterios cubiertos; conservar excluidos como entrega posterior.

El entorno canónico se promovió para operación conservando los nombres físicos históricos `WmsWebDevStack` y `wms-web-dev-pg`. La configuración productiva se aplica al stack existente mediante `productionMode`, con etiquetas `Environment=prod` y `cost-opt:enabled=false`, protección de eliminación y retención de datos, secretos y assets. El optimizador inspeccionado selecciona dev/test/staging; producción queda fuera de ese horario. `infra/cdk/config/prod.json` no crea un segundo runtime ni una segunda base. La referencia de USD 5 sigue como alerta; el cómputo continuo de RDS implica USD 11.68/mes antes de créditos y otros servicios, con justificación y evidencia en `docs/security/production-runtime-hardening-2026-09-30.md`.

La primera aceptación del SHA productivo 3f2b4de registró 35 pruebas aprobadas, cuatro fallidas y once omitidas. Las fallas y los recorridos omitidos deben resolverse con pruebas AWS; ni el health ni una mayoría de pruebas aprobadas permiten afirmar cierre global. Evidencia preservada: `output/aws-acceptance/runs/aws-acceptance-20260930T204315Z-f2075ba3/results.json`. El cierre exige integración main/runtime, gates completos de cada criterio y restauración final del snapshot con las 26 migraciones y usuarios protegidos.

### Correcciones posteriores a la primera aceptación

La repetición `aws-acceptance-20260930T210309Z-f23d49db` obtuvo siete aprobadas, dos fallidas y dos recorridos no ejecutados. Los errores restantes mostraron selección de SHIPPING en vez de una ubicación tipada STAGING, y recepción de OC limitada por prefijo de código. La fuente corregida selecciona staging por uso operativo y acepta zonas RECEIVING activas del almacén de entrega, sin depender de su nombre. La regresión PostgreSQL de staging aprobó un caso; recepción aprobó 23/24, y la aserción restante, que dependía del orden no garantizado de filas, aprobó en su repetición focalizada. Estos resultados corresponden al working tree, pendiente de despliegue.

El importador CSV ahora autentica al actor, agrupa producto, atributos, inventario, movimiento, auditoría e ImportLog en una transacción, conserva ubicaciones omitidas y revierte el lote si falla la auditoría o cambia el saldo concurrentemente. La corrida `csvcas0930_e7d8c02` aprobó 32/32 pruebas en AWS y eliminó su esquema propio. Los nuevos recorridos browser de inventario, solicitudes directas a Server Actions y conteo de asignaciones físicas siguen pendientes de ejecución sobre el siguiente candidato.

La protección de main se sincronizó con los nombres reales de CI: Quality Gate (required), Security Audit (critical gate) y AWS Read-only E2E (release evidence). Se preservaron strict, enforce_admins y las demás reglas. El job AWS se omite en ejecuciones de código; la promoción exige además dispatch y evidencia AWS del SHA desplegado. Prueba: `output/main-protection-release-sync-proof-20260930.json`. La auditoría productiva renovada el 01/10 UTC mantiene cero avisos; las tres alarmas AWS están OK, con datos faltantes tratados como no incidentes, lo cual no reemplaza aceptación funcional.

### Validación del candidato f76241438391 — 1 de octubre UTC

El candidato `f76241438391a884496ba42160ebb1e1e4702d40` se desplegó con CloudFormation UPDATE_COMPLETE y health productivo con DB disponible. CI manual [36802416192](https://github.com/raul2105/WMS-Mangueras-y-conexiones/actions/runs/36802416192) aprobó Quality, Security y la validación AWS de lectura; el job móvil de staging no sustituye el recorrido móvil canónico.

La aceptación browser `aws-acceptance-20261001T014258Z-0d7371c1` obtuvo 40 aprobadas, tres fallidas y diez omitidas: ocho requieren el proyecto móvil y dos quedaron sin ejecutar por dependencia serial. Fallaron la selección de tema en la prueba de inventario, el control autorizado de importación por identificación de Server Action y la visibilidad de preparación para un operador secundario. No equivale a aceptación global.

La repetición de inventario `aws-acceptance-20261001T020120Z-bfcf3553`, con el toggle real, reveló contraste insuficiente en una ayuda del formulario oscuro (3.31:1 frente al mínimo 4.5:1). La comprobación se conserva, y se corrige el componente. La vista de preparación se alinea con el backend: responsable físico autenticado o supervisor con motivo de override. Cada corrección requiere su nueva evidencia AWS antes del cierre.

### Aceptación 9da425e — 1 de octubre, 14:46 UTC

La corrida `aws-acceptance-20261001T143152Z-8aa17911` terminó con 43 aprobadas, dos fallidas y ocho omisiones exclusivas de móvil. Completó los tres pedidos directo, ensamblado y mixto, ownership físico, controles directos de permisos de Server Actions, compras/recepción de OC y auditoría. El transporte de prueba usa WHATWG Request para conservar los campos ocultos vacíos; Playwright multipart omitía `$ACTION_ID` vacío y causaba el 500 previo. Los controles autorizados y denegados se ejecutaron y verificaron sus efectos.

Persisten dos gates: recepción manual sin notas, que el validador rechazaba por recibir `null` en vez de `undefined`, y revisión técnica extensa, que agotó el límite global de 240 segundos después de publicar fuente/regla/equivalencia. Se corrige el dato opcional de recepción y se permite un límite total de diez minutos sólo a ese recorrido, manteniendo los límites por acción y añadiendo tiempos de fase. Sus repeticiones y la importación CSV web confirmada siguen pendientes; no se declara aceptación global.

La regresión PostgreSQL consolidada `finalflows0930_85a2e58` conservó 199 aprobadas y un timeout de 30 segundos entre 200 casos, con 22 esquemas limpios. La repetición `finalshareddelivery0930_ad52eb7` aprobó el único caso pendiente (una entrega exitosa, una rechazada por disponibilidad insuficiente, un solo movimiento y saldo correcto), con su esquema eliminado. Son evidencias separadas; no representan una única corrida de 200/200.
