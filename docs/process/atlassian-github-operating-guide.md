# Atlassian-GitHub Operating Guide

Fecha de actualización: 2026-04-30

## Objetivo

Estandarizar el flujo Jira↔GitHub para que el estado administrativo refleje el estado técnico real.

## Jerarquía documental

- `README.md`: entrada rápida del repositorio.
- `CONTRIBUTING.md`: reglas de contribución y calidad de PR (autoridad).
- `docs/process/atlassian-github-operating-guide.md`: flujo Jira↔GitHub.
- `docs/WMS_CAPABILITIES_STATUS.md`: estado funcional del producto.

## Convenciones oficiales

- Branch: `type/KAN-XX-short-description`
- Commit: `KAN-XX: resumen imperativo`
- PR: debe documentar explícitamente:
  - problema,
  - solución,
  - pruebas ejecutadas,
  - impacto en Jira.

## Flujo Jira↔GitHub por ticket

1. Crear branch ligado a ticket `KAN-XX`.
2. Implementar alcance técnico acotado.
3. Abrir PR y enlazar Jira.
4. Registrar evidencia de pruebas y documentación.
5. Merge por squash cuando el PR esté aprobado.
6. Cerrar Jira solo cuando exista evidencia completa.

## Regla de cierre Jira

Un issue Jira solo puede cerrarse con:

- evidencia de código (PR + SHA),
- evidencia de prueba (checks/comandos),
- evidencia documental (docs actualizadas cuando aplique).

## Estados operativos

- `Implemented`: funcionalidad presente en código con rutas/evidencia.
- `Validated`: implementación con pruebas ejecutadas y evidencia registrada.
- `Done`: mergeado a `main`, Jira actualizado y documentación alineada.

## Checklist de PR (flujo)

- [ ] Ticket Jira vinculado en PR.
- [ ] Problema/Solución/Pruebas/Impacto Jira documentados.
- [ ] Evidencia de código y pruebas adjunta.
- [ ] Documentación actualizada o justificación de no cambio.
- [ ] Estado Jira sincronizado con etapa real.

## Nota de reconciliación PR #15

Decisión mantenedora: **reemplazo** del enfoque de PR #15 por esta guía consolidada para eliminar duplicidad y contradicciones con `CONTRIBUTING.md`.
