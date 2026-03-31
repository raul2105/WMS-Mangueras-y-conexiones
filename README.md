# WMS Rigentec - Sistema de Gestión de Almacenes

Sistema completo de gestión de almacenes (WMS) especializado en mangueras y conexiones industriales, construido con Next.js, TypeScript, Prisma y Tailwind CSS.

## 🚀 Quick Start

### Prerrequisitos
- Node.js 20+ y npm
- Git

### Instalación

```bash
# 1. Clonar el repositorio
git clone <repo-url>
cd WMS-Mangueras-y-conexiones

# 2. Instalar dependencias
npm install

# 3. Configurar base de datos (SQLite)
npm run db:setup

# 4. Iniciar servidor de desarrollo
npm run dev
```

Abre [http://localhost:3002](http://localhost:3002) en tu navegador.

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
```

### Base de Datos
```bash
npm run db:setup         # Setup inicial (push + seed)
npm run db:migrate       # Crear migración
npm run db:push          # Push schema sin migración
npm run db:seed          # Poblar datos de ejemplo
npm run db:studio        # GUI Prisma Studio (puerto 5555)
npm run db:reset         # Reset completo de BD
```

### Importación
```bash
npm run import:products -- --file data/products.csv     # Importar productos desde CSV
npm run import:products -- --file data/products.csv --dry-run  # Simulación (sin escribir)
```

Ver [IMPORT_PRODUCTS_CSV.md](./IMPORT_PRODUCTS_CSV.md) para detalles del formato CSV.

## 🏗️ Módulos del Sistema

### ✅ Implementado
- **Catálogo Maestro**: Productos (SKU, atributos técnicos), categorías
- **Inventario**: Movimientos IN/OUT, stock por ubicación, trazabilidad
- **Scanner QR/Barcode**: Captura ágil de códigos con cámara
- **Import CSV**: Carga masiva de productos e inventario inicial

### 🚧 En Desarrollo
- **Almacenes y Ubicaciones**: Gestión de bodegas, zonas, bins/racks
- **Transferencias Internas**: Movimientos entre ubicaciones
- **Ajustes de Inventario**: Con auditoría y razón de ajuste
- **Validación Server-Side**: Zod schemas para robustez

### 🔮 Roadmap
- **Autenticación y RBAC**: NextAuth.js + roles (admin/operador/supervisor)
- **Audit Log**: Trazabilidad completa (quién, qué, cuándo)
- **Recepción PO**: Validación vs orden de compra, put-away sugerido
- **Picking/Packing**: Olas, picklists, confirmaciones
- **Dashboard KPIs**: Fill rate, exactitud de inventario, rotación
- **Reportes y Exports**: Inventario, movimientos, análisis

## 🎨 Stack Tecnológico

- **Framework:** Next.js 16 (App Router + Turbopack)
- **Lenguaje:** TypeScript 5
- **UI:** React 19 + Tailwind CSS v4 (glassmorphism design)
- **Base de Datos:** SQLite (dev) → PostgreSQL (prod)
- **ORM:** Prisma 6
- **Scanner:** ZXing (QR/Barcode)
- **Linter:** ESLint 9
- **CI/CD:** GitHub Actions

## 📚 Documentación

- [Setup Manual de Base de Datos](./DB_SETUP_MANUAL.md)
- [Importación de Productos CSV](./IMPORT_PRODUCTS_CSV.md)
- [Estado real de capacidades WMS](./docs/WMS_CAPABILITIES_STATUS.md)
- [Architecture Decision Records](./docs/ADR/README.md)
  - [ADR-001: Arquitectura Base](./docs/ADR/001-arquitectura-base.md)

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

Privado - Rigentec © 2026

## 🙋 Soporte

Para dudas o problemas, contactar al Tech Lead o abrir un issue en el repositorio.

---

**Versión:** 0.1.0  
**Última actualización:** 2026-02-03  
**Próxima release:** v0.2.0 (Módulo Warehouse + Tests)
