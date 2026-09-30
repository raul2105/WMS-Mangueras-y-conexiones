# Validación del entregable WMS — 29 de septiembre de 2026

Estado: en ejecución. No constituye aceptación operativa ni cierre de Jira.

## Estado vigente al 30 de septiembre

Los apartados siguientes conservan la secuencia y los manifiestos de ejecución. El estado más reciente es: migraciones 24 y 25 aplicadas sobre DEV público, diff 0, huellas existentes preservadas y 114 FK validadas; RDS ya no admite PostgreSQL desde todo internet, Lambda usa subredes aisladas con salida IPv6 y cuatro servicios Google respondieron HTTPS. No hay NAT Gateway nuevo. La retención efectiva aún es un día y se debe reconciliar con los siete declarados.

El candidato incorpora Gmail independiente por Manager (permiso de envío, sin lectura del buzón ni login Google al WMS), conexiones cifradas por usuario, estados inciertos y conciliación manual auditada. Las tres pruebas de concurrencia real de correo y 13 casos de servicio pasaron en RDS; las 15 pruebas de inventario anteriormente omitidas también pasaron. La auditoría actual de dependencias indica cero avisos tras actualizar versiones y parches. La regresión de esas actualizaciones, la restauración real de snapshot y el despliegue del runtime candidato siguen en curso.

La configuración Google está preparada en Chrome del perfil rigentec.com, proyecto wms-gmail-rigentec-20260929, con facturación Pagina Web Rigentec expresamente autorizada. Está pendiente aceptar la política Google, crear el cliente OAuth y el consentimiento individual. El envío real de Gmail y su disponibilidad para todos los Managers aún no están validados.

La alerta presupuestal AWS de USD 5 no tiene filtros y cuenta toda la cuenta: reportó USD 13.941 y pronóstico USD 14.665 al consultar. No demuestra gasto exclusivo del WMS. Se preserva el objetivo del usuario, sin NAT ni infraestructura mensual nueva para las pruebas; la instancia de recuperación es temporal y debe eliminarse.

## Alcance y autorización

El objetivo mantiene la operación completa del proyecto y todos sus perfiles: administración, gerencia, almacén y ventas. Los requisitos se contrastan con Jira KAN, las rutas/RBAC, los servicios, las migraciones y los escenarios V1–V8 del runbook. La inclusión fiscal/CFDI e IA sigue pendiente de definición; no se declaran terminadas esas capacidades.

El usuario autorizó el 29 de septiembre todas las pruebas directamente contra AWS y pidió detener la ejecución si era necesario renovar login. El login ya fue completado y STS confirmó cuenta **904891391424**, identidad **arn:aws:iam::904891391424:user/Raul_ITsupport**. El presupuesto objetivo sigue siendo **USD 5 mensuales**; el usuario permite excederlo con justificación explícita.

## Fuentes actuales

