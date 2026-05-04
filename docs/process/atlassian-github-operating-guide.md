# Guia operativa Atlassian - GitHub

Fecha de corte: 2026-04-29
Proyecto Jira: `KAN / WMS project`
Repositorio: `raul2105/WMS-Mangueras-y-conexiones`

## Objetivo

Unificar el flujo de trabajo entre Atlassian y GitHub para que cada cambio tenga ticket, PR, validacion, evidencia y cierre operativo claro.

## Fuente de verdad

| Informacion | Fuente primaria | Regla |
|---|---|---|
| Backlog, prioridad y alcance funcional | Jira `KAN` | Todo trabajo debe tener ticket `KAN-##`. |
| Codigo, configuracion y migraciones | GitHub `main` | `main` es la verdad tecnica desplegable. |
| Estado funcional consolidado | `docs/WMS_CAPABILITIES_STATUS.md` | Se actualiza cuando cambian capacidades reales. |
| Reconciliaciones repo-Jira | `docs/release/` | Se crea acta cuando haya cambio estructural. |
| Politica de contribucion | `CONTRIBUTING.md` | Define ramas, PR, calidad y cierre. |
| Cierre diario | `docs/runbooks/git-jira-sync-daily.md` | Define reporte y sincronizacion operativa. |

## Decision tecnica base

PostgreSQL es la base canonica del WMS.

- Schema canonico: `prisma/postgresql/schema.prisma`.
- Migraciones canonicas: `prisma/postgresql/migrations`.
- `DATABASE_URL` debe iniciar con `postgres://` o `postgresql://`.
- SQLite queda como legado/offline y no se acepta como runtime operativo, pruebas integradas, CI, release ni fuente de verdad.

## Convencion oficial

### Ramas

```text
feature/KAN-48-clientes-pedidos
fix/KAN-29-postgresql-release-bootstrap
docs/KAN-8-unificar-fuente-verdad
test/KAN-53-regresion-clientes-pedidos
hotfix/KAN-##-slug-corto
```

### PRs y commits

Formato oficial:

```text
tipo(KAN-##): resumen corto
```

Ejemplos:

```text
feat(KAN-48): integrar clientes formales en pedidos
fix(KAN-29): eliminar dependencia SQLite del build release
docs(KAN-8): unificar proceso Atlassian GitHub
test(KAN-53): cubrir regresion de clientes y pedidos
```

El formato `KAN-xx | resumen` queda permitido solo como legado temporal por el PR #16, pero no debe usarse para trabajo nuevo.

## Flujo obligatorio

### 1. Preparar ticket Jira

Antes de programar debe existir un ticket `KAN-##` con:

- objetivo de negocio,
- alcance tecnico,
- criterios de aceptacion,
- prioridad real,
- dependencias,
- riesgos o impacto de datos si aplica.

### 2. Crear rama desde `main`

- Actualizar `main`.
- Crear rama con prefijo por tipo y ticket.
- Mover Jira a `En curso`.

### 3. Implementar con alcance cerrado

No mezclar:

- refactors amplios con features,
- migraciones de base de datos con UI no relacionada,
- cambios de proceso con cambios funcionales,
- limpieza de release con features de negocio.

### 4. Validar antes de abrir PR

```bash
npm run prisma:validate
npm run prisma:generate
npm run lint
npm run typecheck
npm run test
npm run build
```

Si toca Prisma, CI, release o migraciones, validar con `DATABASE_URL` PostgreSQL y documentar resultado en el PR.

### 5. Abrir PR

- Usar plantilla oficial.
- Titulo `tipo(KAN-##): resumen corto`.
- Publicar URL del PR en Jira.
- Mover Jira a `En revision`.

### 6. Review y CI

No fusionar si:

- falta ticket Jira,
- no hay evidencia de validacion,
- CI falla,
- existe comentario P0/P1 abierto,
- se introduce SQLite como default operativo,
- el PR mezcla alcance no relacionado.

### 7. Merge y cierre

- Usar Squash merge hacia `main`.
- Publicar en Jira:
  - URL del PR,
  - SHA merge,
  - checks,
  - validacion funcional,
  - riesgos restantes.
- Mover Jira a `Finalizada` solo si no hay bloqueadores.

## Estados Jira estandarizados

| Estado Jira | Uso correcto |
|---|---|
| Idea | Backlog bruto o concepto sin ejecucion inmediata. |
| Tareas por hacer | Ticket listo para ejecutar. |
| En curso | Trabajo activo en rama o investigacion tecnica. |
| En revision | PR abierto, QA pendiente o evidencia pendiente. |
| Finalizada | PR mergeado, evidencia registrada y sin bloqueadores. |

## Reconciliacion periodica

Ejecutar cuando haya cambios estructurales o antes de iniciar un bloque P0.

Checklist:

- Comparar `docs/WMS_CAPABILITIES_STATUS.md` contra Jira.
- Revisar PRs mergeados recientes.
- Revisar tickets `Idea` que ya tengan evidencia en codigo.
- Marcar como parcial tickets con modelo implementado pero UI/QA pendiente.
- Crear o actualizar deuda tecnica si hay bloqueante.
- Documentar hallazgos en `docs/release/`.

## Deuda tecnica

Toda deuda tecnica debe tener:

- ticket Jira,
- impacto operativo,
- riesgo si no se atiende,
- condicion de cierre,
- prioridad.

Caso actual prioritario:

`KAN-29`: cerrar PostgreSQL-only en release, CI, scripts legacy y pruebas con `DATABASE_URL` PostgreSQL.

## Orden recomendado actual

1. Cerrar `KAN-8` con esta guia y README estandarizados.
2. Cerrar `KAN-29` para eliminar dependencias operativas SQLite restantes.
3. Ejecutar `KAN-53` para cubrir regresion tras PR #16.
4. Continuar con `KAN-49`, `KAN-51`, `KAN-50` y `KAN-52` segun prioridad operativa.
