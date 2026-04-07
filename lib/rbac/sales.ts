import { auth } from "@/lib/auth";
import { RbacPermissionError } from "@/lib/rbac";
import { isSystemAdmin } from "@/lib/rbac/permissions";

export async function requireSalesWriteAccess() {
  const session = await auth();
  if (!session?.user) {
    throw new RbacPermissionError("Authentication required");
  }

  const roles = session.user.roles ?? [];
  const permissions = session.user.permissions ?? [];

  if (isSystemAdmin(roles) || roles.includes("MANAGER") || permissions.includes("sales.create_order")) {
    return session;
  }

  throw new RbacPermissionError("Permission required: sales.create_order");
}
