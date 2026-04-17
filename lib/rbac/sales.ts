import { getSessionContext } from "@/lib/auth/session-context";
import { RbacPermissionError } from "@/lib/rbac";
import { isSystemAdmin } from "@/lib/rbac/permissions";

export function hasSalesWriteAccess(args: { roles: string[]; permissions: string[] }) {
  return isSystemAdmin(args.roles) || args.roles.includes("MANAGER") || args.permissions.includes("sales.create_order");
}

export async function requireSalesWriteAccess() {
  const ctx = await getSessionContext();
  if (!ctx.isAuthenticated || !ctx.session?.user) {
    throw new RbacPermissionError("Authentication required");
  }

  const roles = ctx.roles;
  const permissions = ctx.permissions;

  if (hasSalesWriteAccess({ roles, permissions })) {
    return ctx.session;
  }

  throw new RbacPermissionError("Permission required: sales.create_order");
}
