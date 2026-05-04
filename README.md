# WMS-SCMayher

Sistema WMS para mangueras y conexiones industriales sobre Next.js, TypeScript y Prisma.

## Estado operativo

### Prerrequisitos
- Node.js 22+ y npm
- Git
- AWS web: runtime remoto activo para la experiencia web; infraestructura en `infra/cdk` y despliegue en `scripts/deploy/aws-web.ps1`.
- Windows portable: runtime local soportado para operación en sitio; release en `scripts/release/build-release.ps1` y wrapper compatible en `build-release.cmd`.
- Mobile edge/PWA: artefactos en `mobile/` y `mobile-web/`; despliegue de staging en `scripts/deploy/mobile-staging.ps1`.
- PM2 legacy: scripts históricos archivados en `archive/legacy/windows-pm2/`; no se usan para instalaciones nuevas.

## Comandos principales

```bash
npm install
npm run prisma:validate
npm run prisma:generate
npm run typecheck
npm run test:postgres
npm run lint
npm run build
npm run dev
```

Flujo local con base AWS en tiempo real:

```bash
dev-local-launcher.cmd
```

Notas del launcher AWS local:
- Acepta `DATABASE_URL` en `.env` con o sin comillas.
- Si la URL falta o es invalida, ejecuta automaticamente `maintenance\setup-aws.cmd`, reintenta `.env` y luego `DATABASE_URL` de entorno de maquina.

Comandos operativos relevantes:

## 📁 Estructura del Proyecto

```
/app                    → Next.js App Router
  /catalog              → Gestión de productos y categorías
  /inventory            → Control de existencias y movimientos
  /page.tsx             → Dashboard principal
/components             → Componentes reutilizables
/lib                    → Utilidades y cliente Prisma
/prisma
  /postgresql/schema.prisma  → Modelo de datos canónico (runtime web/AWS)
  /postgresql/migrations     → Migraciones canónicas
  /schema.prisma             → Legado SQLite para runtime portable/histórico
  /seed.cjs             → Datos iniciales
/docs
  /ADR                  → Architecture Decision Records
/scripts                → Scripts de automatización
/.github/workflows      → CI/CD con GitHub Actions
```

## 🛠️ Scripts Disponibles

### Desarrollo
```bash
npm run dev              # Servidor de desarrollo (puerto 3002)
npm run dev:webpack      # Fallback para diagnóstico con webpack
npm run build            # Build de producción
npm run start            # Servidor de producción
npm run lint             # Linter (ESLint)
npm run mobile:infra:synth  # Sintetiza IaC móvil (sin deploy)
npm run mobile:infra:diff   # Diff IaC móvil (sin deploy)
npm run mobile:infra:deploy # Despliega IaC móvil en AWS
npm run mobile:infra:destroy # Elimina stack móvil en AWS (usar con cuidado)
```

### Base de Datos
```bash
npm run prisma:validate
npm run prisma:generate
npm run db:migrate
npm run test:postgres
npm run build
```

Fuente canónica de base de datos para runtime web/dev/AWS:

- `prisma/postgresql/schema.prisma`
- `prisma/postgresql/migrations`
- `prisma.config.ts`

SQLite permanece solo para compatibilidad del runtime portable/legado.

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
- [Guía de contraste y tokens](./docs/reference/theme-contrast-guide.md)
- [Operación Windows portable](./docs/runbooks/windows-portable-install.md)
- [Operación local Windows](./docs/runbooks/windows-local-operations.md)
- [Deploy AWS web prod-ready](./docs/runbooks/aws-web-prod-deploy.md)
- [Runbook de limpieza manual de ramas Git](./docs/runbooks/git-branch-cleanup.md)
- [Base de datos y Prisma](./docs/reference/database-setup.md)
- [Guía de testing PostgreSQL](./docs/testing.md)
- [Importación de productos CSV](./docs/reference/import-products-csv.md)
- [Deploy AWS móvil](./docs/mobile/aws-deploy.md)
- [Contratos mobile v1](./docs/mobile/v1-contracts.md)
- [Estado real de capacidades WMS](./docs/WMS_CAPABILITIES_STATUS.md)
- [Guía operativa Atlassian-GitHub](./docs/process/atlassian-github-operating-guide.md)
- [Architecture Decision Records](./docs/ADR/README.md)
  - [ADR-001: Arquitectura Base](./docs/ADR/001-arquitectura-base.md)
  - [ADR-002: Capa móvil AWS híbrida](./docs/ADR/002-mobile-aws-hibrido.md)
- [Mobile API v1 Contracts](./docs/mobile/v1-contracts.md)
- [AWS Mobile Deploy Guide](./docs/mobile/aws-deploy.md)

