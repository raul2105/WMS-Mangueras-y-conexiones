import type { PermissionCode } from "@/lib/rbac/permissions";

export type NavIcon = "dashboard" | "catalog" | "warehouse" | "inventory" | "sales" | "purchasing" | "production" | "audit";

export type NavMatchMode = "exact" | "prefix";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  description: string;
  match: NavMatchMode;
  requiredPermission?: PermissionCode;
};

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: "dashboard",
    description: "Resumen operativo de inventario, abastecimiento y ensamble.",
    match: "exact",
  },
  {
    href: "/catalog",
    label: "Catalogo",
    icon: "catalog",
    description: "Maestro de productos, atributos tecnicos y estructura comercial.",
    match: "prefix",
    requiredPermission: "catalog.view",
  },
  {
    href: "/warehouse",
    label: "Almacenes",
    icon: "warehouse",
    description: "Gestion de almacenes, ubicaciones y capacidad operativa.",
    match: "prefix",
    requiredPermission: "warehouse.manage",
  },
  {
    href: "/inventory",
    label: "Inventario",
    icon: "inventory",
    description: "Control de stock, movimientos, trazabilidad y disponibilidad.",
    match: "prefix",
    requiredPermission: "inventory.view",
  },
  {
    href: "/sales",
    label: "Comercial",
    icon: "sales",
    description: "Disponibilidad comercial, equivalencias y pedidos internos.",
    match: "prefix",
    requiredPermission: "sales.view",
  },
  {
    href: "/purchasing",
    label: "Compras",
    icon: "purchasing",
    description: "Proveedores, ordenes de compra y recepciones en transito.",
    match: "prefix",
    requiredPermission: "purchasing.view",
  },
  {
    href: "/production",
    label: "Ensamble",
    icon: "production",
    description: "Ordenes de trabajo y ejecucion de procesos de ensamble.",
    match: "prefix",
    requiredPermission: "production.view",
  },
  {
    href: "/audit",
    label: "Auditoria",
    icon: "audit",
    description: "Bitacora de eventos criticos del sistema por entidad y accion.",
    match: "prefix",
    requiredPermission: "audit.view",
  },
];

export function isNavItemActive(pathname: string, item: NavItem) {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function getActiveNavItem(pathname: string, items: NavItem[] = NAV_ITEMS) {
  return items.find((item) => isNavItemActive(pathname, item)) ?? items[0] ?? NAV_ITEMS[0];
}
