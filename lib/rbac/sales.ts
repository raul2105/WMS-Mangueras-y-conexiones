import { getSessionContext } from "@/lib/auth/session-context";
import { RbacPermissionError } from "@/lib/rbac";
import { isSystemAdmin } from "@/lib/rbac/permissions";

export async function requireSalesWriteAccess() {
  const ctx = await getSessionContext();
  if (!ctx.isAuthenticated || !ctx.session?.user) {
    throw new RbacPermissionError("Authentication required");
  }

  const roles = ctx.roles;
  const permissions = ctx.permissions;

  if (isSystemAdmin(roles) || roles.includes("MANAGER") || permissions.includes("sales.create_order")) {
    return ctx.session;
  }

  throw new RbacPermissionError("Permission required: sales.create_order");
}
