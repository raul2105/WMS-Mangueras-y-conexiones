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
npm run lint
npm run build
npm run dev
```

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
  /schema.prisma        → Modelo de datos
  /migrations           → Historial de migraciones
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
- [Runbook de limpieza manual de ramas Git](./docs/runbooks/git-branch-cleanup.md)
- [Base de datos y Prisma](./docs/reference/database-setup.md)
- [Importación de productos CSV](./docs/reference/import-products-csv.md)
- [Deploy AWS web](./docs/mobile/aws-deploy.md)
- [Contratos mobile v1](./docs/mobile/v1-contracts.md)
- [Estado real de capacidades WMS](./docs/WMS_CAPABILITIES_STATUS.md)
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
2. ✅ TypeScript check (`tsc --noEmit`)
3. ✅ Build exitoso (`npm run build`)
4. ✅ Prisma validate
5. ✅ Code review obligatorio en PRs

CI/CD automatizado en `.github/workflows/ci.yml`

## 🤝 Contribuir

1. Crea un branch desde `main`: `git checkout -b feature/mi-funcionalidad`
2. Haz tus cambios y commits con mensajes descriptivos
3. Ejecuta `npm run lint` y `npm run build` para validar
4. Crea un Pull Request con descripción clara
5. Espera code review y aprobación

## 📝 Convenciones

- **Archivos:** kebab-case (`product-list.tsx`)
- **Componentes:** PascalCase (`ProductCard`)
- **Variables:** camelCase (`productId`)
- **Constantes:** UPPER_SNAKE_CASE (`MAX_ITEMS`)
- **Commits:** Mensajes claros en español/inglés

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
