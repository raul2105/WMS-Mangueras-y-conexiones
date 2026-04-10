# Contribucion y flujo de Pull Request

Este repositorio usa un flujo basado en ramas cortas, Pull Request obligatoria y merge por squash hacia main.

## Objetivo

- Mantener main siempre desplegable.
- Reducir ruido de historial con un commit por PR en main.
- Estandarizar la limpieza manual de ramas sin perder trabajo activo.

## Ramas

- main: rama estable.
- develop: integracion continua opcional.
- feature/[ticket]-descripcion: trabajo funcional.
- hotfix/[descripcion]: correcciones urgentes.
- docs/[descripcion]: cambios de documentacion.

## Politica para Pull Request a main

1. Crear rama desde main actualizada.
2. Implementar cambios y mantener commits pequenos y claros en la rama.
3. Verificar localmente antes de abrir PR:
   - npm run lint
   - npx tsc --noEmit
   - npm run build
   - npx prisma validate
4. Abrir PR hacia main usando la plantilla oficial.
5. Esperar checks de CI en verde (Code Quality Checks y Security Audit).
6. Resolver comentarios de revision cuando aplique.
7. Hacer merge unicamente con Squash merge.
8. Confirmar eliminacion automatica de la rama remota despues del merge.

## Convencion de titulos

Se recomienda este formato para mejorar el mensaje de squash commit:

- tipo(scope): resumen corto

Ejemplos:

- feat(inventory): agregar ajuste por lote
- fix(catalog): corregir filtro por referencia
- docs(runbook): actualizar pasos de recuperacion

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
3. git checkout -b feature/123-ajuste-kardex
4. Desarrollar y validar quality gates.
5. Abrir PR a main.
6. Merge por squash.

### Hotfix

1. Crear hotfix desde main.
2. Priorizar fix minimo y validacion completa.
3. Abrir PR con etiqueta hotfix.
4. Merge por squash.
5. Si se usa develop, sincronizar el cambio tambien hacia develop.

### Documentacion

1. Usar docs/[descripcion].
2. Actualizar docs afectadas en el mismo PR del cambio funcional o en PR dedicado.
3. Merge por squash.

## Limpieza manual de ramas

La limpieza de ramas stale es manual. Procedimiento detallado:

- Ver docs/runbooks/git-branch-cleanup.md

## Buenas practicas

- Evitar ramas de larga vida.
- Rebasar o actualizar la rama frecuentemente con main para reducir conflictos.
- No mezclar refactors amplios con cambios funcionales no relacionados.
- Incluir contexto de impacto tecnico y operativo en la descripcion del PR.
