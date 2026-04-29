export const RBAC_ROLES = [
  "SYSTEM_ADMIN",
  "MANAGER",
  "WAREHOUSE_OPERATOR",
  "SALES_EXECUTIVE",
] as const;

export type RoleCode = (typeof RBAC_ROLES)[number];

export const RBAC_PERMISSIONS = [
  "users.manage",
  "roles.manage",
  "catalog.view",
  "catalog.edit",
  "inventory.view",
  "inventory.adjust",
  "inventory.transfer",
  "inventory.receive",
  "inventory.pick",
  "kardex.view",
  "warehouse.manage",
  "location.manage",
  "production.view",
  "production.execute",
  "purchasing.view",
  "purchasing.manage",
  "sales.view",
  "sales.create_order",
  "customers.view",
  "customers.manage",
  "audit.view",
  "labels.manage",
] as const;

export type PermissionCode = (typeof RBAC_PERMISSIONS)[number];

export function isSystemAdmin(roles: string[] | undefined) {
  return Array.isArray(roles) && roles.includes("SYSTEM_ADMIN");
}
