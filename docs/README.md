# Documentación del proyecto

Este directorio concentra la documentación vigente de la rama de estabilización. El objetivo es que un desarrollador pueda entender el estado real del sistema sin depender de contexto oral ni de documentos históricos.

## Documentos principales

- [Estado de capacidades](./WMS_CAPABILITIES_STATUS.md)
  - Qué está implementado, parcial o pendiente en la aplicación.
- [Resumen técnico de implementación](./IMPLEMENTATION_SUMMARY.md)
  - Arquitectura actual, dominios, modelo de datos y reglas relevantes.
- [ADR](./ADR/README.md)
  - Decisiones arquitectónicas permanentes.
- [Runbooks](./runbooks/)
  - Operación Windows portable, operación local y matriz de soporte de runtimes.
- [Reference](./reference/)
  - Guías técnicas como base de datos e importación CSV.
- [Mobile](./mobile/)
  - Contratos v1 y notas de despliegue del frente mobile/edge.

## Manuales y referencias canónicas

- [Manual de base de datos](./reference/database-setup.md)
- [Guía de importación CSV](./reference/import-products-csv.md)
- [Matriz de runtimes](./runbooks/runtime-support-matrix.md)
- [Runbook de limpieza manual de ramas Git](./runbooks/git-branch-cleanup.md)
- [Guía de contribución y flujo PR](../CONTRIBUTING.md)

## Regla de mantenimiento

Cuando una funcionalidad cambie en código, primero se actualiza la rama de trabajo, luego se ajusta esta documentación y finalmente se integra mediante `branch -> PR -> merge`.

## Alcance de esta carpeta

La documentación aquí publicada describe únicamente lo que está soportado por la rama de estabilización. Los artefactos archivados o legados deben quedarse en `docs/archive/` o `archive/legacy/`.
