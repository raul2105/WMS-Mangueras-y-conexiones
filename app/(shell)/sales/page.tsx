import { getSessionContext } from "@/lib/auth/session-context";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Compatibility root: role homes are the only visible entry points. The
 * commercial capabilities remain under `/sales/*`.
 */
export default async function SalesPage() {
  const ctx = await getSessionContext();

  if (!ctx.isAuthenticated) redirect("/login");
  if (ctx.roles.includes("SALES_EXECUTIVE")) redirect("/home/sales");
  if (ctx.roles.includes("MANAGER")) redirect("/home/manager");
  if (ctx.roles.includes("SYSTEM_ADMIN")) redirect("/home/admin");

  redirect("/forbidden");
}