## ☁️ Capa móvil AWS (Fase 0+1+2 parcial)

Implementada como extensión desacoplada, sin tocar la operación crítica local.

- `mobile-web/`: PWA shell mínima (estática).
- `mobile/functions/`: handlers Lambda (`health`, `version`, `me/permissions`, `inventory/search`, `assembly-requests`, `product-drafts`).
- `mobile/infra/cdk/`: infraestructura AWS (S3, CloudFront, Cognito, HTTP API, Lambda, DynamoDB, SQS, CloudWatch).
- `lib/mobile/`: contratos, feature flags y RBAC móvil.

### Principio operativo

- El WMS local sigue siendo `source of truth`.
- La nube soporta consulta de inventario, solicitudes de ensamble y borradores de productos nuevos.
- El sistema local sigue siendo el `source of truth`; cloud publica eventos de intake por SQS para integración controlada.
- Runtime objetivo del repositorio y de la capa móvil AWS: `Node 22.x`.

### Evolución prevista

- La PWA actual es una base mínima.
- La dirección objetivo es llevar la experiencia AWS móvil hacia paridad visual y funcional con los flujos comerciales del WMS local.
- La propuesta ideal de reestructura quedó documentada en [docs/mobile/mobile-edge-restructure.md](./docs/mobile/mobile-edge-restructure.md).

### Variables de entorno móviles (Lambda)

- `MOBILE_ENABLED`
- `INVENTORY_SEARCH_ENABLED`
- `ASSEMBLY_REQUESTS_ENABLED`
- `PRODUCT_DRAFTS_ENABLED`
- `MOBILE_BUILD`
- `MOBILE_RELEASE_DATE`
- `MOBILE_SERVICE_NAME`
- `MOBILE_AUTH_MODE` (`cognito` o `mock`)
- `MOBILE_DDB_INVENTORY_TABLE`
- `MOBILE_DDB_ASSEMBLY_REQUESTS_TABLE`
- `MOBILE_DDB_PRODUCT_DRAFTS_TABLE`
- `MOBILE_INTEGRATION_QUEUE_URL`
- `MOBILE_CORS_ALLOWED_ORIGIN`

## 🔒 Quality Gates

Todo código debe pasar:
1. ✅ Linter (ESLint)
2. ✅ TypeScript check (`npm run typecheck`)
3. ✅ Build exitoso (`npm run build`)
4. ✅ Prisma validate (`npm run prisma:validate`)
5. ✅ Contratos críticos (`npm run test:rbac:unit` y `npm run test:customers:contracts`)
6. ✅ Code review obligatorio en PRs

CI/CD automatizado en `.github/workflows/ci.yml`

## 🤝 Contribuir

Para contribuir, sigue la guía oficial:

- Reglas de contribución/calidad: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Flujo Jira↔GitHub: [docs/process/atlassian-github-operating-guide.md](./docs/process/atlassian-github-operating-guide.md)

Convención mínima visible en README:

- Branch: `type/KAN-XX-short-description`
- Commit: `KAN-XX: resumen imperativo`

## 📝 Convenciones

- **Archivos:** kebab-case (`product-list.tsx`)
- **Componentes:** PascalCase (`ProductCard`)
- **Variables:** camelCase (`productId`)
- **Constantes:** UPPER_SNAKE_CASE (`MAX_ITEMS`)
- **Contribución y PR:** ver `CONTRIBUTING.md` (fuente oficial)

## 🐛 Troubleshooting

### Build Error: "Cannot apply unknown utility class `glass`"
✅ **Solucionado** en último commit. Si persiste, ejecuta:
```bash
npm install
npm run build
```

### Error de Prisma Client
```bash
npx prisma generate
```

### Puerto 3002 ya en uso
```bash
# Windows
npx kill-port 3002

# Linux/Mac
lsof -ti:3002 | xargs kill
```

## 📄 Licencia

Privado - SCMayher © 2026

## 🙋 Soporte

Para dudas o problemas, contactar al Tech Lead o abrir un issue en el repositorio.
- [ADR](./docs/ADR/README.md)
- [Guía de contribución y flujo PR](./CONTRIBUTING.md)

## Notas

- `release/` y los respaldos locales se preservan fuera del flujo normal de limpieza del repo.
- Los entrypoints operativos siguen siendo `launcher.cmd`, `stop.cmd`, `uninstall.cmd`, `maintenance/*.cmd` y `build-release.cmd`.
- Si se reorganiza un script interno, se mantiene un wrapper temporal en la ruta anterior hasta cerrar la transición.
