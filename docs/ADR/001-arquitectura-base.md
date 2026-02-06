# ADR-001: Arquitectura Base del Sistema WMS

**Estado:** Aceptado  
**Fecha:** 2026-02-03  
**Decisores:** Tech Lead + Arquitecto  

## Contexto

El proyecto WMS "Mangueras y Conexiones" requiere una arquitectura sólida que soporte:
- Operaciones de almacén (recepción, picking, transferencias, ajustes)
- Catálogos maestros (productos, ubicaciones, categorías)
- Trazabilidad completa de movimientos
- Escalabilidad para múltiples almacenes
- Integración futura con sistemas ERP

## Decisión

### 1. Stack Tecnológico
- **Frontend:** Next.js 16 (App Router) + React 19 + TypeScript
- **Styling:** Tailwind CSS v4 (utilidades + custom glassmorphism)
- **Base de datos:** SQLite (desarrollo) → PostgreSQL (producción futura)
- **ORM:** Prisma 6
- **Validación:** Zod (server-side)
- **Auth:** NextAuth.js (implementación futura)

### 2. Arquitectura por Dominios (DDD Light)

```
/app
  /(modules)
    /catalog      → Productos, categorías, marcas, unidades
    /inventory    → Stock, movimientos, auditoría
    /warehouse    → Almacenes, ubicaciones, zonas
    /operations   → Recepción, picking, transfers, ajustes
    /reports      → KPIs, exports, dashboards
  /api            → REST endpoints organizados por módulo
```

### 3. Convenciones de Código
- **Nombres de archivos:** kebab-case (`product-detail.tsx`)
- **Componentes:** PascalCase (`ProductCard`)
- **Variables:** camelCase (`productId`)
- **Constantes:** UPPER_SNAKE_CASE (`MAX_RETRY_COUNT`)
- **Rutas API:** `/api/[module]/[resource]` (ej: `/api/inventory/movements`)

### 4. Modelo de Datos Core

**Entidades principales:**
- `Product`: SKU, nombre, tipo, atributos JSON
- `Category`: Categorización de productos
- `Warehouse`: Almacenes físicos
- `Location`: Ubicaciones dentro de almacenes (bin/rack)
- `Inventory`: Stock por producto x ubicación (on_hand, reserved, available)
- `InventoryMovement`: Kardex de movimientos (IN, OUT, TRANSFER, ADJUSTMENT)
- `User`: Usuarios con roles
- `AuditLog`: Trazabilidad (quién, qué, cuándo)

### 5. Branching Strategy
- **Main:** Producción estable
- **Develop:** Integración continua (opcional)
- **Feature branches:** `feature/[ticket]-descripcion`
- **Hotfix branches:** `hotfix/[descripcion]`
- **PR obligatorio** para merge a main

### 6. Quality Gates
1. Linter (ESLint) → ✅
2. TypeScript (tsc --noEmit) → ✅
3. Build (next build) → ✅
4. Prisma validate → ✅
5. Tests unitarios (cuando existan) → 🚧
6. Code review → ✅

## Consecuencias

### Positivas ✅
- Stack moderno y bien documentado
- TypeScript previene errores en tiempo de desarrollo
- Prisma facilita migraciones y queries type-safe
- Arquitectura por dominios facilita mantenimiento
- CI/CD básico asegura calidad

### Negativas ⚠️
- SQLite tiene limitaciones para producción multi-usuario (migrar a PostgreSQL)
- Tailwind v4 es relativamente nuevo (puede tener breaking changes)
- Sin tests aún (deuda técnica inicial)
- Sin autenticación implementada (siguiente iteración)

## Alternativas Consideradas

### 1. Remix vs Next.js
- **Rechazada:** Next.js tiene mejor ecosistema y App Router es más maduro

### 2. tRPC vs REST
- **Pendiente:** Evaluar tRPC para type-safety completo en v1.1

### 3. MongoDB vs PostgreSQL
- **Rechazada:** Modelo relacional es mejor para integridad de inventario

## Implementación

### Fase 1 (Actual) ✅
- [x] Setup Next.js + Prisma + Tailwind
- [x] Módulos básicos: Catálogo, Inventario (IN/OUT)
- [x] CI/CD básico (lint, typecheck, build)
- [x] Fix build errors (Tailwind v4 compatibility)

### Fase 2 (Próximo) 🚧
- [ ] Módulo Warehouse (almacenes + ubicaciones)
- [ ] Validación Zod server-side
- [ ] Tests unitarios básicos (Vitest)
- [ ] Migrar Inventory con FK a ubicaciones

### Fase 3 (v1) 🔮
- [ ] NextAuth.js + RBAC
- [ ] Audit log completo
- [ ] Dashboard KPIs
- [ ] Export CSV

## Referencias
- [Next.js App Router](https://nextjs.org/docs/app)
- [Prisma Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)
- [DDD in TypeScript](https://khalilstemmler.com/articles/domain-driven-design-intro/)
- [Tailwind CSS v4](https://tailwindcss.com/blog/tailwindcss-v4)

---

**Última actualización:** 2026-02-03  
**Próxima revisión:** Después de implementar Fase 2
