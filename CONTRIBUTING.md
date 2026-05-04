# Contribución y Flujo de Pull Request

Este documento es la autoridad para reglas de contribución y calidad de PR.

## Convenciones obligatorias

- Branch: `type/KAN-XX-short-description`
- Commit: `KAN-XX: resumen imperativo`
- Ejemplos de `type`: `feature`, `fix`, `hotfix`, `docs`, `test`, `chore`

## Política para PR a `main`

1. Crear branch desde `main` actualizado.
2. Mantener alcance cerrado al ticket Jira.
3. Validar localmente antes de abrir PR:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run prisma:validate`
   - `npm run build`
   - `npm run test:rbac:unit`
   - `npm run test:customers:contracts`
4. Abrir PR con plantilla oficial.
5. Publicar enlace del PR en Jira.
6. Resolver feedback crítico antes de merge.
7. Merge solo por squash.
8. Publicar evidencia final en Jira (PR, SHA, checks, validación funcional).

## Reglas de gobernanza

- Ningún ticket se marca cerrado sin evidencia de código, prueba y documentación.
- Si un cambio altera comportamiento funcional, actualizar documentación en el mismo PR o en PR consecutivo inmediato.
- No mezclar cambios funcionales con refactors no relacionados.

## Referencias operativas

- Flujo Jira↔GitHub y estados `Implemented/Validated/Done`:
  `docs/process/atlassian-github-operating-guide.md`
- Estado funcional del producto:
  `docs/WMS_CAPABILITIES_STATUS.md`
- Cierre diario:
  `docs/runbooks/git-jira-sync-daily.md`
