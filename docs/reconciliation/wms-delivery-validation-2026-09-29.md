# Validación del entregable WMS — 29 de septiembre de 2026

Estado: en ejecución. No constituye aceptación operativa ni cierre de Jira.

## Estado vigente al 30 de septiembre

Los apartados siguientes conservan la secuencia histórica y los manifiestos; sus resultados pendientes originales no representan el estado vigente. Migraciones 24 y 25 aplicadas sobre DEV público, diff 0, huellas existentes preservadas y 114 FK validadas. RDS ya no admite PostgreSQL desde todo internet; Lambda usa subredes aisladas con salida IPv6 y cuatro servicios Google respondieron HTTPS. No hay NAT Gateway nuevo. La retención efectiva ya se verificó en siete días y el almacenamiento declarado se reconcilió con gp3 existente.

El candidato incorpora Gmail independiente por Manager (permiso de envío, sin lectura del buzón ni login Google al WMS), conexiones cifradas por usuario, estados inciertos y conciliación manual auditada. La regresión AWS posterior a dependencias pasó 152 casos en 27 archivos, sin omitidos, y eliminó sus 27 esquemas propios. El ajuste posterior que vincula el token al remitente elegido pasó 25 casos en tres archivos AWS y eliminó sus tres esquemas. La auditoría actual de dependencias indica cero avisos. La restauración real del snapshot pasó y su instancia temporal quedó eliminada. Runtime 2526826 desplegado y DB up, incluye el vínculo de remitente y corrección de contraste; dos ajustes móviles posteriores requieren nuevo candidato versionado y despliegue.

Aceptación mutable del runtime 0904728: los cuatro gates V1/V5/V7/V8 pasaron en la ronda final; los pedidos directos, de ensamble, mixtos y ensamble configurado pasaron en la ronda anterior. Las rondas fallidas quedan conservadas: navegación Manager desactualizada en el arnés y reutilización de layout al cambiar de actor, corregidas antes de repetir. Limpieza final comprobó huellas de nueve tablas preservadas, cero productos/almacenes QA, 54 inventarios consistentes y 114 FK válidas. Gmail sin configuración real pasó tres pruebas fail-closed de UI/API; no demuestra entrega de correo. El CI manual 36681468354 falló por la expectativa anterior de siete enlaces Manager; requiere repetición con el arnés corregido y SHA desplegado exacto.

Repetición completa sobre 2526826: ocho escenarios mutables aprobados y limpieza comprobada; 22 casos de roles/RBAC/Gmail/accesibilidad aprobados, incluidas ocho superficies sin infracciones axe. KAN-128 falló inicialmente por omitir sus tres identificadores en la invocación; se configuraron y la repetición pasó. Móvil: seis de ocho aprobados; filtros de Ventas medían 122 px frente al objetivo de menos de 120 y cerrar menú con Escape no devolvía foco al disparador tras toque. Se elimina sólo padding sobrante y se fija foco del disparador antes de abrir; se deben repetir los ocho casos en AWS. El CI 36685580236 encontró una prueba de manipulación cifrada no determinista (reemplazar un carácter Base64 puede conservar los bytes); se cambia un bit real del ciphertext y los nueve casos Gmail pasaron en AWS, esquema propio eliminado.

Jira KAN-85/KAN-125/KAN-137 actualizado con evidencia y pendientes; KAN-137 pasó de Idea a En curso. Ninguna épica se cerró. PR 108 se mantiene draft y su descripción refleja el entregable actual. Backlog fiscal KAN-99/100/101, IA KAN-135 y migración funcional Prisma 7 KAN-112 siguen sin aceptación operativa; no se incluyen como capacidades terminadas por reducir deuda de dependencias.

La configuración Google está preparada en Chrome del perfil rigentec.com, proyecto wms-gmail-rigentec-20260929, con facturación Pagina Web Rigentec expresamente autorizada. Está pendiente aceptar la política Google, crear el cliente OAuth y el consentimiento individual. El envío real de Gmail y su disponibilidad para todos los Managers aún no están validados.

Se prepara el despliegue final con las correcciones móviles de ed328ef. La infraestructura posterior incorpora configuración Gmail persistente mediante un secreto con RETAIN y referencias seguras; la configuración actual mantiene enabled=false y secretName=null, por lo que no provisiona el secreto ni habilita envíos. Los tres modos de template (desactivado, provisionado y habilitado) se comprobaron estáticamente; esto no demuestra autorización Google ni envío. El artefacto OpenNext se construyó en ed328ef y cualquier revisión posterior de este candidato cambia únicamente infraestructura/documentación, con igualdad del código de aplicación y hashes de assets registrada antes del despliegue. La evidencia final del SHA efectivo, CI y repetición AWS se adjunta a PR 108 y a output/aws-final-*; no se presume aprobada por este manifiesto previo.

