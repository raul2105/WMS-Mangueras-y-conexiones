import { getAuthContext } from "./auth-adapter.mjs";
import { readFlags } from "./flags.mjs";
import { resolveUserProfile } from "./user-profile-resolver.mjs";
import { resolvePermissionCodes } from "./permission-resolver.mjs";

export function resolveMobileAccess(event) {
  const auth = getAuthContext(event);
  if (!auth.ok) {
    return { ok: false, statusCode: auth.statusCode || 401, error: auth.error || "Unauthorized" };
  }

  const profileResult = resolveUserProfile(auth);
  if (!profileResult.ok) {
    return { ok: false, statusCode: profileResult.statusCode || 403, error: profileResult.error || "Forbidden" };
  }

  const flags = readFlags();
  const permissionCodes = resolvePermissionCodes(profileResult.profile.roleCodes, flags);

  return {
    ok: true,
    profile: profileResult.profile,
    flags,
    permissionCodes,
  };
}

export function hasPermission(access, permissionCode) {
  if (!access?.ok) return false;
  return new Set(access.permissionCodes || []).has(permissionCode);
}
