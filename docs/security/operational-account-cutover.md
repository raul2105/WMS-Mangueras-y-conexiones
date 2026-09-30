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

Este documento prepara la protección de acceso; no afirma que ya se cambiaron claves o secretos CI. La versión de credencial está preparada en código y debe desplegarse y verificarse en AWS; ese despliegue exigirá volver a iniciar sesión a los usuarios con JWT anteriores. Gmail, Prisma 7, backlog fiscal e IA quedaron excluidos por el propietario el 30/09/2026 y no bloquean esta entrega. La guarda del seed previene reprovisión, pero no rota las claves existentes.
