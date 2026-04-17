import Link from "next/link";
import { redirect } from "next/navigation";
import { pageGuard } from "@/components/rbac/PageGuard";
import { Button, buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { firstUserSchemaError, userCreateSchema } from "@/lib/schemas/users";
import { createUser, listAssignableRoles, UserAdminError } from "@/lib/users/admin-service";

async function createUserAction(formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requirePermission("users.manage");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const roleIds = formData.getAll("roleIds").map((value) => String(value));
  const isActive = formData.get("isActive") === "on";

  const parsed = userCreateSchema.safeParse({
    name,
    email,
    password,
    confirmPassword,
    roleIds,
    isActive,
  });

  if (!parsed.success) {
    redirect(`/users/new?error=${encodeURIComponent(firstUserSchemaError(parsed.error))}`);
  }

  try {
    await createUser({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      roleIds: parsed.data.roleIds,
      isActive: parsed.data.isActive,
    });
  } catch (error) {
    const message = error instanceof UserAdminError ? error.message : "No se pudo crear el usuario";
    redirect(`/users/new?error=${encodeURIComponent(message)}`);
  }

  redirect("/users?ok=Usuario+creado");
}

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await pageGuard("users.manage");

  const [sp, roles] = await Promise.all([searchParams, listAssignableRoles()]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Nuevo usuario"
        description="Crea una cuenta y asigna uno o más roles activos."
        actions={
          <Link href="/users" className={buttonStyles({ variant: "secondary" })}>
            Usuarios
          </Link>
        }
      />

      {sp.error ? <section className="surface border-[var(--danger)]/40 bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">{sp.error}</section> : null}

      <form action={createUserAction}>
        <SectionCard
          title="Datos de acceso"
          footer={
            <>
              <Link href="/users" className={buttonStyles({ variant: "secondary" })}>
                Cancelar
              </Link>
              <Button type="submit">Guardar usuario</Button>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input name="name" label="Nombre" required maxLength={120} placeholder="Nombre" />
            <Input name="email" type="email" label="Email" required maxLength={320} placeholder="usuario@empresa.com" />
            <Input name="password" type="password" label="Contraseña" required minLength={8} placeholder="Mínimo 8 caracteres" />
            <Input name="confirmPassword" type="password" label="Confirmar contraseña" required minLength={8} placeholder="Repite la contraseña" />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Roles</p>
            <div className="grid grid-cols-1 gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-subtle)] p-3 md:grid-cols-2">
              {roles.map((role) => (
                <label key={role.id} className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                  <input type="checkbox" name="roleIds" value={role.id} className="h-4 w-4" />
                  <span>{role.code} - {role.name}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input type="checkbox" name="isActive" defaultChecked className="h-4 w-4" />
            <span>Usuario activo</span>
          </label>
        </SectionCard>
      </form>
    </div>
  );
}