La alerta presupuestal AWS de USD 5 no tiene filtros y cuenta toda la cuenta: reportó USD 13.941 y pronóstico USD 14.665 al consultar. No demuestra gasto exclusivo del WMS. Se preserva el objetivo del usuario, sin NAT ni infraestructura mensual nueva para las pruebas; la instancia de recuperación temporal ya se eliminó. La ventana RDS se extendió para pruebas/despliegue y se debe detener DEV al terminar, fuera del horario operativo.

## Alcance y autorización

El objetivo mantiene la operación completa del proyecto y todos sus perfiles: administración, gerencia, almacén y ventas. Los requisitos se contrastan con Jira KAN, las rutas/RBAC, los servicios, las migraciones y los escenarios V1–V8 del runbook. La inclusión fiscal/CFDI e IA sigue pendiente de definición; no se declaran terminadas esas capacidades.

El usuario autorizó el 29 de septiembre todas las pruebas directamente contra AWS y pidió detener la ejecución si era necesario renovar login. El login ya fue completado y STS confirmó cuenta **904891391424**, identidad **arn:aws:iam::904891391424:user/Raul_ITsupport**. El presupuesto objetivo sigue siendo **USD 5 mensuales**; el usuario permite excederlo con justificación explícita.

## Fuentes al inicio de la revisión (históricas)

