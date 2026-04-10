import { getMockUserById } from "./mock-user-profiles.mjs";

function parseRoleCodesFromClaims(claims) {
  const directCsv = claims["custom:role_codes"] || claims.role_codes;
  if (typeof directCsv === "string" && directCsv.trim().length > 0) {
    return directCsv
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  const single = claims["custom:role_code"] || claims.role_code;
  if (typeof single === "string" && single.trim().length > 0) {
    return [single.trim()];
  }

  const groupsRaw = claims["cognito:groups"];
  if (typeof groupsRaw === "string" && groupsRaw.trim().length > 0) {
    return groupsRaw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  if (Array.isArray(groupsRaw)) {
    return groupsRaw.map((value) => String(value).trim()).filter(Boolean);
  }

  return [];
}

export function getAuthContext(event, env = process.env) {
  const mode = (env.MOBILE_AUTH_MODE || "cognito").trim().toLowerCase();

  if (mode === "mock") {
    const mockUserId = (env.MOBILE_MOCK_USER_ID || "mock-manager").trim();
    const mockUser = getMockUserById(mockUserId);
    if (!mockUser) {
      return { ok: false, statusCode: 401, error: "Unauthorized", reason: "Unknown mock user" };
    }
    return {
      ok: true,
      source: "mock",
      userId: mockUser.userId,
      displayName: mockUser.displayName,
      roleCodes: mockUser.roleCodes,
      preferredWarehouseCode: mockUser.preferredWarehouseCode,
      rawClaims: {},
    };
  }

  const claims = event?.requestContext?.authorizer?.jwt?.claims || null;
  if (!claims) {
    return { ok: false, statusCode: 401, error: "Unauthorized", reason: "Missing JWT claims" };
  }

  const userId = String(claims.sub || "").trim();
  if (!userId) {
    return { ok: false, statusCode: 401, error: "Unauthorized", reason: "Missing subject claim" };
  }

  const roleCodes = parseRoleCodesFromClaims(claims);
  if (roleCodes.length === 0) {
    return { ok: false, statusCode: 403, error: "Forbidden", reason: "No role claims" };
  }

  return {
    ok: true,
    source: "cognito",
    userId,
    displayName: String(claims.name || claims.email || userId),
    roleCodes,
    preferredWarehouseCode: claims["custom:preferred_wh_code"]
      ? String(claims["custom:preferred_wh_code"])
      : claims["custom:preferred_warehouse_code"]
      ? String(claims["custom:preferred_warehouse_code"])
      : null,
    rawClaims: claims,
  };
}
