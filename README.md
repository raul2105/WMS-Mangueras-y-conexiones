# WMS-SCMayher

Sistema WMS para mangueras y conexiones industriales sobre Next.js, TypeScript, Prisma y PostgreSQL.

## Estado operativo

### Prerrequisitos

- Node.js 22+ y npm.
- Git.
- PostgreSQL como base canonica del proyecto.
- AWS web: runtime remoto activo para la experiencia web; infraestructura en `infra/cdk` y despliegue en `scripts/deploy/aws-web.ps1`.
- Windows portable: runtime local soportado para operacion en sitio; release en `scripts/release/build-release.ps1` y wrapper compatible en `build-release.cmd`.
- Mobile edge/PWA: artefactos en `mobile/` y `mobile-web/`; despliegue de staging en `scripts/deploy/mobile-staging.ps1`.
- PM2 legacy: scripts historicos archivados en `archive/legacy/windows-pm2/`; no se usan para instalaciones nuevas.

## Decision tecnica base

PostgreSQL es la base de datos canonica del WMS.

- Schema canonico: `prisma/postgresql/schema.prisma`.
- Migraciones canonicas: `prisma/postgresql/migrations`.
- `DATABASE_URL` debe iniciar con `postgres://` o `postgresql://`.
- SQLite queda como legado/offline y no debe usarse como runtime operativo, pruebas integradas, CI, release ni fuente de verdad.

## Fuente de verdad

| Tema | Fuente oficial |
|---|---|
| Backlog, prioridad y alcance | Jira `KAN` |
| Codigo, configuracion y migraciones | GitHub `main` |
| Estado funcional consolidado | `docs/WMS_CAPABILITIES_STATUS.md` |
| Proceso GitHub-Jira | `docs/process/atlassian-github-operating-guide.md` |
| Cierre diario | `docs/runbooks/git-jira-sync-daily.md` |

## Comandos principales

```bash
npm install
npm run prisma:validate
npm run prisma:generate
npm run lint
npm run typecheck
npm run test
npm run build
npm run dev
```

Todos los comandos de Prisma y pruebas integradas deben ejecutarse con `DATABASE_URL` PostgreSQL.

## Flujo local con base AWS en tiempo real

```bash
dev-local-launcher.cmd
```

Notas del launcher AWS local:

- Acepta `DATABASE_URL` en `.env` con o sin comillas.
- Si la URL falta o es invalida, ejecuta `maintenance\setup-aws.cmd`, reintenta `.env` y luego `DATABASE_URL` de entorno de maquina.

## Estructura del Proyecto

```text
/app                    -> Next.js App Router
/components             -> Componentes reutilizables
/lib                    -> Servicios, RBAC, Prisma y dominio
/prisma
  /postgresql/schema.prisma     -> Modelo canonico PostgreSQL
  /postgresql/migrations        -> Migraciones canonicas PostgreSQL
  /seed.cjs                     -> Datos iniciales
/docs
  /ADR                  -> Architecture Decision Records
  /process              -> Guias operativas de proceso
  /runbooks             -> Operacion, cierre diario y soporte
/scripts                -> Scripts de automatizacion
/.github/workflows      -> CI/CD con GitHub Actions
```

## Scripts disponibles

### Desarrollo

```bash
npm run dev              # Servidor de desarrollo puerto 3002
npm run dev:webpack      # Fallback de diagnostico con webpack
npm run build            # Build de produccion
npm run start            # Servidor de produccion
npm run lint             # Linter ESLint
npm run typecheck        # Next typegen + TypeScript check
npm run test             # Pruebas con PostgreSQL obligatorio
```

### Base de datos y release

```bash
npm run prisma:validate
npm run prisma:generate
npm run db:migrate
npm run db:push
npm run db:studio
npm run verify:release
npm run build:release
npm run infra:synth
npm run infra:diff
npm run mobile:infra:synth
npm run mobile:staging:deploy
```

### Sincronizacion GitHub-Jira

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\sync-jira-views.ps1 -JiraProject KAN
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\daily-sync-report.ps1 -JiraProject KAN
```

Variables esperadas:

- `JIRA_EMAIL`
- `JIRA_API_TOKEN`
- `JIRA_SHARE_GROUP` opcional

## Documentacion

- [Guia operativa Atlassian - GitHub](./docs/process/atlassian-github-operating-guide.md)
- [Guia de contribucion y flujo PR](./CONTRIBUTING.md)
- [Cierre diario GitHub-Jira](./docs/runbooks/git-jira-sync-daily.md)
- [Matriz de soporte de runtimes](./docs/runbooks/runtime-support-matrix.md)
- [Operacion Windows portable](./docs/runbooks/windows-portable-install.md)
- [Operacion local Windows](./docs/runbooks/windows-local-operations.md)
- [Deploy AWS web prod-ready](./docs/runbooks/aws-web-prod-deploy.md)
- [Base de datos y Prisma](./docs/reference/database-setup.md)
- [Importacion de productos CSV](./docs/reference/import-products-csv.md)
- [Estado real de capacidades WMS](./docs/WMS_CAPABILITIES_STATUS.md)
- [Architecture Decision Records](./docs/ADR/README.md)

## Capa movil AWS

Implementada como extension desacoplada, sin tocar la operacion critica local.

- `mobile-web/`: PWA shell minima.
- `mobile/functions/`: handlers Lambda.
- `mobile/infra/cdk/`: infraestructura AWS.
- `lib/mobile/`: contratos, feature flags y RBAC movil.

## Quality Gates

Todo cambio debe pasar:

1. `npm run prisma:validate`
2. `npm run prisma:generate`
3. `npm run lint`
4. `npm run typecheck`
5. `npm run test`
6. `npm run build`
7. Code review obligatorio en PRs

CI/CD automatizado en `.github/workflows/ci.yml`.

## Contribuir

1. Crea o selecciona un ticket Jira `KAN-##`.
2. Crea branch desde `main`: `feature/KAN-##-descripcion`.
3. Haz commits con alcance cerrado.
4. Ejecuta los quality gates.
5. Abre PR con titulo `tipo(KAN-##): resumen corto`.
6. Actualiza Jira con PR, evidencia y estado real.

Consulta la [Guia operativa Atlassian - GitHub](./docs/process/atlassian-github-operating-guide.md) antes de iniciar trabajo nuevo.

## Convenciones

- Archivos: kebab-case (`product-list.tsx`).
- Componentes: PascalCase (`ProductCard`).
- Variables: camelCase (`productId`).
- Constantes: UPPER_SNAKE_CASE (`MAX_ITEMS`).
- Branches: `feature|fix|hotfix|docs|test/KAN-##-slug-corto`.
- PR/commits: `tipo(KAN-##): resumen corto`.

## Soporte

Para dudas o problemas, contactar al Tech Lead o abrir un issue en el repositorio.

## Notas

- `release/` y respaldos locales se preservan fuera del flujo normal de limpieza del repo.
- Los entrypoints operativos siguen siendo `launcher.cmd`, `stop.cmd`, `uninstall.cmd`, `maintenance/*.cmd` y `build-release.cmd`.
- Si se reorganiza un script interno, se mantiene wrapper temporal en la ruta anterior hasta cerrar la transicion.
