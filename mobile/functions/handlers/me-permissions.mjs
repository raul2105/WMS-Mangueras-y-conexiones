import { json, nowIso } from "../shared/response.mjs";
import { readFlags } from "../shared/flags.mjs";
import { getAuthContext } from "../shared/auth-adapter.mjs";
import { resolveUserProfile } from "../shared/user-profile-resolver.mjs";
import { resolvePermissionCodes } from "../shared/permission-resolver.mjs";

export async function handler(event) {
  const auth = getAuthContext(event);
  if (!auth.ok) {
    return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });
  }

  const flags = readFlags();
  const profileResult = resolveUserProfile(auth);
  if (!profileResult.ok) {
    return json(profileResult.statusCode || 403, { ok: false, error: profileResult.error || "Forbidden" });
  }

  const profile = profileResult.profile;
  const permissionCodes = resolvePermissionCodes(profile.roleCodes, flags);

  return json(200, {
    ok: true,
    apiVersion: "v1",
    userId: profile.userId,
    displayName: profile.displayName,
    email: auth?.rawClaims?.email ? String(auth.rawClaims.email) : null,
    roleCodes: profile.roleCodes,
    effectiveRoleCode: profile.effectiveRoleCode,
    permissionCodes,
    preferredWarehouseCode: profile.preferredWarehouseCode,
    timestamp: nowIso(),
  });
}
