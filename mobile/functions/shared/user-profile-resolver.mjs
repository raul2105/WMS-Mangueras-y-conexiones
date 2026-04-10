const VALID_ROLES = new Set([
  "SYSTEM_ADMIN",
  "MANAGER",
  "WAREHOUSE_OPERATOR",
  "SALES_EXECUTIVE",
]);

const ROLE_ALIASES = {
  ADMINISTRADOR: "SYSTEM_ADMIN",
  OPERADOR: "WAREHOUSE_OPERATOR",
  SALES: "SALES_EXECUTIVE",
};

const ROLE_PRIORITY = [
  "SYSTEM_ADMIN",
  "MANAGER",
  "WAREHOUSE_OPERATOR",
  "SALES_EXECUTIVE",
];

function normalizeRoleCode(roleCode) {
  const normalized = String(roleCode || "").trim().toUpperCase();
  return ROLE_ALIASES[normalized] || normalized;
}

function resolveEffectiveRoleCode(roleCodes) {
  for (const roleCode of ROLE_PRIORITY) {
    if (roleCodes.includes(roleCode)) {
      return roleCode;
    }
  }
  return "MANAGER";
}

export function resolveUserProfile(authContext) {
  const roleCodes = (authContext.roleCodes || [])
    .map(normalizeRoleCode)
    .filter((roleCode) => VALID_ROLES.has(roleCode));
  if (roleCodes.length === 0) {
    return { ok: false, statusCode: 403, error: "Forbidden", reason: "No valid role codes" };
  }

  return {
    ok: true,
    profile: {
      userId: authContext.userId,
      displayName: authContext.displayName || authContext.userId,
      roleCodes,
      effectiveRoleCode: resolveEffectiveRoleCode(roleCodes),
      preferredWarehouseCode: authContext.preferredWarehouseCode || null,
    },
  };
}
