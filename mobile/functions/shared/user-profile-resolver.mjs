const VALID_ROLES = new Set([
  "SYSTEM_ADMIN",
  "MANAGER",
  "WAREHOUSE_OPERATOR",
  "SALES_EXECUTIVE",
]);

export function resolveUserProfile(authContext) {
  const roleCodes = (authContext.roleCodes || []).filter((roleCode) => VALID_ROLES.has(roleCode));
  if (roleCodes.length === 0) {
    return { ok: false, statusCode: 403, error: "Forbidden", reason: "No valid role codes" };
  }

  return {
    ok: true,
    profile: {
      userId: authContext.userId,
      displayName: authContext.displayName || authContext.userId,
      roleCodes,
      preferredWarehouseCode: authContext.preferredWarehouseCode || null,
    },
  };
}
