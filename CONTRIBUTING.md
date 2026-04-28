# Contribucion y flujo de Pull Request

Este repositorio usa un flujo basado en ramas cortas, Pull Request obligatoria y merge por squash hacia main.

## Objetivo

- Mantener main siempre desplegable.
- Reducir ruido de historial con un commit por PR en main.
- Estandarizar la limpieza manual de ramas sin perder trabajo activo.
- Mantener trazabilidad obligatoria entre Jira, GitHub y cambios productivos.

## Base tecnica obligatoria

PostgreSQL es la base de datos canonica del proyecto.

- Schema canonico: `prisma/postgresql/schema.prisma`.
- Migraciones canonicas: `prisma/postgresql/migrations`.
- Todo comando operativo debe usar `DATABASE_URL` PostgreSQL.
- SQLite queda como legado/offline y no debe usarse como runtime, pruebas integradas ni fuente de verdad.

## Ramas

- main: rama estable.
- develop: integracion continua opcional.
- feature/KAN-##-descripcion: trabajo funcional.
- fix/KAN-##-descripcion: correccion o estabilizacion.
- hotfix/KAN-##-descripcion: correcciones urgentes.
- docs/KAN-##-descripcion: cambios de documentacion.

## Politica para Pull Request a main

1. Crear rama desde main actualizada.
2. Usar ticket Jira obligatorio en la rama, titulo o descripcion (`KAN-##`).
3. Implementar cambios y mantener commits pequenos y claros en la rama.
4. Verificar localmente antes de abrir PR:
   - npm run lint
   - npm run typecheck
   - npm run build
   - npm run prisma:validate
   - npm run test
5. Confirmar que `DATABASE_URL` apunta a PostgreSQL.
6. Abrir PR hacia main usando la plantilla oficial.
7. Esperar checks de CI en verde (Code Quality Checks y Security Audit).
8. Resolver comentarios de revision cuando aplique.
9. Hacer merge unicamente con Squash merge.
10. Confirmar eliminacion automatica de la rama remota despues del merge.
11. Actualizar el ticket Jira relacionado con evidencia, PR y estado real.

## Convencion de titulos

Formato recomendado:

- tipo(KAN-##): resumen corto

Ejemplos:

- feat(KAN-48): integrar clientes formales en pedidos
- fix(KAN-29): consolidar PostgreSQL como runtime canonico
- docs(KAN-8): sincronizar estado real WMS

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

1. git checkout main
2. git pull
3. git checkout -b feature/KAN-48-clientes-pedidos
4. Desarrollar y validar quality gates.
5. Abrir PR a main.
6. Merge por squash.
7. Actualizar Jira con evidencia.

### Hotfix

1. Crear hotfix desde main.
2. Priorizar fix minimo y validacion completa.
3. Abrir PR con etiqueta hotfix.
4. Merge por squash.
5. Si se usa develop, sincronizar el cambio tambien hacia develop.
6. Actualizar Jira con causa, impacto y rollback.

### Documentacion

1. Usar docs/KAN-##-descripcion.
2. Actualizar docs afectadas en el mismo PR del cambio funcional o en PR dedicado.
3. Merge por squash.
4. Actualizar Jira si la documentacion cierra deuda o cambia criterios operativos.

## Limpieza manual de ramas

La limpieza de ramas stale es manual. Procedimiento detallado:

- Ver docs/runbooks/git-branch-cleanup.md

## Buenas practicas

- Evitar ramas de larga vida.
- Rebasar o actualizar la rama frecuentemente con main para reducir conflictos.
- No mezclar refactors amplios con cambios funcionales no relacionados.
- Incluir contexto de impacto tecnico y operativo en la descripcion del PR.
- No abrir PR sin ticket Jira.
- No introducir comandos nuevos que usen SQLite como default operativo.
