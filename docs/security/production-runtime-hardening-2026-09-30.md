# Promoción del entorno canónico para operación

El propietario autorizó terminar producción y justificar cualquier exceso sobre la alerta mensual de USD 5. La instancia canónica sigue siendo `wms-web-dev-pg`, dentro de `WmsWebDevStack`, cuenta `904891391424`, región `us-east-1`. Los nombres históricos se conservan para evitar reemplazar RDS, separar datos o crear una infraestructura duplicada. `productionMode` distingue el uso operativo del nombre físico; el runtime debe declarar `WMS_ENVIRONMENT=prod`.

## Cambio preparado y comprobación de infraestructura

La síntesis CDK del 30/09/2026 terminó sin errores. Su plan conserva el identificador de RDS y exige `DeletionProtection=true`, políticas `Retain` para RDS, sus credenciales, el secreto de sesión y assets; no permite el vaciado automático de S3. La versión instalada de CDK es 2.x, posterior a la corrección documentada de `autoDeleteObjects` de 1.126.0. [Referencia AWS](https://docs.aws.amazon.com/cdk/api/v2/java/software/amazon/awscdk/services/s3/BucketProps.html).

Las etiquetas operativas se preparan como `Environment=prod` y `cost-opt:enabled=false`. El optimizador global inspeccionado selecciona por Environment `dev,test,staging`: cambiar sólo `cost-opt:enabled` no basta. La comprobación posterior debe verificar ambas etiquetas efectivas, RDS disponible fuera de la ventana DEV y ausencia de reglas locales de apagado. Se mantienen red IPv6 privada de Lambda, ingress RDS únicamente desde SG Lambda y oficina IPv4 /32, cifrado, backup automático de siete días y Gmail deshabilitado.

Se prepararon tres alarmas consultables en CloudWatch: fallos de Lambda, tasa de errores HTTP 5xx de CloudFront y menos de 2 GiB libres en RDS. No envían mensajes externos. El endpoint público de salud conservará versión/SHA/release y disponibilidad de DB, pero eliminará host, esquema, ruta y errores internos de conexión.

La configuración identifica explícitamente la cuenta operativa y el despliegue/CDK rechazan una identidad de otra cuenta. El proveedor SDK de credenciales de consola se renueva mediante `credential_process`, conservando los secretos únicamente en memoria; la prueba de autorización contra AWS terminó correctamente. La URL de PostgreSQL declara `sslmode=require`. La lectura canónica del 30/09 verificó TLS 1.2 activo, `rds.force_ssl=1` en el grupo de parámetros AWS, 54 saldos consistentes y 114 FKs validadas (`output/aws-canonical-transport-integrity-20260930.json`). [TLS en RDS PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html).

`output/production-infra-plan-summary-20260930.json` contiene el plan sin secretos. La síntesis no acredita un despliegue: antes de ejecutar CloudFormation hay que revisar el change set y rechazar reemplazos de RDS/VPC/subredes, cambios inesperados de seguridad o pérdida de datos. Después se comprueban propiedades efectivas, etiquetas, health del SHA nuevo y recorridos AWS.

## Justificación del costo

La consulta oficial AWS Price List del 30/09/2026, SKU `9HPEGXQTDDGH53C9`, PostgreSQL Single-AZ `db.t4g.micro` en us-east-1, devuelve USD 0.016 por hora. A 730 horas/mes, el cómputo de RDS por sí solo equivale a USD 11.68 antes de créditos, almacenamiento, IPv4 pública, secretos, S3, alarmas, consumo e impuestos. La disponibilidad continua solicitada supera por tanto USD 5 sin créditos; ese umbral permanece como alerta y no se interpreta como un tope garantizado. [Precios oficiales RDS](https://aws.amazon.com/rds/postgresql/pricing/).

No se crean NAT Gateways, una segunda base productiva ni planes de cómputo adicionales. La factura observada de toda la cuenta incluye otros proyectos y no se atribuye íntegramente al WMS. Evidencia de tarifa en `output/rds-production-price-list-20260930.json`; el costo final depende de uso y créditos efectivos.

## Recuperación y acceso

Mantener los cinco usuarios con sus IDs, correos, perfiles y relaciones según la decisión del propietario. La protección de sus claves y revocación de JWT anteriores se valida por separado; nunca copiar secretos a Jira, PR ni logs. El procedimiento está en `operational-account-cutover.md`.

Un snapshot disponible no demuestra por sí solo recuperación. El snapshot final debe probarse mediante una restauración temporal controlada, comparando migraciones, relaciones y fingerprints; registrar y eliminar únicamente la instancia temporal. La evidencia de una restauración anterior con menos migraciones no sustituye esa comprobación final.

La ejecución está preparada en `scripts/ops/aws-production-recovery-proof.ps1 -ExpectedCommitSha <SHA validado>`, desde la raíz del repositorio. Exige runtime productivo del SHA exacto, RDS protegido, snapshot cifrado, ingress restringido y nombre/tags propios para autorizar la limpieza de la instancia temporal. El helper `scripts/ops/aws-recovery-fingerprints.cjs` compara todas las tablas, incluyendo usuarios y migraciones, sin exportar registros ni credenciales. La instancia temporal supone consumo AWS durante la restauración; se elimina al terminar y se conserva el snapshot operativo. Una restauración de un checkpoint anterior a la rotación exige renovar credenciales antes de volver a exponer el sistema.
