# WMS Rigentec

Sistema web de gestión de almacenes para mangueras, conexiones y ensambles industriales. El proyecto está construido con Next.js, React, Prisma y SQLite para operación local y validación de flujos de inventario por ubicación.

## Estado de la rama `main`

La rama estable/publicada es `main`.

Flujo recomendado para actualizar el repositorio:

1. Crear una rama de trabajo desde `main`.
2. Implementar y validar cambios en esa rama.
3. Abrir Pull Request hacia `main`.
4. Integrar a `main` después de revisión.

Este flujo evita mezclar cambios locales no relacionados y mantiene trazabilidad sobre lo que realmente se publica.

## Alcance funcional actual

Implementado en `main`:

- Catálogo maestro de productos y categorías.
- Almacenes y ubicaciones con detalle por almacén.
- Inventario por ubicación con campos `quantity`, `reserved` y `available`.
- Recepción de inventario con referencia documental y adjuntos.
- Picking con validación de stock disponible por ubicación.
- Órdenes de producción con reserva y consumo de inventario.
- Importación masiva de productos desde CSV.
- Pruebas de integridad para inventario e importación.

No implementado todavía en `main`:

- Ajustes de inventario con UI dedicada.
- Transferencias internas entre ubicaciones.
- Kardex/exportación.
- Compras, proveedores y recepción contra orden de compra.
- Auth/RBAC.

## Stack técnico

- Next.js 16.1.6
- React 19.2.3
- TypeScript 5
- Prisma 6
- SQLite para desarrollo local
- Tailwind CSS 4
- ESLint 9
- Vitest 3
- GitHub Actions para CI

## Requisitos

- Node.js 20+
- npm
- Git

## Puesta en marcha local

```bash
git clone https://github.com/raul2105/WMS-Mangueras-y-conexiones.git
cd WMS-Mangueras-y-conexiones
npm install
npm run db:setup
npm run dev
```

La aplicación arranca en `http://localhost:3002`.

## Scripts disponibles

### Aplicación

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
```

### Prisma y base de datos

```bash
npm run prisma:generate
npm run db:setup
npm run db:migrate
npm run db:push
npm run db:seed
npm run db:studio
npm run db:reset
```

### Importación

```bash
npm run import:products -- --file data/products.csv
npm run import:products -- --file data/products.csv --dry-run
```

## Estructura principal

```text
app/                  App Router y pantallas
components/           Componentes reutilizables
lib/                  Prisma y lógica de inventario
prisma/               Schema, migraciones y seed
scripts/              Automatización operativa
tests/                Pruebas con Vitest
docs/                 Documentación técnica y de operación
```

## Calidad y validación

Controles esperados:

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `npx prisma validate`
- `npm run test`

Hallazgos actuales de mantenimiento:

- La documentación histórica del repo quedó desfasada frente al código y fue reemplazada por esta versión.
- El workspace local del usuario contiene cambios no publicados que van más adelante que `origin/main`; este README documenta únicamente lo que corresponde a `main`.
- En un checkout limpio sin dependencias instaladas, `npm test` falla hasta ejecutar `npm install`.
- `npm run build` falla hoy en `main` por un error de tipos existente en `app/catalog/[id]/page.tsx` relacionado con `row.location`.

## Documentación

- [Índice documental](./docs/README.md)
- [Estado de capacidades](./docs/WMS_CAPABILITIES_STATUS.md)
- [Resumen técnico de implementación](./docs/IMPLEMENTATION_SUMMARY.md)
- [Manual de base de datos](./DB_SETUP_MANUAL.md)
- [Guía de importación CSV](./IMPORT_PRODUCTS_CSV.md)
- [ADRs](./docs/ADR/README.md)

## Notas operativas

- El seed crea almacenes, ubicaciones y productos de ejemplo para demo local.
- El importador CSV crea categorías y ubicaciones faltantes cuando aplica.
- Las rutas y comportamientos documentados aquí están validados contra el código de la rama `main`.
