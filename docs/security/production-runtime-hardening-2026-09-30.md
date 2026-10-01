# Promoción del entorno canónico para operación

## Corrección del presupuesto durante la promoción de main

El 01/10/2026 la promoción de `103e1c5` volvió a
`UPDATE_ROLLBACK_COMPLETE`: cambiar `NotificationsWithSubscribers` exige
reemplazar el recurso AWS Budgets y el nombre explícito anterior impidió crear
el sustituto. La revisión inicial sólo rechazaba reemplazos `True`; el plan
marcaba este cambio como `Conditional`. El health posterior conservó el
runtime `9d3311d`, `environment=prod` y `db=up`.

En producción el presupuesto pasa a llamarse
`wms-web-dev-production-monthly-limit`, manteniendo USD 5, costo mensual y
umbral real de 80 %. El nombre distinto permite crear el presupuesto conectado
al topic de alertas antes de retirar el presupuesto anterior. La revisión del
próximo plan debe permitir exclusivamente ese reemplazo de `MonthlyBudget`;
RDS, red y recursos persistentes siguen protegidos. Esto no acredita aún el
despliegue ni la entrega de notificaciones.
[Contrato de reemplazo de AWS Budgets](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-budgets-budget.html).

## Corte vigente — 2026-10-01 UTC

El candidato productivo vigente de este corte es
`9d3311d05706f360c23b2ce7813fe999393fa044`, release
`prod-9d3311d05706-20261001T145012Z`. CloudFormation está en
`UPDATE_COMPLETE`; el health devuelve `environment=prod`, `db=up` y coincide
con ese SHA. El change set de promoción tuvo 12 cambios, cero reemplazos y 42
recursos de infraestructura sin cambios. Evidencia: `output/production-9d3311d-cloudformation-complete-20261001.json`,
`output/production-9d3311d-changeset-executed-20261001.json`,
`output/production-runtime-9d3311d-health-20261001.json` y la revisión del
plan sin reemplazos.

El CI manual 36881811703 terminó exitoso para este SHA, incluidos Quality
Gate, Security Audit, AWS Read-only E2E y smoke PWA móvil. La evidencia AWS de
sólo lectura confirma identidad de runtime/DB y vistas; no sustituye las
pruebas mutables. En este corte ya terminaron los focos browser de inventario
(`aws-acceptance-20261001T151004Z-f553a689`, 1/1) y continuidad mixta con
teclado (`aws-acceptance-20261001T151310Z-93b66483`, 3/3), ambos con cleanup
de fixtures propios. Los resultados 9da425e de gobierno (`357472df`) y
Server Actions/CSV (`301efca8`) también pasaron sus escenarios focales; no
convertirlos en una aceptación de navegador completa.

El estado del sistema queda desplegado y validado por los focos enumerados,
pero la entrega final aún requiere integrar main/runtime al SHA final, ejecutar
la suite browser final completa en Chromium, móvil, Firefox y WebKit, y probar
la restauración controlada contra las 26 migraciones. El script de recuperación
refuerza `sslmode=require` y los chequeos previos; el restore final todavía no
se ejecutó. Debe comparar en `public` los fingerprints, cinco identidades y
roles protegidos, 25 usuarios históricos inactivos y las migraciones antes de
eliminar sólo la instancia temporal.

Hay un gate operativo independiente de la salud del runtime: la inspección de
monitoreo del 2026-10-01 encontró las tres alarmas productivas en estado `OK`,
pero todas tienen `actions: []`; el presupuesto `wms-web-dev-monthly-limit`
(USD 5) referencia el topic inexistente `wms-web-dev-budget-alerts` y SNS no
tiene suscripciones. Por tanto, no hay evidencia de entrega de notificaciones
de alarmas ni de presupuesto. La IaC correctiva está en preparación; la
configuración y verificación de un destino de alertas siguen pendientes.
Evidencia: `output/production-monitoring-actions-20261001.json` y
`output/production-alarm-state-refresh-20261001.json`.

Gmail, Prisma 7, fiscal/contabilidad e IA siguen fuera del alcance de esta
entrega y abiertos para trabajo posterior. No declarar el WMS 100% terminado
hasta completar los gates anteriores y reconciliar Jira/GitHub con evidencia
terminal del SHA final.

El propietario autorizó terminar producción y justificar cualquier exceso sobre la alerta mensual de USD 5. La instancia canónica sigue siendo `wms-web-dev-pg`, dentro de `WmsWebDevStack`, cuenta `904891391424`, región `us-east-1`. Los nombres históricos se conservan para evitar reemplazar RDS, separar datos o crear una infraestructura duplicada. `productionMode` distingue el uso operativo del nombre físico; el runtime debe declarar `WMS_ENVIRONMENT=prod`.

