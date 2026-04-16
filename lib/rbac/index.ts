import { getSessionContext } from "@/lib/auth/session-context";
import { isSystemAdmin, type PermissionCode, type RoleCode } from "@/lib/rbac/permissions";

export class RbacPermissionError extends Error {
  statusCode: number;

  constructor(message = "Forbidden") {
    super(message);
    this.name = "RbacPermissionError";
    this.statusCode = 403;
  }
}

export async function getAuthSession() {
  return (await getSessionContext()).session;
}

export async function hasRole(role: RoleCode) {
  const { roles } = await getSessionContext();
  return roles.includes(role);
}

export async function hasPermission(permission: PermissionCode) {
  const { roles, permissions } = await getSessionContext();
  if (isSystemAdmin(roles)) return true;
  return permissions.includes(permission);
}

export async function requirePermission(permission: PermissionCode) {
  const { session, roles, permissions, isAuthenticated } = await getSessionContext();
  if (!isAuthenticated || !session?.user) {
    throw new RbacPermissionError("Authentication required");
  }

  if (isSystemAdmin(roles) || permissions.includes(permission)) {
    return session;
  }

  throw new RbacPermissionError(`Permission required: ${permission}`);
}
