import type { PermissionCode } from "@/lib/rbac/permissions";
import type { RoleCode } from "@/lib/rbac/permissions";
import { isSystemAdmin } from "@/lib/rbac/permissions";
import { ROLE_HOME } from "@/lib/rbac/route-access-map";

export type NavIcon =
  | "dashboard"
  | "users"
  | "catalog"
  | "warehouse"
  | "inventory"
  | "sales"
  | "purchasing"
  | "production"
  | "audit";

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
    label: "Inicio",
    icon: "dashboard",
    description: "Resumen operativo de inventario, abastecimiento y ensamble.",
    match: "exact",
  },
  {
    href: "/users",
    label: "Usuarios y accesos",
    icon: "users",
    description:
      "Administración de usuarios, roles y estado de acceso al sistema.",
    match: "prefix",
    requiredPermission: "users.manage",
  },
  {
    href: "/catalog",
    label: "Catálogo comercial",
    icon: "catalog",
    description:
      "Catálogo comercial, atributos técnicos y estructura de producto.",
    match: "prefix",
    requiredPermission: "catalog.view",
  },
  {
    href: "/warehouse",
    label: "Almacenes y ubicaciones",
    icon: "warehouse",
    description: "Gestión de almacenes, ubicaciones y capacidad operativa.",
    match: "prefix",
    requiredPermission: "warehouse.manage",
  },
  {
    href: "/inventory",
    label: "Inventario y stock",
    icon: "inventory",
    description:
      "Control de stock, movimientos, trazabilidad y disponibilidad.",
    match: "prefix",
    requiredPermission: "inventory.view",
  },
  {
    href: "/purchasing",
    label: "Compras y recepciones",
    icon: "purchasing",
    description: "Proveedores, órdenes de compra y recepciones en tránsito.",
    match: "prefix",
    requiredPermission: "purchasing.view",
  },
  {
    href: "/production",
    label: "Ensamble y surtido",
    icon: "production",
    description: "Órdenes de trabajo y ejecución de procesos de ensamble.",
    match: "prefix",
    requiredPermission: "production.view",
  },
  {
    href: "/audit",
    label: "Auditoría",
    icon: "audit",
    description:
      "Bitácora de eventos críticos del sistema por entidad y acción.",
    match: "prefix",
    requiredPermission: "audit.view",
  },
];

export const NAV_ITEMS = BASE_NAV_ITEMS;

function buildNavItems(primaryRole: RoleCode): NavItem[] {
  const items = [...BASE_NAV_ITEMS];
  if (primaryRole === "SALES_EXECUTIVE") {
    items.splice(1, 0, {
      href: "/sales/customers",
      label: "Clientes y seguimiento",
      icon: "users",
      description: "Clientes, cuentas y seguimiento comercial.",
      match: "prefix",
      requiredPermission: "customers.view",
    });
  }

  const productionIndex = items.findIndex(
    (item) => item.href === "/production",
  );
  if (productionIndex >= 0 && primaryRole === "SALES_EXECUTIVE") {
    items[productionIndex] = {
      href: "/production/requests",
      label: "Pedidos y surtidos",
      icon: "production",
      description:
        "Pedidos de surtido, configurador y seguimiento comercial dentro del flujo de pedidos.",
      match: "prefix",
      requiredPermission: "production.cockpit.view",
    };
  }

  if (productionIndex >= 0 && primaryRole === "WAREHOUSE_OPERATOR") {
    items[productionIndex] = {
      href: "/production/requests",
      label: "Surtido y ensamble",
      icon: "production",
      description:
        "Cockpit operativo para surtido directo y ensambles confirmados.",
      match: "prefix",
      requiredPermission: "production.cockpit.view",
    };
  }

  if (primaryRole === "SALES_EXECUTIVE") {
    return items.filter((item) => item.href !== "/inventory");
  }

  return items;
}

function getPrimaryRole(roles: string[]): RoleCode {
  const firstKnownRole = roles.find(
    (role): role is RoleCode =>
      role === "SYSTEM_ADMIN" ||
      role === "MANAGER" ||
      role === "WAREHOUSE_OPERATOR" ||
      role === "SALES_EXECUTIVE",
  );
  return firstKnownRole ?? "MANAGER";
}

export function getVisibleNavItems(
  roles: string[] = [],
  permissions: string[] = [],
): NavItem[] {
  const primaryRole = getPrimaryRole(roles);
  const homeHref = ROLE_HOME[primaryRole] ?? "/";
  const navItems = buildNavItems(primaryRole);

  const byPermissions = isSystemAdmin(roles)
    ? navItems
    : navItems.filter(
        (item) =>
          !item.requiredPermission ||
          permissions.includes(item.requiredPermission),
      );

  if (homeHref === "/") {
    return byPermissions;
  }

  const homeItem: NavItem = {
    ...navItems[0],
    href: homeHref,
    label: primaryRole === "SALES_EXECUTIVE" ? "Mis pedidos" : "Inicio",
    description:
      primaryRole === "SALES_EXECUTIVE"
        ? "Acceso principal a tus pedidos de surtido y configuración."
        : "Acceso principal de tu rol.",
    match: "prefix",
  };

  return [
    homeItem,
    ...byPermissions.filter(
      (item) => item.href !== "/" && item.href !== homeHref,
    ),
  ];
}

export function isNavItemActive(pathname: string, item: NavItem) {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function getActiveNavItem(
  pathname: string,
  items: NavItem[] = NAV_ITEMS,
) {
  return (
    items.find((item) => isNavItemActive(pathname, item)) ??
    items[0] ??
    NAV_ITEMS[0]
  );
}
