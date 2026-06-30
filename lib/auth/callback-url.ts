import { ROLE_HOME } from "@/lib/rbac/route-access-map";
import { RBAC_ROLES, type RoleCode } from "@/lib/rbac/permissions";
import { getRequiredPermissionForPath } from "@/lib/rbac/route-permissions";
import { getPermissionsForRoles } from "@/lib/rbac/role-permissions";

const FALLBACK_CALLBACK_URL = "/";
const DISALLOWED_CALLBACK_PREFIXES = ["/api/", "/_next/"];
const DISALLOWED_CALLBACK_PATHS = new Set(["/login", "/logout", "/forbidden"]);

export function sanitizeCallbackUrl(rawValue: string | null | undefined): string {
  const value = String(rawValue ?? "").trim();
  if (!value) return FALLBACK_CALLBACK_URL;

  if (!value.startsWith("/")) return FALLBACK_CALLBACK_URL;
  if (value.startsWith("//")) return FALLBACK_CALLBACK_URL;

  try {
    const normalized = new URL(value, "http://localhost");
    if (normalized.origin !== "http://localhost") return FALLBACK_CALLBACK_URL;
    if (!normalized.pathname.startsWith("/")) return FALLBACK_CALLBACK_URL;
    return `${normalized.pathname}${normalized.search}${normalized.hash}`;
  } catch {
    return FALLBACK_CALLBACK_URL;
  }
}

function getPrimaryRoleHome(roles: string[] | undefined) {
  const primaryRole = Array.isArray(roles) && roles.length > 0
    ? roles[0] as RoleCode
    : "MANAGER";
  return ROLE_HOME[primaryRole] ?? "/";
}

function getAllowedHomeRoutes(roles: string[] | undefined) {
  return new Set(
    (roles ?? [])
      .filter((role): role is RoleCode => RBAC_ROLES.includes(role as RoleCode))
      .map((role) => ROLE_HOME[role]),
  );
}

export function resolvePostLoginRedirect(rawValue: string | null | undefined, roles: string[] | undefined) {
  const fallbackUrl = getPrimaryRoleHome(roles);
  const callbackUrl = sanitizeCallbackUrl(rawValue);

  if (callbackUrl === FALLBACK_CALLBACK_URL) return fallbackUrl;

  const normalized = new URL(callbackUrl, "http://localhost");
  const pathname = normalized.pathname;

  if (
    DISALLOWED_CALLBACK_PATHS.has(pathname)
    || DISALLOWED_CALLBACK_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    return fallbackUrl;
  }

  const allowedHomeRoutes = getAllowedHomeRoutes(roles);
  if (allowedHomeRoutes.has(pathname)) {
    return callbackUrl;
  }

  if (Array.isArray(roles) && roles.includes("SYSTEM_ADMIN")) {
    return callbackUrl;
  }

  const requiredPermission = getRequiredPermissionForPath(pathname);
  if (!requiredPermission) return fallbackUrl;

  const grantedPermissions = getPermissionsForRoles(roles ?? []);
  return grantedPermissions.includes(requiredPermission) ? callbackUrl : fallbackUrl;
}
