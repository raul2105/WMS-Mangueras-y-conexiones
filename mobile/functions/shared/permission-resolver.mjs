const ROLE_PERMISSION_MATRIX = {
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

export function resolvePermissionCodes(roleCodes, flags) {
  const permissionSet = new Set();

  for (const roleCode of roleCodes) {
    for (const permissionCode of ROLE_PERMISSION_MATRIX[roleCode] || []) {
      permissionSet.add(permissionCode);
    }
  }

  // Feature flags gate business capabilities without changing role mapping.
  if (!flags.mobile_enabled) {
    return ["mobile.profile.read"];
  }
  if (!flags.inventory_search_enabled) {
    permissionSet.delete("inventory.search");
  }
  if (!flags.assembly_requests_enabled) {
    permissionSet.delete("assembly_requests.create");
  }
  if (!flags.product_drafts_enabled) {
    permissionSet.delete("product_drafts.create");
  }

  return Array.from(permissionSet);
}
