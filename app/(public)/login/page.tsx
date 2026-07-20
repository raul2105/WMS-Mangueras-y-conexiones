import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { signIn } from "@/lib/auth";
import { getSessionContext } from "@/lib/auth/session-context";
import { SectionCard } from "@/components/ui/section-card";
import ThemeToggle from "@/components/ThemeToggle";
import { startPerf } from "@/lib/perf";
import { getRequestId } from "@/lib/request-meta";
import { resolvePostLoginRedirect, sanitizeCallbackUrl } from "@/lib/auth/callback-url";
import LoginForm from "@/components/auth/LoginForm";

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

function isNextRedirectError(error: unknown) {
  return Boolean(
    error
    && typeof error === "object"
    && "digest" in error
    && typeof (error as { digest?: unknown }).digest === "string"
    && (error as { digest: string }).digest.startsWith("NEXT_REDIRECT"),
  );
}

async function loginAction(formData: FormData) {
  "use server";

  const perf = startPerf("auth.login_action");
  const requestId = await getRequestId();
  const callbackUrl = sanitizeCallbackUrl(String(formData.get("callbackUrl") ?? "/"));
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
    // Auth.js completes a successful credential login by throwing Next's
    // redirect sentinel. It must continue to the requested route instead of
    // being converted into a visible login error.
    if (isNextRedirectError(error)) throw error;
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
  const sp = await searchParams;
  const callbackUrl = sanitizeCallbackUrl(sp.callbackUrl);
  const error = String(sp.error ?? "").trim();

  // Only check session (which hits the DB) when a session cookie is present.
  // Anonymous visitors skip auth() entirely — this removes ~200ms of overhead
  // on the initial login page load and avoids a Prisma round-trip for nothing.
  const cookieStore = await cookies();
  const hasCookie = SESSION_COOKIE_NAMES.some((name) => cookieStore.has(name));
  if (hasCookie) {
    const ctx = await getSessionContext();
    if (ctx.isAuthenticated) {
      redirect(resolvePostLoginRedirect(callbackUrl, ctx.roles));
    }
  }

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
          <LoginForm action={loginAction} callbackUrl={callbackUrl} error={error} />
        </SectionCard>
      </div>
    </div>
  );
}
