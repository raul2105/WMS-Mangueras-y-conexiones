import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { pageGuard } from "@/components/rbac/PageGuard";
import { Button, buttonStyles } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { firstUserSchemaError, userResetPasswordSchema } from "@/lib/schemas/users";
import { getUserById, resetUserPassword, UserAdminError } from "@/lib/users/admin-service";

async function resetPasswordAction(userId: string, formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requirePermission("users.manage");

  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const parsed = userResetPasswordSchema.safeParse({ password, confirmPassword });
  if (!parsed.success) {
    redirect(`/users/${userId}?error=${encodeURIComponent(firstUserSchemaError(parsed.error))}`);
  }

  try {
    await resetUserPassword(userId, parsed.data.password);
  } catch (error) {
    const message = error instanceof UserAdminError ? error.message : "No se pudo resetear la contraseña";
    redirect(`/users/${userId}?error=${encodeURIComponent(message)}`);
  }

  redirect(`/users/${userId}?ok=${encodeURIComponent("Contraseña restablecida")}`);
}

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await pageGuard("users.manage");

  const { id } = await params;
  const sp = await searchParams;

  let user;
  try {
    user = await getUserById(id);
  } catch (error) {
    if (error instanceof UserAdminError && error.message === "Usuario no encontrado") {
      notFound();
    }
    throw error;
  }

  const resetPasswordActionBound = resetPasswordAction.bind(null, user.id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={user.name}
        description="Detalle de usuario y operaciones administrativas seguras."
        actions={
          <>
            <Link href="/users" className={buttonStyles({ variant: "secondary" })}>
              Usuarios
            </Link>
            <Link href={`/users/${user.id}/edit`} className={buttonStyles()}>
              Editar
            </Link>
          </>
        }
      />

      {sp.ok ? <section className="surface border-[var(--success)]/40 bg-[var(--success-soft)] p-4 text-sm text-[var(--success)]">{sp.ok}</section> : null}
      {sp.error ? <section className="surface border-[var(--danger)]/40 bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">{sp.error}</section> : null}

      <SectionCard title="Información de cuenta">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Email</p>
            <p className="font-mono text-sm text-[var(--text-primary)]">{user.email}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Estado</p>
            <Badge variant={user.isActive ? "success" : "danger"} size="md">
              {user.isActive ? "Activo" : "Inactivo"}
            </Badge>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Creado</p>
            <p className="text-sm text-[var(--text-primary)]">{new Date(user.createdAt).toLocaleString("es-MX")}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Actualizado</p>
            <p className="text-sm text-[var(--text-primary)]">{new Date(user.updatedAt).toLocaleString("es-MX")}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Roles asignados" description="Roles activos vinculados al usuario.">
        <div className="flex flex-wrap gap-2">
          {user.userRoles.length === 0 ? (
            <Badge variant="warning" size="md">Sin roles</Badge>
          ) : (
            user.userRoles.map((entry) => (
              <Badge key={entry.role.id} variant="accent" size="md">
                {entry.role.code} - {entry.role.name}
              </Badge>
            ))
          )}
        </div>
      </SectionCard>

      <form action={resetPasswordActionBound}>
        <SectionCard
          title="Resetear contraseña"
          description="Acción separada; nunca expone hash ni contraseña actual."
          footer={<Button type="submit">Actualizar contraseña</Button>}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input name="password" type="password" label="Nueva contraseña" required minLength={8} />
            <Input name="confirmPassword" type="password" label="Confirmar contraseña" required minLength={8} />
          </div>
        </SectionCard>
      </form>
    </div>
  );
}
