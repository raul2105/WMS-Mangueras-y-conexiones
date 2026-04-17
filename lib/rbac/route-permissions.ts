import type { PermissionCode } from "@/lib/rbac/permissions";

type RoutePermissionRule = {
  prefix: string;
  permission: PermissionCode;
};

// Keep most specific prefixes first.
export const ROUTE_PERMISSION_RULES: RoutePermissionRule[] = [
  { prefix: "/users/new", permission: "users.manage" },
  { prefix: "/users/", permission: "users.manage" },
  { prefix: "/users", permission: "users.manage" },

  { prefix: "/catalog/new", permission: "catalog.edit" },
  { prefix: "/catalog/import", permission: "catalog.edit" },
  { prefix: "/catalog/", permission: "catalog.view" },
  { prefix: "/catalog", permission: "catalog.view" },

  { prefix: "/inventory/receive", permission: "inventory.receive" },
  { prefix: "/inventory/pick", permission: "inventory.pick" },
  { prefix: "/inventory/adjust", permission: "inventory.adjust" },
  { prefix: "/inventory/transfer", permission: "inventory.transfer" },
  { prefix: "/inventory/kardex", permission: "kardex.view" },
  { prefix: "/inventory", permission: "inventory.view" },

  { prefix: "/warehouse/", permission: "warehouse.manage" },
  { prefix: "/warehouse", permission: "warehouse.manage" },

  { prefix: "/production/requests/", permission: "sales.view" },
  { prefix: "/production/requests", permission: "sales.view" },
  { prefix: "/production/availability", permission: "sales.view" },
  { prefix: "/production/equivalences", permission: "sales.view" },
  { prefix: "/production/fulfillment/", permission: "production.execute" },
  { prefix: "/production/orders/new", permission: "production.execute" },
  { prefix: "/production/orders/", permission: "production.view" },
  { prefix: "/production", permission: "production.view" },

  { prefix: "/sales/orders/new", permission: "sales.view" },
  { prefix: "/sales/orders/", permission: "sales.view" },
  { prefix: "/sales/orders", permission: "sales.view" },
  { prefix: "/sales/availability", permission: "sales.view" },
  { prefix: "/sales/equivalences", permission: "sales.view" },
  { prefix: "/sales", permission: "sales.view" },

  { prefix: "/purchasing/orders/new", permission: "purchasing.manage" },
  { prefix: "/purchasing/orders/", permission: "purchasing.manage" },
  { prefix: "/purchasing/suppliers/new", permission: "purchasing.manage" },
  { prefix: "/purchasing/suppliers/", permission: "purchasing.view" },
  { prefix: "/purchasing", permission: "purchasing.view" },

  { prefix: "/labels", permission: "labels.manage" },
  { prefix: "/trace", permission: "audit.view" },
  { prefix: "/audit", permission: "audit.view" },

  { prefix: "/api/export/kardex", permission: "kardex.view" },
  { prefix: "/api/export/audit", permission: "audit.view" },
  { prefix: "/api/products/lookup", permission: "catalog.view" },
  { prefix: "/api/products/search", permission: "catalog.view" },
  { prefix: "/api/labels/jobs/", permission: "labels.manage" },
];

export function getRequiredPermissionForPath(pathname: string): PermissionCode | null {
  const match = ROUTE_PERMISSION_RULES.find((rule) => pathname === rule.prefix || pathname.startsWith(rule.prefix));
  return match?.permission ?? null;
}
