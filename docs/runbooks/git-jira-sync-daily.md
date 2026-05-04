# Sincronizacion Local-GitHub-Jira (WMS)

## Objetivo

Mantener trazabilidad completa entre trabajo local, PRs en GitHub y seguimiento en Jira para cada ticket.

## Convenciones obligatorias

- Rama por ticket: `feature|fix|hotfix|docs|test/KAN-##-slug-corto`
- PR title: `tipo(KAN-##): resumen corto`
- Commit recomendado: `tipo(KAN-##): resumen corto`
- Jira: cada ticket debe tener evidencia de inicio, revision y cierre.

El formato `KAN-xx | resumen` queda permitido solo como legado temporal, no como estandar nuevo.

## Flujo operativo por ticket

### 1. Preparar base

- Verificar que `main` local este alineado con `origin/main`.
- Crear rama desde `main` actualizado.
- Mover Jira a `En curso`.

### 2. Desarrollo

- Implementar solo alcance del ticket.
- Mantener commits pequenos y con referencia `KAN-##`.
- Confirmar PostgreSQL cuando el cambio toque Prisma, DB, CI, pruebas o release.

### 3. Abrir PR

- Completar plantilla PR obligatoria.
- Publicar enlace del PR en Jira.
- Mover Jira a `En revision`.

### 4. Validacion y merge

- Confirmar checks requeridos en verde.
- Resolver comentarios P0/P1.
- Hacer squash merge a `main`.

### 5. Cierre Jira

Mover ticket a `Finalizada` solo con evidencia minima:

- URL PR.
- SHA merge.
- Resultado de checks.
- Nota de validacion funcional.
- Riesgos abiertos si aplica.

## Plantillas de comentario Jira por hito

### Inicio

```text
Inicio de trabajo tecnico.
- Rama: feature/KAN-##-slug
- Objetivo: resumen corto
- Siguiente paso: paso inmediato
```

### Revision

```text
Ticket en revision.
- PR: url_pr
- Riesgos abiertos: no / si, detalle
- Estado de checks: pendiente / en progreso / verde
```

### Cierre

```text
Ticket completado y mergeado.
- PR: url_pr
- SHA merge: sha
- Checks: resultado
- Validacion funcional: resultado breve
```

## Cierre diario

Ejecutar reporte diario:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\daily-sync-report.ps1 -JiraProject KAN
```

Sincronizar vistas Jira antes del cierre:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\sync-jira-views.ps1 -JiraProject KAN
```

Variables esperadas para sincronizacion via REST:

- `JIRA_EMAIL`
- `JIRA_API_TOKEN`
- `JIRA_SHARE_GROUP` opcional

## Reporte esperado

El reporte debe incluir:

- Git local: rama activa, ahead/behind contra `origin/main`, ramas activas.
- GitHub: PRs abiertos, estado de checks y tickets relacionados.
- Jira: tickets vencidos, sin owner y tickets en curso/revision sin evidencia PR.

## Reglas de gobierno

- No trabajar directo en `main` salvo incidente critico aprobado y documentado.
- Ningun ticket pasa a `Finalizada` sin evidencia tecnica enlazada.
- Cualquier cambio de alcance debe registrarse en Jira antes del merge.
- Ticket `Highest` vencido por mas de 24h debe tener owner, nueva fecha y plan de desbloqueo el mismo dia.
- No introducir SQLite como default operativo.
