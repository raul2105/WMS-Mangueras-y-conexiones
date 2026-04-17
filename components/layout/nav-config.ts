import type { PermissionCode } from "@/lib/rbac/permissions";
import type { RoleCode } from "@/lib/rbac/permissions";
import { isSystemAdmin } from "@/lib/rbac/permissions";
import { ROLE_HOME } from "@/lib/rbac/route-access-map";

export type NavIcon = "dashboard" | "users" | "catalog" | "warehouse" | "inventory" | "sales" | "purchasing" | "production" | "audit";

export type NavMatchMode = "exact" | "prefix";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  description: string;
  match: NavMatchMode;
  requiredPermission?: PermissionCode;
};

const BASE_NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: "dashboard",
    description: "Resumen operativo de inventario, abastecimiento y ensamble.",
    match: "exact",
  },
  {
    href: "/users",
    label: "Usuarios",
    icon: "users",
    description: "Administracion de usuarios, roles y estado de acceso al sistema.",
    match: "prefix",
    requiredPermission: "users.manage",
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

export const NAV_ITEMS = BASE_NAV_ITEMS;

function buildNavItems(primaryRole: RoleCode): NavItem[] {
  const items = [...BASE_NAV_ITEMS];
  const productionIndex = items.findIndex((item) => item.href === "/production");
  if (productionIndex >= 0 && primaryRole === "SALES_EXECUTIVE") {
    items[productionIndex] = {
      href: "/production/requests",
      label: "Ensamble",
      icon: "production",
      description: "Pedidos de surtido, configurador y seguimiento comercial dentro de ensamble.",
      match: "prefix",
      requiredPermission: "sales.view",
    };
  }

  return items;
}

function getPrimaryRole(roles: string[]): RoleCode {
  const firstKnownRole = roles.find((role): role is RoleCode =>
    role === "SYSTEM_ADMIN" || role === "MANAGER" || role === "WAREHOUSE_OPERATOR" || role === "SALES_EXECUTIVE",
  );
  return firstKnownRole ?? "MANAGER";
}

export function getVisibleNavItems(roles: string[] = [], permissions: string[] = []): NavItem[] {
  const primaryRole = getPrimaryRole(roles);
  const homeHref = ROLE_HOME[primaryRole] ?? "/";
  const navItems = buildNavItems(primaryRole);

  const byPermissions = isSystemAdmin(roles)
    ? navItems
    : navItems.filter((item) => !item.requiredPermission || permissions.includes(item.requiredPermission));

  if (homeHref === "/") {
    return byPermissions;
  }

  const homeItem: NavItem = {
    ...navItems[0],
    href: homeHref,
    label: "Inicio",
    description: "Acceso principal de tu rol.",
    match: "prefix",
  };

  return [
    homeItem,
    ...byPermissions.filter((item) => item.href !== "/" && item.href !== homeHref),
  ];
}

export function isNavItemActive(pathname: string, item: NavItem) {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function getActiveNavItem(pathname: string, items: NavItem[] = NAV_ITEMS) {
  return items.find((item) => isNavItemActive(pathname, item)) ?? items[0] ?? NAV_ITEMS[0];
}
