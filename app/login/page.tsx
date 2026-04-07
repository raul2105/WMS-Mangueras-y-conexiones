import { redirect } from "next/navigation";
import { signIn, auth } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/rbac/route-access-map";
import type { RoleCode } from "@/lib/rbac/permissions";
import { buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";

export const dynamic = "force-dynamic";

type SearchParams = {
  callbackUrl?: string;
  error?: string;
};

async function loginAction(formData: FormData) {
  "use server";

  const rawCallbackUrl = String(formData.get("callbackUrl") ?? "/").trim() || "/";
  const callbackUrl = rawCallbackUrl === "/" ? "/auth/redirect" : rawCallbackUrl;
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: callbackUrl,
    });
  } catch (error) {
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
  const session = await auth();
  if (session?.user) {
    const roles = (session.user as { roles?: string[] }).roles ?? [];
    const primaryRole = (roles[0] as RoleCode) ?? "MANAGER";
    redirect(ROLE_HOME[primaryRole] ?? "/");
  }

  const sp = await searchParams;
  const callbackUrl = String(sp.callbackUrl ?? "/").trim() || "/";
  const error = String(sp.error ?? "").trim();

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl items-center">
      <SectionCard title="Acceso WMS" description="Inicia sesion para operar el sistema.">
        <form action={loginAction} className="space-y-4">
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <Input name="email" type="email" label="Email" placeholder="admin@scmayer.local" required />
          <Input name="password" type="password" label="Contrasena" required />
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <button type="submit" className={buttonStyles({ fullWidth: true })}>
            Iniciar sesion
          </button>
        </form>
      </SectionCard>
    </div>
  );
}
