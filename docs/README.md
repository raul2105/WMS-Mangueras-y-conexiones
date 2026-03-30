# Documentación del proyecto

Este directorio concentra la documentación vigente de la rama `main`. El objetivo es que un desarrollador pueda entender el estado real del sistema sin depender de contexto oral ni de documentos históricos.

## Documentos principales

- [Estado de capacidades](./WMS_CAPABILITIES_STATUS.md)
  - Qué está implementado, parcial o pendiente en `main`.
- [Resumen técnico de implementación](./IMPLEMENTATION_SUMMARY.md)
  - Arquitectura actual, dominios, modelo de datos y reglas relevantes.
- [ADR](./ADR/README.md)
  - Decisiones arquitectónicas permanentes.

## Manuales operativos en raíz

- [Manual de base de datos](../DB_SETUP_MANUAL.md)
- [Guía de importación CSV](../IMPORT_PRODUCTS_CSV.md)

## Regla de mantenimiento

Cuando una funcionalidad cambie en código, primero se actualiza la rama de trabajo, luego se ajusta esta documentación y finalmente se integra a `main` mediante `branch -> PR -> merge`.

## Alcance de esta carpeta

La documentación aquí publicada describe únicamente lo que existe en `main`. Si el workspace local tiene módulos aún no integrados, deben documentarse aparte o entrar junto con su código correspondiente.
