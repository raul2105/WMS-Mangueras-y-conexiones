export type NavIcon = "dashboard" | "catalog" | "warehouse" | "inventory" | "purchasing" | "production";

export type NavMatchMode = "exact" | "prefix";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  description: string;
  match: NavMatchMode;
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
  },
  {
    href: "/warehouse",
    label: "Almacenes",
    icon: "warehouse",
    description: "Gestion de almacenes, ubicaciones y capacidad operativa.",
    match: "prefix",
  },
  {
    href: "/inventory",
    label: "Inventario",
    icon: "inventory",
    description: "Control de stock, movimientos, trazabilidad y disponibilidad.",
    match: "prefix",
  },
  {
    href: "/purchasing",
    label: "Compras",
    icon: "purchasing",
    description: "Proveedores, ordenes de compra y recepciones en transito.",
    match: "prefix",
  },
  {
    href: "/production",
    label: "Ensamble",
    icon: "production",
    description: "Ordenes de trabajo y ejecucion de procesos de ensamble.",
    match: "prefix",
  },
];

export function isNavItemActive(pathname: string, item: NavItem) {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function getActiveNavItem(pathname: string) {
  return NAV_ITEMS.find((item) => isNavItemActive(pathname, item)) ?? NAV_ITEMS[0];
}
