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

### Regresión de esta revisión en AWS (código todavía sin desplegar)

- Seguridad de sesiones, usuarios, salud y órdenes genéricas: 32 pruebas en seis archivos aprobadas en `security0930_abe661b`; seis esquemas aislados limpiados. La suite adicional de administradores/auditoría aprobó 11 pruebas en tres archivos en `admin0930_972ee27`, con limpieza de los tres esquemas. Ocho pruebas de usuarios se repitieron; no sumar ambas corridas como pruebas únicas.
- Migración PostgreSQL real 25→26: aplicada en una base temporal del mismo RDS. Fingerprints históricos idénticos, campo nuevo nullable sin backfill, diferencia de esquema cero y base temporal eliminada (`output/technical-snapshot-migration-20260930/fresh-evidence.json`). Esto no afirma aplicación en `public`.
- Regresión transversal `flows0930_0be8abd`: 130 aprobadas y 29 fallidas en 21 archivos; todos los esquemas de la corrida quedaron limpios. Se conserva el log original. Las fallas incluyen fixtures sin roles, orden de limpieza contrario a FKs, contratos anteriores a los cambios y atribución de auditoría de borradores; requieren corrección y repetición, no cierre por mayoría de pruebas verdes.
- Recepción de compras tras corregir fixtures y aserción del campo real del movimiento: 15/15 aprobadas en `receivingretry10930_df66`; esquema temporal eliminado. Incluye concurrencia, rollback real por rechazo de auditoría y conservación de plantillas desactivadas por Manager.
- Segunda corrida focalizada `flowsretry10930_3263543`: 87/88 aprobadas en nueve archivos; nueve esquemas temporales eliminados. Ventas, ownership, fuentes, especificaciones y RBAC aprobaron. El único fallo restante fue un motivo de ocho caracteres en el fixture que pretendía comprobar una revisión obsoleta: corregir el dato sin reducir la exigencia de motivo. La revisión posterior detectó que debe distinguirse aprobación de combinación para ensamble de aprobación de sustitución; ese ajuste exige regresión adicional antes del despliegue.
- Regresión de propósito `flowsretry20930_cfaccf3`: 50/52 aprobadas, cinco esquemas limpiados. Se conservaron dos errores de fixture (propósito antiguo y disponibilidad previa a reserva). En `flowsretry30930_9855554`, el caso de snapshot de Ventas aprobó; el caso nuevo detectó la restricción unique por par orientado y propósito. El fixture se corrigió para coexistencia de bloqueo/aprobación en sentidos opuestos, que el evaluador consulta juntos. `flowsretry40930_d405463` aprobó el escenario completo y limpió su esquema: bloqueo prevalece, rechazo sin efectos, reserva 1 reduce disponible 10→9 y snapshot histórico permanece idéntico al retirar su regla.
- `npm audit --omit=dev` del 30/09/2026: cero avisos en dependencias productivas. La seguridad del acceso y de los datos se valida separadamente.

Los logs y manifiestos están bajo `output/aws-production-*20260930*`. Las comprobaciones de TypeScript, ESLint, generación Prisma y síntesis CDK son estáticas; no se usó un runtime local para reemplazar pruebas AWS. Aún falta validar el candidato construido y desplegado con navegador, migración canónica y recuperación final.

KAN-138 mantiene un riesgo de acceso: las cinco cuentas existentes conservaban claves públicas en la última consulta de AWS. El propietario confirmó conservar sus IDs, correos y perfiles por ahora; no se requiere identificar ni crear personas nuevas para esta entrega. La protección debe rotar credenciales sobre esas identidades y preservar relaciones, recuperación administrativa y secretos E2E. `rrios@rigentec.com` pertenece al contexto Google y no sustituye sus correos WMS.

## Validación y despliegue pendientes

1. AWS `Raul_ITsupport` ya se renovó y STS confirmó la cuenta `904891391424`. RDS está disponible y el runtime canónico `9020001355360a5f7e82332fbb70a81aa8748bf0` respondió `db: up`. No ejecutar pruebas locales como sustituto.
2. Confirmar cuenta/región, estado RDS y runtime canónicos. Recuperar conexión únicamente en la sesión y preservar snapshots, migraciones e historial operativo.
3. Ejecutar regresión PostgreSQL en esquemas nuevos de esta corrida; limpiar sólo esos esquemas. Crear manifiesto separado para las escrituras de navegador y sus fixtures propios, con fingerprints antes/después.
4. Completar los criterios incluidos; construir el artefacto nuevo y revisar el change set sin reemplazo de RDS. Probar producción, compras, permisos y visuales en AWS del SHA exacto.
5. Proteger los cinco accesos existentes sin cambiar sus identidades ni perfiles y sin perder recuperación administrativa. Coordinar credenciales E2E y acceso por rol.
6. Reconciliar PR/main, CI, SHA desplegado, migraciones y Jira. Cerrar cada ticket sólo con sus criterios cubiertos; conservar excluidos como entrega posterior.

El entorno canónico sigue siendo DEV con horario de optimización. `infra/cdk/config/prod.json` mantiene el runtime deshabilitado: no constituye un despliegue productivo. La disponibilidad operativa, protección de eliminación, retención/recuperación y presupuesto deben quedar explícitos antes de promover el servicio. La referencia de USD 5 pertenece a la cuenta AWS; cualquier exceso debe justificarse, como autorizó el propietario.
