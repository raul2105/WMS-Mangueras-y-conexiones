import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isSystemAdmin } from "@/lib/rbac/permissions";
import type { PermissionCode } from "@/lib/rbac/permissions";

async function getCurrentPathname(): Promise<string> {
  const hdrs = await headers();
  // Next.js sets x-pathname via middleware; fall back to x-invoke-path
  return hdrs.get("x-pathname") ?? hdrs.get("x-invoke-path") ?? "/";
}

/**
 * Call `await pageGuard("some.perm")` at the top of an async Server Component
 * (page function body, before any DB queries) to block unauthorized renders.
 *
 * - Unauthenticated → redirect(/login?callbackUrl=…)
 * - Forbidden       → redirect(/forbidden?from=…)
 * - Authorized      → returns void (continues rendering)
 */
export async function pageGuard(permission: PermissionCode): Promise<void> {
  const [session, pathname] = await Promise.all([auth(), getCurrentPathname()]);

  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
  }

  const roles = session.user.roles ?? [];
  const permissions = session.user.permissions ?? [];

  if (!isSystemAdmin(roles) && !permissions.includes(permission)) {
    redirect(`/forbidden?from=${encodeURIComponent(pathname)}`);
  }
}

/**
 * JSX-form render guard. Drop `<PageGuard permission="some.perm" />` anywhere
 * in a Server Component tree to guard further rendering.
 * Returns null when authorized. Redirects otherwise.
 */
export default async function PageGuard({ permission }: { permission: PermissionCode }) {
  await pageGuard(permission);
  return null;
}
