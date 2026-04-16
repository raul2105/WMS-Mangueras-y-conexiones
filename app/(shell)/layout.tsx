import type { ReactNode } from "react";
import { cookies } from "next/headers";
import AppShell from "@/components/layout/AppShell";
import { getSessionContext } from "@/lib/auth/session-context";
import { SIDEBAR_COOKIE_KEY, normalizeSidebarPreference } from "@/lib/ui-preferences";

type Props = {
  children: ReactNode;
};

export default async function ShellLayout({ children }: Props) {
  const [ctx, cookieStore] = await Promise.all([getSessionContext(), cookies()]);
  const userName = ctx.user?.name ?? "Usuario";
  const userEmail = ctx.user?.email ?? "";
  const roles = ctx.roles;
  const permissions = ctx.permissions;
  const initialSidebarCollapsed = normalizeSidebarPreference(cookieStore.get(SIDEBAR_COOKIE_KEY)?.value);

  return (
    <AppShell
      userName={userName}
      userEmail={userEmail}
      roles={roles}
      permissions={permissions}
      initialSidebarCollapsed={initialSidebarCollapsed}
    >
      {children}
    </AppShell>
  );
}
