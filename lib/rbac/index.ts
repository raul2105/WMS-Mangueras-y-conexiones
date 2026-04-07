import { auth } from "@/lib/auth";
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
  return auth();
}

export async function hasRole(role: RoleCode) {
  const session = await auth();
  const roles = session?.user?.roles ?? [];
  return roles.includes(role);
}

export async function hasPermission(permission: PermissionCode) {
  const session = await auth();
  const roles = session?.user?.roles ?? [];
  const permissions = session?.user?.permissions ?? [];
  if (isSystemAdmin(roles)) return true;
  return permissions.includes(permission);
}

export async function requirePermission(permission: PermissionCode) {
  const session = await auth();
  if (!session?.user) {
    throw new RbacPermissionError("Authentication required");
  }

  const roles = session.user.roles ?? [];
  const permissions = session.user.permissions ?? [];
  if (isSystemAdmin(roles) || permissions.includes(permission)) {
    return session;
  }

  throw new RbacPermissionError(`Permission required: ${permission}`);
}
