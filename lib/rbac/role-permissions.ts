import type { PermissionCode, RoleCode } from "@/lib/rbac/permissions";

const ROLE_PERMISSION_MAP: Record<RoleCode, PermissionCode[]> = {
  SYSTEM_ADMIN: [
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
    "audit.view",
    "labels.manage",
  ],
  MANAGER: [
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
    "audit.view",
    "labels.manage",
  ],
  WAREHOUSE_OPERATOR: [
    "catalog.view",
    "inventory.view",
    "inventory.adjust",
    "inventory.transfer",
    "inventory.receive",
    "inventory.pick",
    "kardex.view",
    "production.view",
    "production.execute",
    "purchasing.view",
    "labels.manage",
  ],
  SALES_EXECUTIVE: [
    "catalog.view",
    "inventory.view",
    "sales.view",
    "sales.create_order",
  ],
};

export function getPermissionsForRoles(roles: string[]) {
  const resolved = new Set<PermissionCode>();

  for (const role of roles) {
    const rolePermissions = ROLE_PERMISSION_MAP[role as RoleCode];
    if (!rolePermissions) continue;
    for (const permission of rolePermissions) resolved.add(permission);
  }

  return Array.from(resolved);
}

export function buildPermissionsVersion(roles: string[]) {
  return roles
    .map((role) => role.trim())
    .filter(Boolean)
    .sort()
    .join("|");
}
