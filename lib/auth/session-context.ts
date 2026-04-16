import { cache } from "react";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { isSystemAdmin } from "@/lib/rbac/permissions";
import type { PermissionCode } from "@/lib/rbac/permissions";
import { getPermissionsForRoles } from "@/lib/rbac/role-permissions";
import { startPerf } from "@/lib/perf";
import { getRequestId } from "@/lib/request-meta";

export type SessionContext = {
  session: Session | null;
  user: Session["user"] | null;
  roles: string[];
  permissions: string[];
  isAuthenticated: boolean;
  isSystemAdmin: boolean;
};

const buildSessionContext = cache(async (): Promise<SessionContext> => {
  const perf = startPerf("auth.session_context");
  const session = await auth();
  const user = session?.user ?? null;
  const roles = user?.roles ?? [];
  const permissions = getPermissionsForRoles(roles);
  const requestId = await getRequestId();

  const context = {
    session,
    user,
    roles,
    permissions,
    isAuthenticated: Boolean(user),
    isSystemAdmin: isSystemAdmin(roles),
  };

  perf.end({
    requestId,
    isAuthenticated: context.isAuthenticated,
    roleCount: roles.length,
    permissionCount: permissions.length,
  });

  return context;
});

export async function getSessionContext() {
  return buildSessionContext();
}

export async function hasPermissionInSession(permission: PermissionCode) {
  const ctx = await getSessionContext();
  if (!ctx.isAuthenticated) return false;
  return ctx.isSystemAdmin || ctx.permissions.includes(permission);
}
