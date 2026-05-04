# Contribucion y flujo de Pull Request

Este repositorio usa ramas cortas, Pull Request obligatoria y merge por squash hacia `main`.

## Fuente de verdad

| Tema | Fuente oficial |
|---|---|
| Backlog, prioridad y alcance | Jira `KAN` |
| Codigo, configuracion y migraciones | GitHub `main` |
| Estado funcional consolidado | `docs/WMS_CAPABILITIES_STATUS.md` |
| Proceso GitHub-Jira | `docs/process/atlassian-github-operating-guide.md` |
| Cierre diario | `docs/runbooks/git-jira-sync-daily.md` |

## Objetivo

- Mantener `main` siempre desplegable.
- Mantener trazabilidad obligatoria Jira-GitHub.
- Evitar trabajo funcional sin ticket.
- Mantener PostgreSQL como unica base operativa.
- Reducir ambiguedad entre backlog, codigo y documentacion.

## Base tecnica obligatoria

PostgreSQL es la base de datos canonica del WMS.

- Schema canonico: `prisma/postgresql/schema.prisma`.
- Migraciones canonicas: `prisma/postgresql/migrations`.
- `DATABASE_URL` debe iniciar con `postgres://` o `postgresql://`.
- SQLite queda como legado/offline y no debe usarse como runtime, pruebas integradas, CI, release ni fuente de verdad.
- Todo script nuevo de Prisma debe usar el schema canonico o fallar si `DATABASE_URL` no es PostgreSQL.

## Ramas

Formato obligatorio:

- `feature/KAN-##-slug-corto`
- `fix/KAN-##-slug-corto`
- `hotfix/KAN-##-slug-corto`
- `docs/KAN-##-slug-corto`
- `test/KAN-##-slug-corto`

No abrir ramas funcionales sin ticket Jira.

## Commits y PRs

Formato preferente para commits y titulos PR:

```text
tipo(KAN-##): resumen corto
```

Ejemplos:

- `feat(KAN-48): integrar clientes formales en pedidos`
- `fix(KAN-29): alinear release bootstrap con PostgreSQL`
- `docs(KAN-8): unificar proceso GitHub Jira`
- `test(KAN-53): cubrir regresion de clientes y pedidos`

El formato `KAN-xx | resumen` queda permitido solo como legado temporal, no como estandar nuevo.

## Politica para Pull Request a main

1. Crear o seleccionar ticket Jira `KAN-##`.
2. Crear rama desde `main` actualizado.
3. Mover Jira a `En curso` cuando inicie trabajo real.
4. Implementar solo el alcance del ticket.
5. Verificar localmente antes de abrir PR:
   - `npm run prisma:validate`
   - `npm run prisma:generate`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
   - `npm run build`
6. Confirmar que `DATABASE_URL` apunta a PostgreSQL cuando aplique.
7. Abrir PR usando la plantilla oficial.
8. Publicar URL del PR en Jira y mover el ticket a `En revision`.
9. Esperar checks en verde.
10. Resolver comentarios P0/P1 antes del merge.
11. Hacer merge unicamente con Squash merge.
12. Publicar en Jira evidencia de cierre: PR, SHA merge, checks y validacion.
13. Mover Jira a `Finalizada` solo si no hay bloqueadores abiertos.

## Estados Jira estandarizados

| Estado Jira | Uso correcto |
|---|---|
| Idea | Backlog bruto o concepto no listo para ejecucion. |
| Tareas por hacer | Ticket listo con alcance y criterios. |
| En curso | Trabajo activo en rama o investigacion tecnica activa. |
| En revision | PR abierto, QA pendiente o evidencia pendiente. |
| Finalizada | PR mergeado, checks/evidencia registrados y sin bloqueadores. |

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

## Cierre diario y sincronizacion

Para cierre diario usar:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\sync-jira-views.ps1 -JiraProject KAN
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\daily-sync-report.ps1 -JiraProject KAN
```

Variables esperadas si se sincroniza con Jira API:

- `JIRA_EMAIL`
- `JIRA_API_TOKEN`
- `JIRA_SHARE_GROUP` opcional

## Buenas practicas

- Evitar ramas de larga vida.
- No mezclar refactors grandes con features.
- No mezclar documentacion/proceso con cambios funcionales salvo que el ticket lo requiera.
- No introducir SQLite como default operativo.
- Si Jira contradice `main`, actualizar Jira o documentar estado parcial; no asumir Jira como verdad tecnica.