- Checkout: `codex/wms-5w2h-implementation`, HEAD `ddf3bd1dd47dcc620ab530b1948c4dee9146f800`, con cambios pendientes. Los cambios no versionados no están identificados por ese SHA.
- PR candidato: [108](https://github.com/raul2105/WMS-Mangueras-y-conexiones/pull/108), draft al iniciar la revisión.
- Runtime DEV: <https://d2b1ltxtvypxr4.cloudfront.net>; health reportó el SHA anterior y release `dev-ddf3bd1dd47d-20260904T181901Z`. Falta desplegar y validar los cambios nuevos.
- Stack: `WmsWebDevStack`, `us-east-1`, estado `UPDATE_COMPLETE` al retomar.
- RDS: `wms-web-dev-pg`, base `wms`, PostgreSQL **16.13**, almacenamiento cifrado, retención efectiva de **un día**. La configuración del código indica siete días: es una discrepancia, no evidencia de siete días de backups.
- Snapshot previo: `wms-dev-pre-delivery-20260929`, estado **available**, progreso 100 %. No se ha probado una restauración.
- Jira: inventario consultado de 119 issues (71 terminados, 48 abiertos), con 17 épicas. El estado de Jira no demuestra por sí mismo ejecución AWS ni aceptación humana.

## Evidencia inicial (histórica)

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

## Pendientes identificados al inicio (ver resolución posterior)

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

Plan CloudFormation wms-delivery-candidate-20260930 aprobado para ejecución: 16 modificaciones, sin altas/eliminaciones, RDS/Lambdas/CloudFront sin replacement. Las referencias dinámicas de Function URLs/permisos y recursos de despliegue muestran Conditional por dependencias; no se amplían permisos IAM ni se altera la exposición pública de URLs respecto a la base. VPC/subredes/SG no cambian. RDS storage declarado se reconcilia con gp3 ya existente; retención declarada siete días, efectiva pendiente de verificar. Fuente exacta 09047288444fa8fdcdda6ee13d7bcfc9c6625dd0; release dev-09047288444f-20260930T065045Z. CI de código 36680417719 aprobada, release AWS no aplica a esa ejecución. Artefactos sin .env del operador y con binarios Linux verificados.

## Manifiesto de aceptación con escritura en navegador AWS

Run aws-browser-candidate-20260930, runtime CloudFront canónico de DEV y DB wms.public del RDS canónico, cuenta 904891391424/perfil Raul_ITsupport. Se ejecutará sólo tras health DB up y SHA 09047288444fa8fdcdda6ee13d7bcfc9c6625dd0. Identidades: perfiles existentes SYSTEM_ADMIN/MANAGER/WAREHOUSE_OPERATOR/SALES_EXECUTIVE y un operador QA secundario con contraseña aleatoria, sin alterar credenciales o roles existentes.

Suites: aws-v1-v5-v7-v8-browser, mixed-order-continuity y sales-configured-assembly, Chromium, worker único, sin retries. Crean únicamente fixtures nuevas con códigos QA-GATES-<UUID>, QA-MIX-<UUID> y TSA<timestamp>, almacenes/ubicaciones propias, clientes propios, cuatro SKU de ensamble/directo por suite (existencias 10/10/20/10), atributos/fuente técnica aprobada y relaciones propias. Gates directos usan SKU propio, órdenes de dos unidades y movimientos/reservas de seis/cinco según el caso. Se comprueban reserva actual, ownership entre dos operadores, faltante y decisión Manager auditada, claims concurrentes, surtido/ensamble, staging/shipping, entrega y PDFs.

No envían correo ni crean CFDI real. Efectos esperados: pedidos, tareas, reservas, movimientos, órdenes de producción/ensamble, rastreo, documentos/auditorías QA en almacenes propios. afterAll elimina únicamente IDs/códigos que cada suite creó; se comprobará ausencia de sus fixtures y consistencia pública después. Antes de ejecutar se guardará baseline de prefijos para no confundir restos anteriores con el run actual. Una limpieza incompleta se conserva como pendiente y se revisa por identidad exacta; no se borra catálogo previo. Evidencia bajo output/aws-browser-candidate-20260930, con reporte/trazas/capturas y log; no equivale a UAT humana ni prueba de Gmail autorizado.

Runtime candidato 0904728 desplegado: UPDATE_COMPLETE y health confirma SHA/release/DB up. Retención efectiva reconciliada a siete días mediante modify-db-instance, sin pasar por cero; privacidad pública respondió 200. Primera aceptación mutable: dos casos aprobados, dos fallidos y cuatro no ejecutados por serialidad. Los dos fallos proceden del helper de pruebas: esperaba siete enlaces Manager, pero el nuevo Correo para OC añade el octavo; además el helper no limpiaba sesión al cambiar de actor en un flujo. Se actualiza el arnés para esperar la navegación vigente y establecer siempre la identidad solicitada, sin cambiar permisos de aplicación. Limpieza aprobada: huellas de nueve tablas existentes idénticas, ningún producto/almacén QA remanente, 54 inventarios consistentes y 114 FK validadas. Evidencia original preservada en output/aws-browser-candidate-20260930/first-attempt.

Repetición de las mismas ocho pruebas mutable Chromium autorizadas, mismo manifiesto, con nuevos prefijos/IDs propios; log output/aws-browser-candidate-retry-20260930.log. No modifica usuarios existentes ni envía correo. La limpieza se comprobará de nuevo frente al baseline propio.

Validación Gmail sin consentimiento real: tres pruebas de navegador contra CloudFront canónico, Manager existente y otros tres perfiles, sin fixtures DB/Google/correo. Comprueban privacidad pública, protección anónima, pantalla del Manager, configuración faltante explícita, CSRF/origen inválido rechazado y perfiles ajenos sin capacidad de conectar Gmail. Sólo solicitudes HTTP de lectura/POST que terminan antes de Google por configuración no disponible/permiso inválido. Capturas/trazas propias output/aws-gmail-settings-20260930; no se guarda ningún token ni se envía correo. Estas pruebas se deberán adaptar después de habilitar OAuth real; su alcance actual es fail-closed.

Segunda ronda mutable: seis aprobadas, V7 falló al cambiar de operador a Manager (cabecera anterior), V8 no ejecutada. La limpieza preservó nueve huellas, eliminó fixtures propios y confirmó 54 inventarios consistentes/114 FK. Se corrige sólo el arnés: desmontar página anterior antes de borrar cookies y recargar el documento tras login antes de comprobar identidad. Tercera ronda ejecutará los cuatro gates V1/V5/V7/V8 con el mismo manifiesto AWS, nuevas fixtures propias y limpieza comprobada. Evidencia previa conservada en second-attempt; log output/aws-browser-gates-final-20260930.log.

Run awssender20260930_061c: mismo RDS AWS DEV, esquemas exclusivos t_awssender20260930_061c_f<hash16>, tests Gmail de conexión, servicio de correo y concurrencia real de OC. Verifica que una reconexión entre seleccionar remitente y renovar token no envíe con identidad distinta; Google/PDF/proveedor simulados, transacciones reales en esquemas propios, sin correo ni public. Runner elimina/verifica esquemas propios. Log output/aws-sender-binding-20260930.log.

La revisión fresca de accesibilidad encontró contraste transitorio insuficiente en los inputs de login: texto del tema claro se aplicaba inmediatamente mientras el fondo animaba desde el tema oscuro (2.83:1). Se retira sólo la transición de background-color de campos; borde/foco conservan transición. Se validará nuevamente en el runtime AWS del nuevo candidato; no se excluye ni relaja axe.
