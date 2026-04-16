import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionContext } from "@/lib/auth/session-context";
import type { PermissionCode } from "@/lib/rbac/permissions";
import { startPerf } from "@/lib/perf";
import { getRequestId } from "@/lib/request-meta";

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
  const perf = startPerf("rbac.pageGuard");
  const requestId = await getRequestId();
  const [ctx, pathname] = await Promise.all([getSessionContext(), getCurrentPathname()]);

  if (!ctx.isAuthenticated) {
    perf.end({ requestId, allowed: false, reason: "unauthenticated", permission, pathname });
    redirect(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
  }

  if (!ctx.isSystemAdmin && !ctx.permissions.includes(permission)) {
    perf.end({ requestId, allowed: false, reason: "forbidden", permission, pathname });
    redirect(`/forbidden?from=${encodeURIComponent(pathname)}`);
  }

  perf.end({ requestId, allowed: true, permission, pathname });
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