- Checkout: `codex/wms-5w2h-implementation`, HEAD `ddf3bd1dd47dcc620ab530b1948c4dee9146f800`, con cambios pendientes. Los cambios no versionados no están identificados por ese SHA.
- PR candidato: [108](https://github.com/raul2105/WMS-Mangueras-y-conexiones/pull/108), draft al iniciar la revisión.
- Runtime DEV: <https://d2b1ltxtvypxr4.cloudfront.net>; health reportó el SHA anterior y release `dev-ddf3bd1dd47d-20260904T181901Z`. Falta desplegar y validar los cambios nuevos.
- Stack: `WmsWebDevStack`, `us-east-1`, estado `UPDATE_COMPLETE` al retomar.
- RDS: `wms-web-dev-pg`, base `wms`, PostgreSQL **16.13**, almacenamiento cifrado, retención efectiva de **un día**. La configuración del código indica siete días: es una discrepancia, no evidencia de siete días de backups.
- Snapshot previo: `wms-dev-pre-delivery-20260929`, estado **available**, progreso 100 %. No se ha probado una restauración.
- Jira: inventario consultado de 119 issues (71 terminados, 48 abiertos), con 17 épicas. El estado de Jira no demuestra por sí mismo ejecución AWS ni aceptación humana.

## Evidencia obtenida

| Comprobación | Resultado | Límite |
|---|---|---|
| Navegación y acceso por los cuatro perfiles en AWS | 11 pruebas aprobadas | Versión desplegada anterior; no cubre todas las mutaciones |
| Carreras reales de reserva y confirmación de ensamble en RDS | 3 pruebas aprobadas; esquema propio eliminado | Código candidato ejecutado contra RDS; todavía no demuestra el runtime Lambda nuevo |
| Instalación nueva sobre la misma instancia RDS, DB temporal propia | 24 migraciones, diff sin diferencias, seed y dos repeticiones aprobados; DB eliminada | No aplica automáticamente la migración a la base canónica |
| Accesibilidad automatizada de ocho superficies en AWS | 8 pruebas aprobadas, ocho JSON, cero violaciones detectadas | No sustituye lector de pantalla, revisión manual ni UAT |
| Homes de cuatro roles, cuatro anchos y dos temas en AWS | 32 capturas; revisión automatizada aprobada | Sin aceptación humana y con labels anteriores al candidato |
| KAN-128, promesa y handoff en AWS, sólo lectura | 1 prueba aprobada | No demuestra V1–V8 completo |
| Integridad pública de inventario | 54 filas, cero negativas y cero discrepancias quantity/reserved/available | Snapshot de lectura; debe repetirse después de las pruebas |
| Foreign keys públicas | 113, todas validadas | Debe repetirse después de la migración candidata |
| Historial público de migración | 23 aplicadas, ninguna inconclusa | No prueba igualdad completa del esquema; falta la migración 24 |
| Lint y TypeScript del candidato | Aprobados antes de cambios posteriores en pruebas | Compilación estática; volver a revisar al congelar candidato |

## Correcciones candidatas

1. Revalidación de cuentas activas y roles vigentes en cada sesión de servidor; revocación de privilegios sin confiar en roles antiguos del JWT.
2. Visibilidad por pedido en el PDF de entrega; un vendedor no obtiene documentos de pedidos ajenos mediante un ID.
3. Protección contra fórmulas de hojas de cálculo en CSV de auditoría y kardex.
4. Control concurrente de reservas, tareas, líneas e inventario WIP; conflictos abortan la transacción.
5. Foco contenido en el menú móvil y restauración al cerrar; indicadores de administración/gerencia con significado y destino coherentes.
6. Migración aditiva `20260929190000_reconcile_deployable_catalog_relations`: conserva relaciones existentes y permite desplegar desde una base vacía. En AWS público faltan Customer.createdAt, un índice de reviewedBy y el nombre esperado de un índice de compatibilidad.
7. Aislamiento PostgreSQL por archivo de pruebas para impedir contaminación entre suites. La limpieza sólo contempla esquemas del Run ID propio.

## Manifiesto de regresión PostgreSQL AWS

- Run ID: **awsfull20260929_a6d952**.
- Destino: `wms-web-dev-pg.cvb2fezndc4e.us-east-1.rds.amazonaws.com:5432`, base `wms`; autenticación PostgreSQL recuperada del entorno existente sin registrar secretos.
- Identidad de control AWS: perfil `Raul_ITsupport`, cuenta e identidad STS indicadas arriba.
- Comando: `npm run test:postgres -- --maxWorkers=1`.
- Alcance: todos los archivos incluidos por `vitest.config.ts`; incluye contratos/lógica y casos integrados, sin equiparar pruebas simuladas con comportamiento Lambda.
- Cada archivo usa un esquema nuevo `t_awsfull20260929_a6d952_f<hash16>`. Se crean tablas y fixtures exclusivamente allí: usuarios/roles temporales, productos, proveedores, clientes, almacenes, ubicaciones, órdenes, tareas, reservas, movimientos, documentos y auditorías según cada caso.
- Antes de ejecutar se rechaza un Run ID ya existente. El runner elimina sólo esquemas que coinciden con `^t_awsfull20260929_a6d952_f[0-9a-f]{16}$` y comprueba que no quede ninguno. No se limpia `public` ni esquemas de ejecuciones anteriores.
- No se ejecutan seed, migrate reset ni db push sobre `public` en esta regresión. Las migraciones de instalación nueva se validan por separado en un esquema AWS propio.
- Registro de ejecución: `output/aws-postgres-full-2026-09-29.log`. Resultado pendiente.
  Resultado posterior: exit 0, 92 archivos aprobados y uno omitido; 483 casos aprobados, 14 omitidos por la condición histórica SQLite de inventario. Se eliminaron los 93 esquemas propios y se verificó su ausencia. El resultado corresponde al código cargado por esa ejecución; los cambios posteriores Gmail requieren validación separada.

## Pendientes que impiden declarar el 100 %

- RDS acepta TCP/5432 desde `0.0.0.0/0` y Lambda está fuera de VPC. Restringir sólo la IP de oficina rompería Lambda; hace falta un cambio coherente de red y prueba posterior, con costo justificado.
- Aplicar la migración candidata sobre DEV público con respaldo, comprobar diff e integridad, desplegar un candidato versionado y probar la versión exacta.
- Completar V1–V8, compras/recepción/documentos, usuarios/revocación, gobernanza técnica, reabasto, exportaciones, impresión y superficies móviles con evidencia acorde a cada requisito.
- Investigar las ocho ejecuciones recientes de CI con fallo de login AWS pese a controles de código aprobados. La prueba directa aprobada no corrige ni cierra ese fallo de CI.
- Auditoría de dependencias: cero críticas, nueve altas y dos moderadas en la lectura realizada. Evaluar las rutas afectadas y remediaciones; no se ha aceptado el riesgo.
- Configuración de correo/proveedor y capacidades fiscales/IA pendientes no pueden declararse operativas por simulaciones.
- Aceptación humana de operación, restauración de respaldo y conciliación final Jira/GitHub/runtime/base de datos pendientes.

El apagado de costos activo está programado a las **20:00 America/Mexico_City** entre semana. Las pruebas deben conservar evidencias y limpieza antes del apagado o extender una ventana de forma controlada, preservando la configuración posterior.

## Manifiesto de migración canónica DEV

Se aplicará únicamente `20260929190000_reconcile_deployable_catalog_relations` a `wms.public` en RDS DEV. El snapshot previo está disponible y la instalación/repetición de las 24 migraciones ya pasó en una base temporal de esa misma instancia.

La inspección pública confirma que las cuatro FK y las relaciones proveedor/marca/almacén ya existen y no tienen huérfanos; la migración mantiene esos objetos. Los cambios efectivos esperados son agregar `Customer.createdAt`, crear el índice de `ProductTechnicalSource.reviewedByUserId` y normalizar el nombre de un índice de compatibilidad. Para los clientes históricos que carecen de `createdAt`, el valor inicial será la fecha de aplicación: **no demuestra su fecha de creación real**. Se preservan IDs, valores y relaciones existentes. No hay seed, borrado, reset ni reconciliación de reservas en este paso.

El ejecutor aborta si cuenta/host/base/esquema no coinciden o hay migraciones pendientes adicionales. Captura hashes de filas antes/después y comprueba diff e integridad. El rollback de runtime puede conservar esta migración aditiva; no se eliminarán columnas o relaciones para revertir código. Evidencia: `output/canonical-migration-20260929.json` y su log. Resultado pendiente.
Resultado posterior: migración 24 aplicada, hashes preservados, diff 0 y 113 FK validadas; no se ejecutaron seed, reset ni borrado de registros públicos.

## Manifiesto de validación Gmail e inventario en AWS

Run ID `awsgmail20260929_7c42a9`; mismo RDS DEV/base wms y perfil/account STS ya indicados. Alcance: `tests/email/gmail-connection.unit.test.ts`, `gmail-oauth-state.test.ts`, `provider-ipv6.unit.test.ts`, `tests/rbac/manager-gmail-settings-nav.test.ts` y `tests/inventory-integrity.test.ts`. Cada archivo usa exclusivamente su esquema `t_awsgmail20260929_7c42a9_f<hash16>`. Inventario/importaciones crean productos, ubicaciones, almacenes, inventarios y movimientos allí; las llamadas Google se simulan en los casos unitarios, sin enviar correo ni acceder a buzones. CSV de fixtures usan un directorio temporal único, sin sobrescribir catálogos del usuario. El runner verifica y elimina únicamente esquemas del run propio. No se modifica wms.public. Resultado pendiente en `output/aws-gmail-inventory-20260929.log`.

Gmail acordado: cada Manager conecta su propia cuenta para enviar OC, separado del login WMS. Primera cuenta/contacto: rrios@rigentec.com; todo seguimiento Google se hará en el perfil corporativo rigentec.com. No se asignan roles por dirección Google ni por vinculación OAuth. Configuración y consentimiento reales pendientes; no equivalen a los tests simulados.

La primera ejecución enfocada terminó con 22 casos aprobados y tres fallidos de inventario. Las expectativas excluidas eran anteriores al contrato vigente de importación: ahora se exige una ubicación registrada y se rechazan referencias duplicadas antes de escribir. Se corrigieron las fixtures y se añadieron aserciones de no escritura/relaciones preservadas; no se debilitó el importador. Los cinco esquemas propios fueron eliminados y comprobados.

Run de repetición `awsmail20260930_49f6ca`, mismo AWS/RDS/schema aislado por archivo. Incluye todos los archivos `tests/email`, tests de correo/contrato de compras, RBAC Manager Gmail e inventario (15 casos). Scopes de limpieza exclusivos `t_awsmail20260930_49f6ca_f<hash16>`; sin correos reales ni modificaciones públicas. Evidencia `output/aws-mail-inventory-final-20260930.log`; resultado pendiente.

## Red desplegada y ventana de costos

ChangeSet `wms-network-hardening-v3-20260929` aplicado con `UPDATE_COMPLETE`: añadió dos subredes aisladas IPv4/IPv6, Egress-Only IGW y SG Lambda, conservó VPC/subredes públicas/RDS/código runtime, retiró controles WMS antiguos ya eliminados por el optimizador y cerró ingress PostgreSQL mundial. No se crearon NAT Gateways. El primer intento se revirtió por colisión con un SG homónimo existente; la nueva SG tiene nombre propio y se comprobó su ausencia antes de crearla. El registro/cambio completo está en `output/network-hardening-20260929/`. Verificación efectiva posterior pendiente; no equivale a despliegue del nuevo código de aplicación.

Se extendió temporalmente la ventana del RDS DEV para terminar la regresión y su limpieza. El guardián restituyó Environment=dev a las 03:30Z (21:30 CDMX) y retiró la etiqueta de ejecución; mantuvo RDS encendida para evitar interrumpir escrituras. Se comprobó después esa restauración. La instancia sigue disponible fuera de horario mientras se termina el trabajo autorizado; deberá detenerse explícitamente al finalizar la validación, pues la orden de apagado de las 20:00 ya pasó. Este tiempo adicional se justifica por pruebas/limpieza/despliegue, sin infraestructura de red con cargo fijo nueva.

## Repetición de correo y concurrencia AWS, 30 de septiembre

La ejecución awsmail20260930_49f6ca terminó con 44 casos aprobados y cuatro fallidos: tres mocks no exportaban la constante de conciliación y una fixture de reenvío conservaba NOT_SENT pese al intento previo. Inventario pasó sus 15 casos; los ocho esquemas propios se eliminaron. Se corrigieron los mocks/fixture sin alterar las reglas de dominio.

Run nuevo `awscas20260930_51e920`, cuenta 904891391424/perfil Raul_ITsupport, RDS DEV wms. Ejecuta tests/email, contrato/servicio de correo de compras y concurrencia real de correo. Cada archivo crea tablas y fixtures sólo en `t_awscas20260930_51e920_f<hash16>`; los casos de concurrencia crean Managers QA, proveedores example.invalid, productos, almacenes, OC, documento oficial, intentos y auditorías propios. Sólo PDF/proveedor se simulan, los bloqueos y FK son reales en RDS; cero correo externo. No escribe en public. El runner elimina y comprueba ausencia de los esquemas exclusivos de este run. Log `output/aws-email-cas-20260930.log`; resultado pendiente.

Prueba IPv6 Google: función temporal propia wms-dev-qa-google-ipv6-20260930, cuenta 904891391424/perfil Raul_ITsupport, mismas subredes/SG/rol existente de la Lambda WMS DEV. Código fijo consulta DNS AAAA y HTTPS público de discovery, token sin credenciales, userinfo sin credenciales y Gmail profile sin credenciales; no envía correo, no lee buzones ni secretos, no toca RDS. Sin URL pública ni permisos nuevos. Se elimina exclusivamente la función creada por este run y se conserva evidencia en output/google-ipv6-probe-20260930/evidence.json; si ya existe se aborta sin reemplazar/borrar. Coste sólo de invocación y ENI temporal compartida, sin NAT.

Prueba IPv6 Google aprobada: discovery 200, token GET sin credenciales 404, userinfo/Gmail sin credenciales 401; cuatro resoluciones familia 6 y HTTPS completado. Función temporal eliminada, evidencia guardada. Confirma conectividad desde las subredes Lambda, no consentimiento ni entrega Gmail.

awscas20260930_51e920: 34 casos aprobados y tres de la nueva integración fallidos por el arnés (mock PDF incompleto y modificación de un delegate Prisma al restaurar el spy). Los siete esquemas propios quedaron eliminados. Se preservan helpers reales de PDF y se usa un proxy que delega las operaciones a PostgreSQL sin mutar el cliente global. Repetición awscas20260930_b792ce con mismo alcance/identidad/fixtures, limpieza exclusiva t_awscas20260930_b792ce_f<hash16> y log output/aws-email-cas-retry-20260930.log.

## Manifiesto de migración Gmail 25

Validación de instalación nueva: crea una única base propia wms_gmail_validation_20260930_<hex8> en el RDS DEV existente, cuenta/perfil/host canónico ya indicados. Aplica las 25 migraciones, compara esquema, crea User y conexión ficticios example.invalid para probar unicidad y eliminación en cascada; no contacta Google. Cierra clientes y elimina únicamente esa base creada por el ejecutor, comprobando ausencia. Evidencia output/gmail-migration-20260930/fresh-evidence.json. No hace seed/reset ni escrituras de negocio sobre wms.public.

Aplicación canónica propuesta: sólo migración aditiva 20260929200000_add_per_user_gmail_connections a wms.public, después de prueba fresca aprobada y limpiada, snapshot disponible y exactamente una migración pendiente. Añade columnas nulas, estados de envío y tabla vacía de conexión por User. Huellas de diez tablas existentes antes/después deben ser idénticas excluyendo sólo las columnas recién agregadas; diff 0 y todas las FK validadas. No importa ni vincula cuentas Google. Evidencia output/gmail-migration-20260930/apply-evidence.json. Los estados históricos y relaciones existentes se preservan; ningún proveedor recibe correo.

La instalación nueva con las 25 migraciones pasó (diff 0, unicidad por usuario y cascade comprobadas); se eliminó y verificó la base temporal wms_gmail_validation_20260930_d5c561bb. Aplicación canónica de la migración Gmail iniciada con los guardas del manifiesto.

Dependencias: auditoría nueva 30/09 identificó 26 avisos (17 altos, seis moderados, tres bajos), más que la lectura previa por avisos recién publicados. Se actualizó Nodemailer 10.0.13 para MIME/envío, csv-parse 7.0.3, Vitest 4.1.11, dependencias de Prisma config mediante overrides explícitos (effect 3.22.2, deepmerge-ts 8.0.2, defu 6.1.7), y parches compatibles del lock con npm audit fix sin force. Next 16.3.3/Prisma 6.19.2/Auth beta32 se conservan. Auditoría posterior: cero avisos en todas las severidades; falta demostrar compatibilidad con pruebas/build, no se equipara al cierre completo de seguridad.

Run awspatch20260930_067df3: regresión de superficies afectadas por dependencias y código (Gmail, compras/contrato/concurrencia, inventario/importación, revocación auth, assembly, CSV), cuenta/perfil/RDS DEV ya indicados; esquemas por archivo t_awspatch20260930_067df3_f<hash16>, todos los fixtures sólo allí. Google/PDF de casos de correo se simulan, cero mensajes reales. Runner elimina/verifica únicamente esquemas propios. Log output/aws-security-regression-20260930.log; resultado pendiente.

## Manifiesto de restauración de respaldo AWS

Destino propio wms-dev-restore-qa-20260930, snapshot cifrado wms-dev-pre-delivery-20260929, cuenta/perfil us-east-1 ya indicados. Instancia temporal db.t4g.micro single-AZ en el mismo subnet group y SG PostgreSQL ya restringida a oficina/Lambda; sin endpoint de aplicación ni conexión de usuarios. Se rechaza nombre existente. Se restaura el snapshot real y se leen exclusivamente datos de la copia: huellas de siete tablas versus baseline anterior a migración, 113 FK, integridad de inventario e historial de migraciones. La URL canónica/runtime no se modifica. Se elimina exclusivamente la instancia creada por este run con tag ValidationRun=restore-proof-20260930, sin snapshot final duplicado y comprobando eliminación. Coste temporal de cómputo/almacenamiento se justifica para demostrar recuperación real; no añade un servicio mensual permanente. Evidencia output/restore-proof-20260930/evidence.json. Si falla eliminación se reporta como limpieza pendiente y no se borra ningún recurso ajeno.

Restauración real AWS aprobada: copia cifrada disponible, huellas de siete tablas idénticas al baseline del snapshot, 113 FK validadas, 54 inventarios consistentes y 23 migraciones concluidas (punto previo a las migraciones nuevas). Instancia QA eliminada y eliminación confirmada a 2026-09-30T06:44:51Z; cleaned=true. Confirma recuperación de ese snapshot; no promete recuperación de cambios posteriores a ese punto.

Regresión posterior a dependencias aprobada: awspatch20260930_067df3, 27 archivos y 152 casos aprobados, cero omitidos. Incluyó Gmail/MIME, compras, inventario/CSV, revocación de sesión, ensamble/concurrencia y exportaciones. Los 27 esquemas propios fueron eliminados y se verificó ausencia. Lint y TypeScript aprobados. Build Next de candidato aprobado; OpenNext Windows requiere reparación declarada de Sharp Linux ARM64 0.35.4. El artefacto verificado previo midió 73 MB al retirar engines ajenos, sourcemaps de Prisma y .env del operador. La privacidad Gmail se permite públicamente por ruta exacta; el build final debe contener ese cambio.

Entrega candidata preparada para DEV: publicar el código revisado de esta rama, incluyendo las correcciones operativas preexistentes ya cubiertas por la regresión AWS, sin mezclar archivos personales/no relacionados que estaban sin seguimiento. Antes de ejecutar CloudFormation se revisarán replacements (RDS/VPC/subredes deben conservarse), cambios de permisos y código/release exactos. Gmail quedará sin credenciales operativas hasta completar la configuración y consentimiento Google; la UI debe explicarlo y no permitir enviar con otro proveedor global.
