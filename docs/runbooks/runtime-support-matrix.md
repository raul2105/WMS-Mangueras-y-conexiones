# Matriz de soporte de runtimes

## Activos

### Dev local (web)

- Estado: activo y canónico para desarrollo diario.
- Runtime: `next dev` con Node 22.
- Comando oficial: `npm run dev`.
- Launcher oficial real-time DB: `dev-local-launcher.cmd` (PostgreSQL AWS).
- Fallback diagnóstico: `npm run dev:webpack`.
- Prisma schema para modo AWS: `prisma/postgresql/schema.prisma`.

### AWS web

- Estado: activo y canónico para la experiencia web remota.
- Infraestructura: `infra/cdk/`.
- Deploy: `scripts/deploy/aws-web.ps1` o `npm run deploy:aws:web`.
- Runbook recomendado: `docs/runbooks/aws-web-prod-deploy.md`.
- Prisma schema dedicado: `prisma/postgresql/schema.prisma`.
- Base de datos objetivo: PostgreSQL para el runtime remoto.
- Verificación mínima: `npm run infra:synth`, `npm run infra:diff`, smoke web y `/api/health`.

### Windows portable

- Estado: activo para operación local en sitio.
- Release: `scripts/release/build-release.ps1` o `build-release.cmd`.
- Entry points soportados: `launcher.cmd`, `stop.cmd`, `uninstall.cmd`, `maintenance/*.cmd`.
- Prisma schema dedicado para build portable: `prisma/schema.prisma` (SQLite).
- Persistencia local: `%LOCALAPPDATA%\wms-scmayer\`.
- Restricción: no actualizar con `git pull` en producción; se reemplaza por release validado.

### Mobile edge / PWA

- Estado: soportado mientras siga en pipeline.
- Código: `mobile/` y `mobile-web/`.
- Deploy staging: `scripts/deploy/mobile-staging.ps1` o `npm run mobile:staging:deploy`.
- Contratos: `docs/mobile/v1-contracts.md`.

## Legado

### PM2 Windows

- Estado: legado, solo referencia histórica.
- Ubicación: `archive/legacy/windows-pm2/`.
- Uso permitido: consulta o recuperación puntual.
- Uso no permitido: nuevas instalaciones o despliegues normales.

## Regla de compatibilidad

- Los scripts reorganizados viven en `scripts/release/`, `scripts/deploy/`, `scripts/data/` y `scripts/db/`.
- Las rutas antiguas bajo `scripts/` se mantienen como wrappers temporales para no romper automatizaciones existentes.
- Si un wrapper deja de ser necesario, se elimina solo después de ajustar documentación, comandos npm y operación diaria.
