# Contribucion y flujo de Pull Request

Este repositorio usa un flujo basado en ramas cortas, Pull Request obligatoria y merge por squash hacia `main`.

## Objetivo

- Mantener `main` siempre desplegable.
- Reducir ruido de historial con un commit por PR en `main`.
- Estandarizar la limpieza manual de ramas sin perder trabajo activo.
- Mantener trazabilidad obligatoria entre GitHub y Jira.
- Evitar bifurcaciones tecnicas entre entornos locales, AWS y produccion.

## Decision base de datos

El WMS usa **PostgreSQL como unica base de datos soportada**.

Reglas obligatorias:

- `DATABASE_URL` debe apuntar a PostgreSQL.
- No se permite SQLite como runtime local, fallback ni base productiva.
- No se permiten URLs `file:` en configuracion operativa.
- No se deben introducir migraciones, scripts o documentacion que dependan de SQLite.
- Desarrollo local debe usar PostgreSQL local, Docker o PostgreSQL remoto controlado.
- Produccion y staging deben ejecutar migraciones sobre PostgreSQL.

Si un cambio toca Prisma, scripts de DB, seed, migraciones o CI, debe validar explicitamente PostgreSQL.

## Ramas

- `main`: rama estable.
- `develop`: integracion continua opcional.
- `feature/KAN-##-descripcion`: trabajo funcional.
- `fix/KAN-##-descripcion`: correccion tecnica o funcional.
- `hotfix/KAN-##-descripcion`: correcciones urgentes.
- `docs/KAN-##-descripcion`: cambios de documentacion.

## Politica para Pull Request a main

1. Crear rama desde `main` actualizada.
2. Usar ticket Jira en rama, titulo y descripcion del PR.
3. Implementar cambios y mantener commits pequenos y claros en la rama.
4. Verificar localmente antes de abrir PR:
   - `npm run prisma:validate`
   - `npx prisma validate`
   - `npx prisma migrate status`
   - `npm run lint`
   - `npx tsc --noEmit`
   - `npm run build`
   - `npm test`
5. Abrir PR hacia `main` usando la plantilla oficial.
6. Esperar checks de CI en verde (`Code Quality Checks` y `Security Audit`).
7. Resolver comentarios de revision cuando aplique.
8. Hacer merge unicamente con Squash merge.
9. Confirmar eliminacion automatica de la rama remota despues del merge.

## Convencion de titulos

Formato obligatorio:

- `tipo(KAN-##): resumen corto`

Ejemplos:

- `feat(KAN-48): integrar clientes formales en pedidos`
- `fix(KAN-29): migrar Prisma a PostgreSQL-only`
- `docs(KAN-8): actualizar estado real de capacidades WMS`

## Reglas de proteccion recomendadas para main

Configurar en GitHub Branch Protection:

- Require a pull request before merging: activo.
- Require status checks to pass before merging: activo.
- Checks requeridos:
  - Code Quality Checks
  - Security Audit
- Require conversation resolution before merging: activo.
- Allow force pushes: desactivado.
- Allow deletions: desactivado.
- Auto-delete head branches: activo.
- Merge method permitido: Squash merge.

## Flujo rapido por tipo de cambio

### Feature

1. `git checkout main`
2. `git pull`
3. `git checkout -b feature/KAN-48-clientes-pedidos`
4. Desarrollar y validar quality gates.
5. Abrir PR a `main`.
6. Merge por squash.

### Fix tecnico

1. Crear rama `fix/KAN-##-descripcion` desde `main`.
2. Mantener el alcance cerrado al problema tecnico.
3. Validar PostgreSQL si toca DB, Prisma, migraciones o CI.
4. Abrir PR con evidencia de validacion.
5. Merge por squash.

### Hotfix

1. Crear hotfix desde `main`.
2. Priorizar fix minimo y validacion completa.
3. Abrir PR con etiqueta `hotfix`.
4. Merge por squash.
5. Si se usa `develop`, sincronizar el cambio tambien hacia `develop`.

### Documentacion

1. Usar `docs/KAN-##-descripcion`.
2. Actualizar docs afectadas en el mismo PR del cambio funcional o en PR dedicado.
3. Merge por squash.

## Limpieza manual de ramas

La limpieza de ramas stale es manual. Procedimiento detallado:

- Ver `docs/runbooks/git-branch-cleanup.md`

## Buenas practicas

- Evitar ramas de larga vida.
- Rebasar o actualizar la rama frecuentemente con `main` para reducir conflictos.
- No mezclar refactors amplios con cambios funcionales no relacionados.
- Incluir contexto de impacto tecnico y operativo en la descripcion del PR.
- Si Jira contradice el codigo, actualizar Jira o marcar el ticket como parcial/QA; no asumir Jira como fuente tecnica final.
