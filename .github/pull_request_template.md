## Ticket Jira

- KAN-____

> Obligatorio. Todo PR debe referenciar al menos un ticket Jira `KAN-##` en rama, titulo y descripcion.

## Resumen

Describe claramente que cambia y por que.

## Tipo de cambio

- [ ] feat
- [ ] fix
- [ ] hotfix
- [ ] docs
- [ ] test
- [ ] refactor
- [ ] chore

## Alcance

- Cambios incluidos:
- Cambios explicitamente fuera de alcance:
- Modulos/rutas impactadas:

## Base de datos

- [ ] No aplica
- [ ] Usa PostgreSQL canonico (`prisma/postgresql/schema.prisma`)
- [ ] Incluye migracion PostgreSQL en `prisma/postgresql/migrations`
- [ ] Requiere `DATABASE_URL` PostgreSQL
- [ ] No introduce dependencia SQLite ni `file:` como flujo operativo
- [ ] Impacto de datos y rollback revisados

## Validaciones

- [ ] `npm run prisma:validate`
- [ ] `npm run prisma:generate`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] Validacion funcional manual documentada

Resultados breves:

```text
Pegar aqui salida resumida o evidencia de validacion.
```

## Riesgos

- Riesgo principal:
- Riesgos secundarios:
- Senales de alerta post-merge:

## Rollback

- Estrategia de reversa:
- Datos/migraciones afectadas:
- Comando(s) o pasos para rollback:

## Jira

- Enlace ticket: `https://rigentec.atlassian.net/browse/KAN-____`
- Estado Jira esperado al abrir PR: `En revision`
- Evidencia a publicar al cerrar ticket: PR + SHA merge + checks + validacion

## Checklist de gobernanza

- [ ] Rama sigue formato `feature|fix|hotfix|docs|test/KAN-##-slug-corto`
- [ ] Titulo PR sigue formato `tipo(KAN-##): resumen corto`
- [ ] Jira contiene alcance y criterios de aceptacion
- [ ] Jira sera actualizado despues del merge
- [ ] Se documento desviacion de alcance en Jira, si hubo
