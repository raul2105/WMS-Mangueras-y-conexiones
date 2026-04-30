# KAN-49 — Validación de administración de usuarios SYSTEM_ADMIN

Fecha de creación: 2026-04-30  
Rama: `test/KAN-49-user-admin-validation`

## Objetivo

Convertir el módulo existente de administración de usuarios en cierre auditable con pruebas de seguridad, RBAC, gestión de roles y auditoría.

## Diagnóstico inicial

El repositorio ya contiene base funcional para administración de usuarios:

- Servicio principal: `lib/users/admin-service.ts`.
- Rutas detectadas: `app/(shell)/users/new/page.tsx` y `app/(shell)/users/[id]/page.tsx`.
- Permiso requerido: `users.manage`.
- Auditoría sobre entidad `USER`.

El ticket no debe cerrarse solo por existencia de código. Debe cerrarse únicamente con evidencia de pruebas y validación funcional.

## Alcance obligatorio del PR

1. Agregar pruebas específicas para `lib/users/admin-service.ts`.
2. Verificar que solo usuarios autorizados puedan crear, editar, activar/desactivar y ejecutar acciones administrativas.
3. Verificar que la información sensible no se exponga en respuestas ni auditoría.
4. Verificar sincronización correcta de roles en `UserRole`.
5. Verificar que no exista eliminación física de usuarios en el flujo administrativo.
6. Verificar protección contra auto-desactivación y auto-remoción del rol crítico cuando aplique.
7. Documentar comandos ejecutados y resultado.

## Pruebas mínimas requeridas

Archivo recomendado:

```text
tests/users/admin-service.integration.test.ts
```

Casos mínimos:

- creación de usuario por SYSTEM_ADMIN autorizado.
- rechazo por correo duplicado.
- rechazo por roles inexistentes o inactivos.
- actualización atómica de roles.
- bloqueo de auto-desactivación.
- bloqueo de auto-remoción del rol crítico propio.
- acción administrativa sensible con auditoría.
- consultas sin exposición de campos sensibles.
- rechazo de sesión sin `users.manage`.

## Quality gates esperados

```bash
npm run prisma:validate
npm run prisma:generate
npm run test:rbac:integration
node scripts/db/run-vitest-postgres.cjs run tests/users/admin-service.integration.test.ts
npm run typecheck
npm run build
```

## Criterios de cierre Jira

KAN-49 puede pasar a `Finalizada` solo si:

- El PR queda mergeado a `main`.
- Las pruebas anteriores pasan con `DATABASE_URL` PostgreSQL.
- Se publica en Jira el SHA de merge y resumen de validación.
- `docs/WMS_CAPABILITIES_STATUS.md` se actualiza de pendiente de validación a validado.

## Fuera de alcance

- Rediseño visual mayor de `/users`.
- Nuevos permisos fuera de `users.manage`.
- Cambio de modelo `User` salvo brecha demostrada.
- Eliminación física de usuarios.
