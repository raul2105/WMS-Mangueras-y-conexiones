## Ticket Jira

- KAN-____

> Obligatorio. Todo PR debe referenciar al menos un ticket Jira KAN. Si el cambio es técnico/base, usar el ticket de sincronización o deuda técnica correspondiente.

## Resumen

Describe claramente qué cambia y por qué.

## Tipo de cambio

- [ ] feat
- [ ] fix
- [ ] hotfix
- [ ] docs
- [ ] refactor
- [ ] chore

## Alcance

Módulos o rutas impactadas:

- 

## Base de datos

- [ ] No aplica
- [ ] Incluye migración Prisma versionada
- [ ] Requiere validación PostgreSQL
- [ ] No introduce dependencia SQLite ni `file:` en `DATABASE_URL`

## Checklist de calidad

- [ ] Ejecuté npm run prisma:validate
- [ ] Ejecuté npx prisma validate
- [ ] Ejecuté npx prisma migrate status
- [ ] Ejecuté npm run lint
- [ ] Ejecuté npx tsc --noEmit
- [ ] Ejecuté npm run build
- [ ] Ejecuté npm test
- [ ] Revisé impactos en migraciones o datos (si aplica)
- [ ] Actualicé documentación (si aplica)

## Evidencia de validación

Incluye resultados breves: logs, capturas o notas de prueba manual.

## Riesgos y rollback

- Riesgo principal:
- Plan de rollback:

## Notas para review

Puntos específicos que quieres que se revisen con más detalle.
