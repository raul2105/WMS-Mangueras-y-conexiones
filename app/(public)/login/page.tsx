import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { signIn } from "@/lib/auth";
import { getSessionContext } from "@/lib/auth/session-context";
import { ROLE_HOME } from "@/lib/rbac/route-access-map";
import type { RoleCode } from "@/lib/rbac/permissions";
import { buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import ThemeToggle from "@/components/ThemeToggle";
import { startPerf } from "@/lib/perf";
import { getRequestId } from "@/lib/request-meta";

const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "__Host-authjs.session-token",
];

export const dynamic = "force-dynamic";

type SearchParams = {
  callbackUrl?: string;
  error?: string;
};

async function loginAction(formData: FormData) {
  "use server";

  const perf = startPerf("auth.login_action");
  const requestId = await getRequestId();
  const callbackUrl = String(formData.get("callbackUrl") ?? "/").trim() || "/";
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: callbackUrl,
    });
    perf.end({ requestId, ok: true, callbackUrl });
  } catch (error) {
    perf.end({ requestId, ok: false, callbackUrl });
    const message = error instanceof Error ? error.message : "No se pudo iniciar sesion";
    const normalized = message.toLowerCase().includes("credential") ? "Credenciales invalidas" : "No se pudo iniciar sesion";
    const code = encodeURIComponent(normalized);
    redirect(`/login?error=${code}&callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Only check session (which hits the DB) when a session cookie is present.
  // Anonymous visitors skip auth() entirely — this removes ~200ms of overhead
  // on the initial login page load and avoids a Prisma round-trip for nothing.
  const cookieStore = await cookies();
  const hasCookie = SESSION_COOKIE_NAMES.some((name) => cookieStore.has(name));
  if (hasCookie) {
    const ctx = await getSessionContext();
    if (ctx.isAuthenticated) {
      const roles = ctx.roles;
      const primaryRole = (roles[0] as RoleCode) ?? "MANAGER";
      redirect(ROLE_HOME[primaryRole] ?? "/");
    }
  }

  const sp = await searchParams;
  const callbackUrl = String(sp.callbackUrl ?? "/").trim() || "/";
  const error = String(sp.error ?? "").trim();

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(circle at 10% 10%, color-mix(in oklab, var(--accent) 22%, transparent) 0%, transparent 40%), radial-gradient(circle at 80% 20%, color-mix(in oklab, var(--accent) 14%, transparent) 0%, transparent 36%), linear-gradient(180deg, var(--bg-app), var(--bg-app))",
        }}
      />

      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">SCMAYHER WMS</p>
          <ThemeToggle compact />
        </div>
        <SectionCard title="Acceso WMS" description="Inicia sesion para operar el sistema.">
          <form action={loginAction} className="space-y-4">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <Input name="email" type="email" label="Email" placeholder="admin@scmayher.com" required />
            <Input name="password" type="password" label="Contrasena" required />
            {error ? <p className="text-sm text-[var(--status-danger-text)]">{error}</p> : null}
            <button type="submit" className={buttonStyles({ fullWidth: true })}>
              Iniciar sesion
            </button>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}
