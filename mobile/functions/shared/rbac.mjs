const ROLE_PERMISSIONS = {
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

export function resolveRole(claims = {}) {
  const fromClaim = claims["custom:role_code"] || claims.role_code;
  if (ROLE_PERMISSIONS[fromClaim]) return fromClaim;

  const groupsRaw = claims["cognito:groups"];
  const groups = Array.isArray(groupsRaw)
    ? groupsRaw
    : typeof groupsRaw === "string"
      ? groupsRaw.split(",").map((g) => g.trim()).filter(Boolean)
      : [];

  for (const group of groups) {
    if (ROLE_PERMISSIONS[group]) return group;
  }
  return "MANAGER";
}

export function permissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.MANAGER;
}

export function capabilitiesFromPermissions(permissions) {
  const set = new Set(permissions || []);
  return {
    canSearchInventory: set.has("inventory.search"),
    canCreateAssemblyRequests: set.has("assembly_requests.create"),
    canCreateProductDrafts: set.has("product_drafts.create"),
  };
}
