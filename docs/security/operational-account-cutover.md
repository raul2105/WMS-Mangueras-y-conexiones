# Sustitución de cuentas demo antes de producción

Hallazgo confirmado en AWS DEV/public el 30/09/2026: cinco cuentas activas conservan claves coincidentes con las públicas del seed (dos Admin, Manager, Almacén y Ventas). La comparación bcrypt exportó únicamente booleanos, nunca claves ni hashes. El acceso autenticado de las suites AWS confirma la exposición; cero avisos npm no la resuelve. Seguimiento: [KAN-138](https://rigentec.atlassian.net/browse/KAN-138).

`prisma/seed.cjs` restablece claves, roles y activación: ahora rechaza la base canónica AWS DEV/public y producción antes de crear PrismaClient. Una base/esquema PostgreSQL remoto desechable requiere `WMS_ALLOW_REMOTE_DEMO_SEED=1`. No ejecutar seed, reset ni push sobre registros operativos para provisionar personas.

La transición requiere identificar al administrador responsable y los operadores reales. El correo Google confirmado para Manager es rrios@rigentec.com; su identidad Google no concede roles WMS. Están pendientes los responsables de Admin, Almacén y Ventas. Un usuario puede ejercer varios perfiles sólo si el propietario define esa asignación.

## Secuencia de transición

1. Guardar un snapshot y una lectura de IDs/roles/activación, conservando relaciones históricas. Definir una recuperación administrativa antes de desactivar cuentas.
2. Preparar en `/users` las cuentas operativas y roles acordados. Cada propietario completa su credencial y acceso mediante el mecanismo de administración autorizado; no publicar claves en Jira, PR, logs ni entregables.
3. Separar cuentas de pruebas de las humanas; generar credenciales únicas para E2E y actualizar los ocho secretos GitHub de correo/contraseña. CI debe seguir sin recurrir a claves públicas del seed.
4. Probar el acceso del administrador nuevo antes de desactivar las cinco cuentas demo. Conservar sus IDs: sus pedidos, auditorías y relaciones no deben borrarse ni reasignarse masivamente.
5. Comprobar en AWS que cuentas demo y sesiones previas ya no acceden, que los perfiles reales mantienen permisos correctos y que CI sigue verde. La revalidación de `isActive` en servidor debe rechazar usuarios desactivados incluso con un JWT previo.
6. Cada Manager autoriza su Gmail individual y valida una entrega controlada. Esta autorización no sustituye la autenticación WMS ni el acuerdo de roles.

Este documento prepara una transición concreta; no afirma que ya se cambiaron claves, personas o secretos CI. Mantener el entregable como DEV en validación hasta completar esta transición, Gmail real y UAT por rol. La guarda del seed es una prevención adicional, no una rotación de las claves existentes.
