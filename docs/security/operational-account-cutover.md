# Protección de los accesos operativos antes de producción

Hallazgo confirmado en AWS DEV/public el 30/09/2026: cinco cuentas activas conservan claves coincidentes con las públicas del seed (dos Admin, Manager, Almacén y Ventas). La comparación bcrypt exportó únicamente booleanos, nunca claves ni hashes. El acceso autenticado de las suites AWS confirma la exposición; cero avisos npm no la resuelve. Seguimiento: [KAN-138](https://rigentec.atlassian.net/browse/KAN-138).

`prisma/seed.cjs` restablece claves, roles y activación: ahora rechaza la base canónica AWS DEV/public y producción antes de crear PrismaClient. Una base/esquema PostgreSQL remoto desechable requiere `WMS_ALLOW_REMOTE_DEMO_SEED=1`. No ejecutar seed, reset ni push sobre registros operativos para provisionar personas.

El propietario confirmó que por ahora se conservarán los cinco usuarios del seed con sus correos, IDs y perfiles actuales. La futura alta por nombre y apellido pertenece a una etapa posterior. `rrios@rigentec.com` corresponde al contexto Google y no sustituye una identidad WMS ni recibe roles automáticamente. La protección de credenciales debe realizarse sobre las identidades existentes, conservando todas sus relaciones históricas.

## Secuencia de transición

1. Guardar un snapshot y una lectura de IDs/roles/activación. Preparar una recuperación administrativa antes de modificar credenciales.
2. Mantener los cinco usuarios existentes; no crear cuentas humanas supuestas, desactivar usuarios ni reasignar registros. Preparar claves únicas y su entrega privada; no publicarlas en Jira, PR ni logs.
3. Rotar las claves en una transacción conservando IDs, correos, roles, activación y relaciones. La recuperación privada debe estar guardada y verificada antes de esta escritura.
4. Actualizar inmediatamente los ocho secretos GitHub de correo/contraseña para las mismas identidades. CI debe seguir sin recurrir a claves públicas del seed. Verificar el acceso de ambos administradores y entregar la recuperación al propietario.
5. Comprobar en AWS que las claves públicas anteriores y los JWT emitidos antes de su rotación ya no acceden, que cada perfil conserva sus permisos y que CI sigue verde. La sesión debe revalidar activación, roles y versión de credencial contra PostgreSQL.
6. Validar inicio, cierre y rechazo de sesiones anteriores para los perfiles operativos. La conexión Gmail individual pertenece a una entrega posterior: el propietario la excluyó del cierre actual el 30/09/2026. No habilitar correo como requisito de esta transición.

La transición se ejecutó el 30/09/2026 sobre el runtime productivo `3f2b4de9513a89fdd71b0cbcd2fe662b6971744f`. Las cinco identidades conservaron IDs, correos, roles y activación; sus nuevas claves privadas se guardaron antes de la escritura en `operational-credentials.clixml`, protegido mediante DPAPI del usuario Windows. Los ocho secretos de CI quedaron actualizados. El navegador real en AWS aprobó los cinco accesos y rechazó las cinco claves públicas y los cinco JWT anteriores. Evidencias sin secretos: `output/operational-credential-rotation-proof.json` y `output/live-credential-rotation-20260930/evidence.json`.

El propietario puede consultar sus claves en su sesión Windows ejecutando `pwsh -NoProfile -File scripts/security/show-operational-credentials.ps1` desde el repositorio. No copiar esa salida a logs, Jira ni GitHub; el archivo de recuperación reside en `%LOCALAPPDATA%\WMS\private\operational-credentials.clixml` y requiere la misma cuenta Windows. Las cuentas ya rotadas no deben volver a probarse con el procedimiento inicial que presupone claves públicas válidas.

Por separado, se desactivaron 25 fixtures históricas con IDs, correos y marcador de prueba comprobados contra el manifiesto exacto. No se borraron usuarios ni relaciones: los cinco accesos operativos siguen activos. Se registraron 25 auditorías de desactivación y se conservaron los fingerprints de las demás tablas. Evidencia: `output/historical-test-user-retirement-20260930.json`.

Gmail, Prisma 7, backlog fiscal e IA quedaron excluidos por el propietario el 30/09/2026 y no bloquean esta entrega. La guarda del seed previene reprovisión y no sustituye la rotación ya ejecutada. Una restauración anterior a esta transición exige volver a proteger las claves antes de exponer el sistema.