## Cambio aplicado y comprobación de infraestructura

CloudFormation terminó en `UPDATE_COMPLETE` el 30/09/2026 a las 20:32 UTC. El runtime confirmó `environment=prod`, DB disponible y SHA `3f2b4de9513a89fdd71b0cbcd2fe662b6971744f`, release `prod-3f2b4de9513a-20260930T201252Z`. El change set revisado tuvo cero reemplazos obligatorios y conservó las propiedades de red e IAM. La lectura efectiva de RDS confirmó cifrado, siete días de backup, `DeletionProtection=true`, endpoint y datos conservados. Evidencias: `output/production-changeset-review-20260930.json`, `output/production-cloudformation-complete-20260930.json`, `output/production-rds-properties-20260930.json` y `output/production-runtime-health-20260930.json`.

La síntesis CDK del 30/09/2026 terminó sin errores. Su plan conserva el identificador de RDS y exige `DeletionProtection=true`, políticas `Retain` para RDS, sus credenciales, el secreto de sesión y assets; no permite el vaciado automático de S3. La versión instalada de CDK es 2.x, posterior a la corrección documentada de `autoDeleteObjects` de 1.126.0. [Referencia AWS](https://docs.aws.amazon.com/cdk/api/v2/java/software/amazon/awscdk/services/s3/BucketProps.html).

Las etiquetas operativas se preparan como `Environment=prod` y `cost-opt:enabled=false`. El optimizador global inspeccionado selecciona por Environment `dev,test,staging`: cambiar sólo `cost-opt:enabled` no basta. La comprobación posterior debe verificar ambas etiquetas efectivas, RDS disponible fuera de la ventana DEV y ausencia de reglas locales de apagado. Se mantienen red IPv6 privada de Lambda, ingress RDS únicamente desde SG Lambda y oficina IPv4 /32, cifrado, backup automático de siete días y Gmail deshabilitado.

Se prepararon tres alarmas consultables en CloudWatch: fallos de Lambda, tasa de errores HTTP 5xx de CloudFront y menos de 2 GiB libres en RDS. No envían mensajes externos. El endpoint público de salud conservará versión/SHA/release y disponibilidad de DB, pero eliminará host, esquema, ruta y errores internos de conexión.

La configuración identifica explícitamente la cuenta operativa y el despliegue/CDK rechazan una identidad de otra cuenta. El proveedor SDK de credenciales de consola se renueva mediante `credential_process`, conservando los secretos únicamente en memoria; la prueba de autorización contra AWS terminó correctamente. La URL de PostgreSQL declara `sslmode=require`. La lectura canónica del 30/09 verificó TLS 1.2 activo, `rds.force_ssl=1` en el grupo de parámetros AWS, 54 saldos consistentes y 114 FKs validadas (`output/aws-canonical-transport-integrity-20260930.json`). [TLS en RDS PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html).

`output/production-infra-plan-summary-20260930.json` contiene el plan sin secretos. La síntesis no acredita un despliegue: antes de ejecutar CloudFormation hay que revisar el change set y rechazar reemplazos de RDS/VPC/subredes, cambios inesperados de seguridad o pérdida de datos. Después se comprueban propiedades efectivas, etiquetas, health del SHA nuevo y recorridos AWS.

## Justificación del costo

La consulta oficial AWS Price List del 30/09/2026, SKU `9HPEGXQTDDGH53C9`, PostgreSQL Single-AZ `db.t4g.micro` en us-east-1, devuelve USD 0.016 por hora. A 730 horas/mes, el cómputo de RDS por sí solo equivale a USD 11.68 antes de créditos, almacenamiento, IPv4 pública, secretos, S3, alarmas, consumo e impuestos. La disponibilidad continua solicitada supera por tanto USD 5 sin créditos; ese umbral permanece como alerta y no se interpreta como un tope garantizado. [Precios oficiales RDS](https://aws.amazon.com/rds/postgresql/pricing/).

No se crean NAT Gateways, una segunda base productiva ni planes de cómputo adicionales. La factura observada de toda la cuenta incluye otros proyectos y no se atribuye íntegramente al WMS. Evidencia de tarifa en `output/rds-production-price-list-20260930.json`; el costo final depende de uso y créditos efectivos.

## Parche de seguridad del candidato

El CI de `335f6bf` bloqueó Next.js 16.3.3 por GHSA-vcvr-r3jv-pc5j. El advisory oficial identifica el rango afectado anterior a 16.3.6; se actualizan Next y su configuración ESLint a 16.3.8, una revisión posterior del mismo minor, manteniendo Prisma 6.19.2 y OpenNext 3.10.4. No se encontraron usos de `next/og`/`ImageResponse` en `app` o `lib`; aun así se respeta el gate de seguridad y se reconstruye el candidato. [Advisory oficial de Vercel](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j).

La consulta npm posterior al parche devolvió cero avisos productivos en `output/npm-production-audit-patched-20260930.json`. El build anterior de 335f6bf queda como evidencia estática rechazada para promoción. Los dos contratos que fallaron en ese CI se alinearon con el helper real de recepción y con el escenario ampliado de continuidad; cinco comprobaciones aprobaron en la corrida AWS `contractsretry10930_5bf2`, con limpieza de sus dos esquemas. Esas comprobaciones no sustituyen los recorridos del nuevo runtime.

## Recuperación y acceso

Mantener los cinco usuarios con sus IDs, correos, perfiles y relaciones según la decisión del propietario. La protección de sus claves y revocación de JWT anteriores se valida por separado; nunca copiar secretos a Jira, PR ni logs. El procedimiento está en `operational-account-cutover.md`.

Un snapshot disponible no demuestra por sí solo recuperación. El snapshot final debe probarse mediante una restauración temporal controlada, comparando migraciones, relaciones y fingerprints; registrar y eliminar únicamente la instancia temporal. La evidencia de una restauración anterior con menos migraciones no sustituye esa comprobación final.

La ejecución está preparada en `scripts/ops/aws-production-recovery-proof.ps1 -ExpectedCommitSha <SHA validado>`, desde la raíz del repositorio. Exige runtime productivo del SHA exacto, RDS protegido, snapshot cifrado, ingress restringido y nombre/tags propios para autorizar la limpieza de la instancia temporal. El helper `scripts/ops/aws-recovery-fingerprints.cjs` compara todas las tablas, incluyendo usuarios y migraciones, sin exportar registros ni credenciales. La instancia temporal supone consumo AWS durante la restauración; se elimina al terminar y se conserva el snapshot operativo. Una restauración de un checkpoint anterior a la rotación exige renovar credenciales antes de volver a exponer el sistema.

## Integridad canónica previa a promoción

La migración `20260930210000_add_technical_selection_snapshot` se aplicó en el esquema canónico AWS `wms/public`: 25 a 26 migraciones, 114 FKs validadas y fingerprints de datos preservados. Evidencia: `output/technical-snapshot-migration-20260930/apply-evidence.json`. El cambio es una columna nullable compatible con el runtime anterior; esta prueba no acredita la nueva interfaz desplegada.

La lectura de cuentas encontró cinco identidades del seed y 25 fixtures históricas activas de junio. `scripts/security/retire-historical-test-users.cjs` desactivó exclusivamente esas 25 fixtures el 30/09, manteniendo IDs, correos, roles y relaciones. Comprobó el manifiesto exacto, coincidencia de los 25 hashes con el marcador estático de prueba y cuenta/host/esquema canónicos. La transacción serializable conservó fingerprints de las demás tablas y añadió 25 auditorías del Admin real. Evidencia: `output/historical-test-user-retirement-20260930.json`. Los cinco accesos operativos se mantienen activos y aprobaron su rotación privada, rechazo de claves públicas y revocación de JWT previos: `output/live-credential-rotation-20260930/evidence.json`.

## Validación posterior — corte histórico del runtime 3f2b4de

Las alarmas efectivas incluyen Lambda Errors, RDS FreeStorageSpace y CloudFront 5xx con las dimensiones `DistributionId` y `Region=Global`; esta última dimensión es necesaria para observar métricas reales. Evidencias: `output/production-alarms-20260930.json` y `output/cloudfront-global-metric-proof-20260930.json`. RDS conserva `Environment=prod` y `cost-opt:enabled=false`, por lo que queda fuera del selector dev/test/staging del optimizador inspeccionado. La retirada del antiguo helper de borrado automático de S3 terminó sin vaciar assets ni recrear permisos amplios; el stack quedó estable.

La primera corrida de aceptación del SHA 3f2b4de terminó con 35 pruebas aprobadas, cuatro fallidas y once omitidas. Esta cifra pertenece sólo a ese candidato y se conserva como historial; no describe el runtime vigente. El resultado íntegro se conserva en `output/aws-acceptance/runs/aws-acceptance-20260930T204315Z-f2075ba3/results.json`. Para el corte actual, aplicar la sección vigente al principio: el runtime es `9d3311d` y quedan las pruebas finales de navegador/móvil/Firefox/WebKit y restauración controlada, no una repetición genérica de todos los fallos de SHA anteriores.
