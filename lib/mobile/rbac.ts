import type { MobilePermissionCode, MobileRoleCode } from "@/lib/mobile/contracts";

export type MobileCapabilities = {
  canSearchInventory: boolean;
  canCreateAssemblyRequests: boolean;
  canCreateProductDrafts: boolean;
};

const ROLE_PERMISSIONS: Record<MobileRoleCode, MobilePermissionCode[]> = {
  SYSTEM_ADMIN: [
    "mobile.profile.read",
    "inventory.search",
    "assembly_requests.create",
    "product_drafts.create",
    "mobile.admin",
  ],
  MANAGER: [
    "mobile.profile.read",
    "inventory.search",
    "assembly_requests.create",
    "product_drafts.create",
  ],
  WAREHOUSE_OPERATOR: [
    "mobile.profile.read",
    "inventory.search",
  ],
  SALES_EXECUTIVE: [
    "mobile.profile.read",
    "inventory.search",
    "assembly_requests.create",
    "product_drafts.create",
  ],
};

export function getMobilePermissionsForRole(role: MobileRoleCode): MobilePermissionCode[] {
  return ROLE_PERMISSIONS[role];
}

export function getMobileEffectivePermissions(roleCodes: MobileRoleCode[]): MobilePermissionCode[] {
  const permissionSet = new Set<MobilePermissionCode>();
  for (const roleCode of roleCodes) {
    for (const permissionCode of ROLE_PERMISSIONS[roleCode] ?? []) {
      permissionSet.add(permissionCode);
    }
  }
  return Array.from(permissionSet);
}

export function getMobileCapabilities(permissions: MobilePermissionCode[]): MobileCapabilities {
  const set = new Set(permissions);
  return {
    canSearchInventory: set.has("inventory.search"),
    canCreateAssemblyRequests: set.has("assembly_requests.create"),
    canCreateProductDrafts: set.has("product_drafts.create"),
  };
}

export function resolveRoleFromClaims(
  claims: Record<string, string | undefined>,
  groups: string[] = [],
): MobileRoleCode {
  const directRole = claims["custom:role_code"] ?? claims.role_code;
  if (isRoleCode(directRole)) return directRole;

  for (const group of groups) {
    if (isRoleCode(group)) return group;
  }
  return "MANAGER";
}

function isRoleCode(value: string | undefined): value is MobileRoleCode {
  return (
    value === "SYSTEM_ADMIN"
    || value === "MANAGER"
    || value === "WAREHOUSE_OPERATOR"
    || value === "SALES_EXECUTIVE"
  );
}
