# WMS-SCMayher

Sistema WMS para mangueras y conexiones industriales sobre Next.js, TypeScript y Prisma.

## Estado operativo

- AWS web: runtime remoto activo para la experiencia web; infraestructura en `infra/cdk` y despliegue en `scripts/deploy/aws-web.ps1`.
- Windows portable: runtime local soportado para operación en sitio; release en `scripts/release/build-release.ps1` y wrapper compatible en `build-release.cmd`.
- Mobile edge/PWA: artefactos en `mobile/` y `mobile-web/`; despliegue de staging en `scripts/deploy/mobile-staging.ps1`.
- PM2 legacy: scripts históricos archivados en `archive/legacy/windows-pm2/`; no se usan para instalaciones nuevas.

## Comandos principales

```bash
npm install
npm run prisma:validate
npm run lint
npm run build
npm run dev
```

Comandos operativos relevantes:

```bash
npm run build:release
npm run verify:release
npm run infra:synth
npm run infra:diff
npm run mobile:infra:synth
npm run mobile:staging:deploy
```

## Estructura

- `app/`, `components/`, `lib/`: aplicación principal Next.js.
- `prisma/`: modelo de datos, migraciones y seed.
- `infra/cdk/`: stack AWS para la app web.
- `mobile/` y `mobile-web/`: runtime edge/API y cliente PWA.
- `scripts/release/`, `scripts/deploy/`, `scripts/data/`, `scripts/db/`, `scripts/smoke/`: scripts canónicos.
- `scripts/*.ps1|*.cjs|*.py`: wrappers de compatibilidad para rutas antiguas.
- `docs/`: documentación viva.

## Documentación

- [Matriz de soporte de runtimes](./docs/runbooks/runtime-support-matrix.md)
- [Operación Windows portable](./docs/runbooks/windows-portable-install.md)
- [Operación local Windows](./docs/runbooks/windows-local-operations.md)
- [Base de datos y Prisma](./docs/reference/database-setup.md)
- [Importación de productos CSV](./docs/reference/import-products-csv.md)
- [Deploy AWS web](./docs/mobile/aws-deploy.md)
- [Contratos mobile v1](./docs/mobile/v1-contracts.md)
- [Estado real de capacidades WMS](./docs/WMS_CAPABILITIES_STATUS.md)
- [ADR](./docs/ADR/README.md)

## Notas

- `release/` y los respaldos locales se preservan fuera del flujo normal de limpieza del repo.
- Los entrypoints operativos siguen siendo `launcher.cmd`, `stop.cmd`, `uninstall.cmd`, `maintenance/*.cmd` y `build-release.cmd`.
- Si se reorganiza un script interno, se mantiene un wrapper temporal en la ruta anterior hasta cerrar la transición.
