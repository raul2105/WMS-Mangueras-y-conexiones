# WMS-SCMayher — Instrucciones para Claude

## Stack
- **Next.js 16** App Router + **React 19** + **TypeScript 5** strict
- **Prisma 6** (SQLite en dev, PostgreSQL en prod) — schema en `prisma/schema.prisma`
- **Tailwind CSS v4** — diseño glassmorphism: clases `.glass`, `.glass-card`, `.btn-primary`
- **Zod** — validación en `lib/schemas/wms.ts`
- **Vitest** — tests en `tests/`

## Comandos esenciales
```bash
npm run dev        # Next.js en puerto 3002 (--webpack, NO Turbopack — falla en Windows con Prisma)
npm test           # Vitest
npm run db:migrate # Prisma migrate dev
npm run db:studio  # Prisma Studio
npm run db:seed    # Seed inicial
```

## Arquitectura
- **Server Actions** directamente en cada `page.tsx` — no crear API routes propias (excepto `/api/products/lookup` y `/api/export/`)
- `lib/inventory-service.ts` — servicio principal (receiveStock, pickStock, adjustStock, transferStock). Existe también `.js` homónimo solo para el script CJS de importación.
- `lib/reservation-policy.ts` — reservas de órdenes de producción
- `lib/audit-log.ts` — `createAuditLogSafe` nunca bloquea operaciones
- `lib/schemas/wms.ts` — schemas Zod + helpers: `firstErrorMessage`, `parsePriority`, `parseDueDate`
- `lib/prisma.ts` — singleton PrismaClient

## Módulos y rutas
| Ruta | Descripción |
|---|---|
| `/catalog` | Catálogo de productos, CSV import, detail, edit |
| `/inventory` | receive, pick, adjust, transfer, kardex (paginado 50/pág), export CSV |
| `/warehouse` | Almacenes y ubicaciones, detail con edit |
| `/production/orders` | Órdenes de producción con reservas |
| `/purchasing` | Proveedores, órdenes de compra (folio `OC-YYYY-NNNN`), recepciones |

## Convenciones — seguir siempre

1. **Formularios**: server actions con redirect `?error=mensaje` o `?ok=1`
2. **Páginas con datos**: `export const dynamic = "force-dynamic"` obligatorio
3. **Consultas paralelas**: usar `Promise.all()` cuando sea posible
4. **IDs a server actions**: patrón `fn.bind(null, id)`
5. **Idioma**: UI en español, error codes internos en inglés
6. **Errores de inventario**: usar `InventoryServiceError.code` para mensajes específicos al usuario

## Modelos Prisma clave
- `Product` — SKU único, `referenceCode` único, `attributes` como JSON string
- `Inventory` — `quantity`, `reserved`, `available` (unique por `[productId, locationId]`)
- `InventoryMovement` — tipos: `IN | OUT | TRANSFER | ADJUSTMENT`
- `ProductionOrder` — estados: `BORRADOR | ABIERTA | EN_PROCESO | COMPLETADA | CANCELADA`
- `PurchaseOrder` — folio auto `OC-YYYY-NNNN`, estados: `BORRADOR | CONFIRMADA | EN_TRANSITO | RECIBIDA | PARCIAL | CANCELADA`
- `Supplier` — código `PROV-NNN`, con `SupplierProduct` para precios por proveedor

## Autenticación
- **NextAuth v5** (`next-auth@^5.0.0-beta.31`) implementado con JWT + bcrypt (10 rounds)
- `lib/auth.ts` — provider Credentials; `authorize()` paraleliza `user.findUnique` + `userRole.findMany`
- `lib/auth/session-context.ts` — `getSessionContext()` con `cache()` per-request (no re-verifica JWT dos veces en el mismo render)
- `middleware.ts` — guard de cookie edge-compatible (sin Prisma); redirige anónimos antes de renderizar el shell
- `auth.config.ts` — config edge-compatible, callbacks JWT/session

## Pendiente crítico
- `useFormStatus` en formularios para estados de carga
