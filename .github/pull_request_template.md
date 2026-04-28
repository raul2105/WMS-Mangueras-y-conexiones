## Ticket Jira

- KAN-__

> Obligatorio. Todo PR debe referenciar al menos un ticket Jira `KAN-##` en titulo, rama o descripcion.

## Resumen

Describe claramente que cambia y por que.

## Tipo de cambio

- [ ] feat
- [ ] fix
- [ ] hotfix
- [ ] docs
- [ ] refactor
- [ ] chore

## Alcance

Modulos o rutas impactadas:

- 

## Base de datos

- [ ] No aplica
- [ ] Usa PostgreSQL canonico (`prisma/postgresql/schema.prisma`)
- [ ] Incluye migracion PostgreSQL en `prisma/postgresql/migrations`
- [ ] Verifique impacto de datos y rollback

## Checklist de calidad

- [ ] Ejecute npm run lint
- [ ] Ejecute npm run typecheck
- [ ] Ejecute npm run build
- [ ] Ejecute npm run prisma:validate
- [ ] Ejecute npm run test
- [ ] Actualice documentacion afectada

## Evidencia de validacion

Incluye resultados breves (logs, capturas o notas de prueba manual).

## Riesgos y rollback

- Riesgo principal:
- Plan de rollback:

## Notas para review

Puntos especificos que quieres que se revisen con mas detalle.
