# Sincronizacion Local-GitHub-Jira (WMS)

## Objetivo
Mantener trazabilidad completa entre trabajo local, PRs en GitHub y seguimiento en Jira para cada ticket.

## Convenciones obligatorias
- Rama por ticket: `feature/KAN-<id>-<slug-corto>`
- Commit message: `KAN-xx: <mensaje>`
- PR title: `KAN-xx | <resumen>`
- Jira: cada ticket debe tener evidencia de inicio, revision y cierre.

## Flujo operativo por ticket
1. Preparar base
- `git fetch --all --prune`
- Verificar que `main` local no este desalineado con `origin/main`.
- Crear rama desde `main` actualizado.

2. Desarrollo
- Implementar solo alcance del ticket.
- Mantener commits pequenos y con prefijo del ticket.

3. Abrir PR
- Completar plantilla PR obligatoria.
- Publicar enlace del PR en comentario Jira del ticket.
- Mover Jira a estado de revision.

4. Validacion y merge
- Confirmar checks requeridos en verde.
- Resolver comentarios de revision.
- Hacer merge a `main`.

5. Cierre Jira
- Mover ticket a hecho.
- Publicar evidencia minima:
  - URL PR
  - SHA merge
  - Resultado de checks
  - Nota de validacion funcional

## Plantillas de comentario Jira por hito
### Inicio (al crear rama)
```
Inicio de trabajo tecnico.
- Rama: feature/KAN-xx-<slug>
- Objetivo: <resumen corto>
- Siguiente paso: <paso inmediato>
```

### Revision (al abrir PR)
```
Ticket en revision.
- PR: <url_pr>
- Riesgos abiertos: <si/no + detalle>
- Estado de checks: <pendiente/en progreso/en verde>
```

### Cierre (tras merge)
```
Ticket completado y mergeado.
- PR: <url_pr>
- SHA merge: <sha>
- Checks: <resultado>
- Validacion funcional: <resultado breve>
```

## Cierre diario (Delta del dia)
Ejecutar:
`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\daily-sync-report.ps1 -JiraProject KAN`

Antes del cierre, sincronizar vistas Jira:
`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\sync-jira-views.ps1 -JiraProject KAN`

Variables esperadas para sincronizacion via REST:
- `JIRA_EMAIL`
- `JIRA_API_TOKEN`
- Opcional para compartir vistas por equipo: `JIRA_SHARE_GROUP`

El reporte incluye:
- Git local: rama activa, ahead/behind contra `origin/main`, ramas activas.
- GitHub: PRs abiertos y estado de checks (requiere `gh` autenticado).
- Jira: conteo de `Highest` vencidos, sin owner y tickets en curso/revision sin evidencia PR (via JQL URL y/o API si hay token).

## Reglas de gobierno
- No trabajar directo en `main` salvo incidente critico aprobado y documentado.
- Ningun ticket pasa a hecho sin evidencia tecnica enlazada.
- Cualquier cambio de alcance debe registrarse en Jira antes del merge.
- Ticket `Highest` vencido >24h debe tener owner, nueva fecha y plan de desbloqueo el mismo dia.
