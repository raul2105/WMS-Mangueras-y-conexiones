import type { ReactNode } from "react";
import AppShell from "@/components/layout/AppShell";
import { auth } from "@/lib/auth";

type Props = {
  children: ReactNode;
};

export default async function ShellLayout({ children }: Props) {
  const session = await auth();
  const userName = session?.user?.name ?? "Usuario";
  const userEmail = session?.user?.email ?? "";
  const roles = session?.user?.roles ?? [];
  const permissions = session?.user?.permissions ?? [];

  return (
    <AppShell userName={userName} userEmail={userEmail} roles={roles} permissions={permissions}>
      {children}
    </AppShell>
  );
}
