import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/rbac/route-access-map";
import type { RoleCode } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

export default async function AuthRedirectPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const roles = (session.user as { roles?: string[] }).roles ?? [];
  const primaryRole = (roles[0] as RoleCode) ?? "MANAGER";
  const home = ROLE_HOME[primaryRole] ?? "/";

  redirect(home);
}
