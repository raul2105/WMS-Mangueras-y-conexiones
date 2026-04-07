import type { PermissionCode, RoleCode } from "@/lib/rbac/permissions";

export type RouteAccessEntry = {
  /** Next.js route pattern (use [param] for dynamic segments) */
  route: string;
  /** Human-readable description in Spanish */
  description: string;
  /**
   * Required permission. null means any authenticated user can access.
   * SYSTEM_ADMIN always bypasses permission checks.
   */
  permission: PermissionCode | null;
  /** Roles that hold the required permission (derived from seed data) */
  roles: RoleCode[];
};

/**
 * Central source of truth for every WMS route, its description,
 * required permission, and which roles are allowed.
 *
 * Keep in sync with:
 *  - prisma/seed.cjs  → RBAC_ROLES permission assignments
 *  - lib/rbac/route-permissions.ts  → middleware enforcement rules
 *  - components/layout/nav-config.ts  → nav item permissions
 */
export const ROUTE_ACCESS_MAP: RouteAccessEntry[] = [
  // ── Dashboard ──────────────────────────────────────────────────────────
  {
    route: "/",
    description: "Dashboard operativo: resumen de inventario, compras y ensamble",
    permission: null,
    roles: ["SYSTEM_ADMIN", "MANAGER", "WAREHOUSE_OPERATOR", "SALES_EXECUTIVE"],
  },

  // ── Catálogo ───────────────────────────────────────────────────────────
  {
    route: "/catalog",
    description: "Listado de productos con búsqueda y filtros",
    permission: "catalog.view",
    roles: ["SYSTEM_ADMIN", "MANAGER", "WAREHOUSE_OPERATOR", "SALES_EXECUTIVE"],
  },
  {
    route: "/catalog/[id]",
    description: "Detalle de producto: atributos, imágenes y existencias",
    permission: "catalog.view",
    roles: ["SYSTEM_ADMIN", "MANAGER", "WAREHOUSE_OPERATOR", "SALES_EXECUTIVE"],
  },
  {
    route: "/catalog/new",
    description: "Formulario para crear un nuevo producto",
    permission: "catalog.edit",
    roles: ["SYSTEM_ADMIN", "MANAGER"],
  },
  {
    route: "/catalog/[id]/edit",
    description: "Formulario para editar un producto existente",
    permission: "catalog.edit",
    roles: ["SYSTEM_ADMIN", "MANAGER"],
  },
  {
    route: "/catalog/import",
    description: "Importación masiva de productos desde CSV",
    permission: "catalog.edit",
    roles: ["SYSTEM_ADMIN", "MANAGER"],
  },

  // ── Inventario ─────────────────────────────────────────────────────────
  {
    route: "/inventory",
    description: "Lista de inventario por ubicación con alertas de stock",
    permission: "inventory.view",
    roles: ["SYSTEM_ADMIN", "MANAGER", "WAREHOUSE_OPERATOR", "SALES_EXECUTIVE"],
  },
  {
    route: "/inventory/[id]",
    description: "Detalle de ubicación de inventario con historial de movimientos",
    permission: "inventory.view",
    roles: ["SYSTEM_ADMIN", "MANAGER", "WAREHOUSE_OPERATOR", "SALES_EXECUTIVE"],
  },
  {
    route: "/inventory/receive",
    description: "Recepción de mercancía en almacén",
    permission: "inventory.receive",
    roles: ["SYSTEM_ADMIN", "MANAGER", "WAREHOUSE_OPERATOR"],
  },
  {
    route: "/inventory/pick",
    description: "Retiro / despacho de stock",
    permission: "inventory.pick",
    roles: ["SYSTEM_ADMIN", "MANAGER", "WAREHOUSE_OPERATOR"],
  },
  {
    route: "/inventory/adjust",
    description: "Ajuste de inventario (correcciones de diferencias)",
    permission: "inventory.adjust",
    roles: ["SYSTEM_ADMIN", "MANAGER", "WAREHOUSE_OPERATOR"],
  },
  {
    route: "/inventory/transfer",
    description: "Transferencia de stock entre ubicaciones",
    permission: "inventory.transfer",
    roles: ["SYSTEM_ADMIN", "MANAGER", "WAREHOUSE_OPERATOR"],
  },
  {
    route: "/inventory/kardex",
    description: "Historial paginado de todos los movimientos de inventario",
    permission: "kardex.view",
    roles: ["SYSTEM_ADMIN", "MANAGER", "WAREHOUSE_OPERATOR"],
  },

  // ── Almacenes ──────────────────────────────────────────────────────────
  {
    route: "/warehouse",
    description: "Lista de almacenes con estadísticas de capacidad",
    permission: "warehouse.manage",
    roles: ["SYSTEM_ADMIN", "MANAGER"],
  },
  {
    route: "/warehouse/new",
    description: "Formulario para crear un nuevo almacén",
    permission: "warehouse.manage",
    roles: ["SYSTEM_ADMIN", "MANAGER"],
  },
  {
    route: "/warehouse/[id]",
    description: "Detalle de almacén con lista de ubicaciones",
    permission: "warehouse.manage",
    roles: ["SYSTEM_ADMIN", "MANAGER"],
  },
  {
    route: "/warehouse/[id]/edit",
    description: "Formulario para editar datos de un almacén",
    permission: "warehouse.manage",
    roles: ["SYSTEM_ADMIN", "MANAGER"],
  },
  {
    route: "/warehouse/[id]/locations/new",
    description: "Formulario para agregar una ubicación (rack/bin) a un almacén",
    permission: "location.manage",
    roles: ["SYSTEM_ADMIN", "MANAGER"],
  },

  // ── Ensamble / Producción ──────────────────────────────────────────────
  {
    route: "/production",
    description: "Lista de órdenes de ensamble con filtro por estado",
    permission: "production.view",
    roles: ["SYSTEM_ADMIN", "MANAGER", "WAREHOUSE_OPERATOR"],
  },
  {
    route: "/production/orders/[id]",
    description: "Detalle de orden de ensamble",
    permission: "production.view",
    roles: ["SYSTEM_ADMIN", "MANAGER", "WAREHOUSE_OPERATOR"],
  },
  {
    route: "/production/orders/new/generic",
    description: "Formulario para crear una nueva orden de ensamble genérica",
    permission: "production.execute",
    roles: ["SYSTEM_ADMIN", "MANAGER", "WAREHOUSE_OPERATOR"],
  },

  // ── Comercial ──────────────────────────────────────────────────────────
  {
    route: "/sales",
    description: "Dashboard comercial: disponibilidad, equivalencias y pedidos internos",
    permission: "sales.view",
    roles: ["SYSTEM_ADMIN", "MANAGER", "SALES_EXECUTIVE"],
  },
  {
    route: "/sales/availability",
    description: "Consulta comercial de stock total, reservado y disponible",
    permission: "sales.view",
    roles: ["SYSTEM_ADMIN", "MANAGER", "SALES_EXECUTIVE"],
  },
  {
    route: "/sales/equivalences",
    description: "Consulta comercial de equivalencias por producto",
    permission: "sales.view",
    roles: ["SYSTEM_ADMIN", "MANAGER", "SALES_EXECUTIVE"],
  },
  {
    route: "/sales/orders",
    description: "Listado de pedidos internos comerciales",
    permission: "sales.view",
    roles: ["SYSTEM_ADMIN", "MANAGER", "SALES_EXECUTIVE"],
  },
  {
    route: "/sales/orders/new",
    description: "Captura de pedido interno comercial",
    permission: "sales.view",
    roles: ["SYSTEM_ADMIN", "MANAGER", "SALES_EXECUTIVE"],
  },
  {
    route: "/sales/orders/[id]",
    description: "Detalle de pedido interno con trazabilidad y vinculo a ensamble",
    permission: "sales.view",
    roles: ["SYSTEM_ADMIN", "MANAGER", "SALES_EXECUTIVE"],
  },

  // ── Compras ────────────────────────────────────────────────────────────
  {
    route: "/purchasing",
    description: "Vista de compras: proveedores y órdenes de compra",
    permission: "purchasing.view",
    roles: ["SYSTEM_ADMIN", "MANAGER", "WAREHOUSE_OPERATOR"],
  },
  {
    route: "/purchasing/suppliers",
    description: "Lista de proveedores",
    permission: "purchasing.view",
    roles: ["SYSTEM_ADMIN", "MANAGER", "WAREHOUSE_OPERATOR"],
  },
  {
    route: "/purchasing/suppliers/new",
    description: "Formulario para registrar un nuevo proveedor",
    permission: "purchasing.manage",
    roles: ["SYSTEM_ADMIN", "MANAGER"],
  },
  {
    route: "/purchasing/suppliers/[id]",
    description: "Detalle de proveedor con catálogo de productos y precios",
    permission: "purchasing.view",
    roles: ["SYSTEM_ADMIN", "MANAGER", "WAREHOUSE_OPERATOR"],
  },
  {
    route: "/purchasing/orders",
    description: "Lista de órdenes de compra por estado",
    permission: "purchasing.view",
    roles: ["SYSTEM_ADMIN", "MANAGER", "WAREHOUSE_OPERATOR"],
  },
  {
    route: "/purchasing/orders/new",
    description: "Formulario para crear una nueva orden de compra",
    permission: "purchasing.manage",
    roles: ["SYSTEM_ADMIN", "MANAGER"],
  },
  {
    route: "/purchasing/orders/[id]",
    description: "Detalle de orden de compra",
    permission: "purchasing.view",
    roles: ["SYSTEM_ADMIN", "MANAGER", "WAREHOUSE_OPERATOR"],
  },
  {
    route: "/purchasing/orders/[id]/receive",
    description: "Recepción de artículos de una orden de compra",
    permission: "purchasing.manage",
    roles: ["SYSTEM_ADMIN", "MANAGER"],
  },

  // ── Auditoría & Trazabilidad ───────────────────────────────────────────
  {
    route: "/audit",
    description: "Bitácora de eventos críticos del sistema por entidad y acción",
    permission: "audit.view",
    roles: ["SYSTEM_ADMIN", "MANAGER"],
  },
  {
    route: "/trace",
    description: "Búsqueda de registros de trazabilidad por ID",
    permission: "audit.view",
    roles: ["SYSTEM_ADMIN", "MANAGER"],
  },
  {
    route: "/trace/[traceId]",
    description: "Detalle de un registro de trazabilidad",
    permission: "audit.view",
    roles: ["SYSTEM_ADMIN", "MANAGER"],
  },

  // ── Etiquetas ──────────────────────────────────────────────────────────
  {
    route: "/labels",
    description: "Generación e impresión de etiquetas para ubicaciones y documentos",
    permission: "labels.manage",
    roles: ["SYSTEM_ADMIN", "MANAGER", "WAREHOUSE_OPERATOR"],
  },
];

/**
 * Returns all roles that have the given permission.
 * SYSTEM_ADMIN is always included (it has all permissions).
 */
export function getRolesForPermission(permission: PermissionCode): RoleCode[] {
  const entry = ROUTE_ACCESS_MAP.find((e) => e.permission === permission);
  if (!entry) return ["SYSTEM_ADMIN"];
  return entry.roles;
}

/**
 * Returns the RouteAccessEntry for an exact route pattern (e.g. "/catalog/new").
 * Dynamic segments use the [param] bracket notation.
 */
export function getRouteAccessEntry(route: string): RouteAccessEntry | undefined {
  return ROUTE_ACCESS_MAP.find((e) => e.route === route);
}

/**
 * The default landing page per role after login.
 */
export const ROLE_HOME: Record<RoleCode, string> = {
  SYSTEM_ADMIN: "/",
  MANAGER: "/",
  WAREHOUSE_OPERATOR: "/inventory",
  SALES_EXECUTIVE: "/sales",
};
