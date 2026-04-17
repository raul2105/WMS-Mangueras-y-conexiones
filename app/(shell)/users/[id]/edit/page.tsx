import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { pageGuard } from "@/components/rbac/PageGuard";
import { Button, buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { firstUserSchemaError, userUpdateSchema } from "@/lib/schemas/users";
import { getUserById, listAssignableRoles, updateUser, UserAdminError } from "@/lib/users/admin-service";

async function updateUserAction(userId: string, formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requirePermission("users.manage");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const roleIds = formData.getAll("roleIds").map((value) => String(value));
  const isActive = formData.get("isActive") === "on";

  const parsed = userUpdateSchema.safeParse({
    name,
    email,
    roleIds,
    isActive,
  });

  if (!parsed.success) {
    redirect(`/users/${userId}/edit?error=${encodeURIComponent(firstUserSchemaError(parsed.error))}`);
  }

  try {
    await updateUser(userId, parsed.data);
  } catch (error) {
    const message = error instanceof UserAdminError ? error.message : "No se pudo actualizar el usuario";
    redirect(`/users/${userId}/edit?error=${encodeURIComponent(message)}`);
  }

  redirect(`/users/${userId}?ok=${encodeURIComponent("Usuario actualizado")}`);
}

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await pageGuard("users.manage");

  const { id } = await params;
  const [sp, roles] = await Promise.all([searchParams, listAssignableRoles()]);

  let user;
  try {
    user = await getUserById(id);
  } catch (error) {
    if (error instanceof UserAdminError && error.message === "Usuario no encontrado") {
      notFound();
    }
    throw error;
  }

  const selectedRoleIds = new Set(user.userRoles.map((entry) => entry.role.id));
  const updateUserActionBound = updateUserAction.bind(null, user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Editar usuario"
        description="Actualiza datos, roles y estado del usuario."
        actions={
          <>
            <Link href={`/users/${user.id}`} className={buttonStyles({ variant: "secondary" })}>
              Regresar
            </Link>
          </>
        }
      />

      {sp.error ? <section className="surface border-[var(--danger)]/40 bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">{sp.error}</section> : null}

      <form action={updateUserActionBound}>
        <SectionCard
          title="Datos de cuenta"
          footer={
            <>
              <Link href={`/users/${user.id}`} className={buttonStyles({ variant: "secondary" })}>
                Cancelar
              </Link>
              <Button type="submit">Guardar cambios</Button>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input name="name" label="Nombre" required maxLength={120} defaultValue={user.name} />
            <Input name="email" type="email" label="Email" required maxLength={320} defaultValue={user.email} />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Roles</p>
            <div className="grid grid-cols-1 gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-subtle)] p-3 md:grid-cols-2">
              {roles.map((role) => (
                <label key={role.id} className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                  <input type="checkbox" name="roleIds" value={role.id} defaultChecked={selectedRoleIds.has(role.id)} className="h-4 w-4" />
                  <span>{role.code} - {role.name}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input type="checkbox" name="isActive" defaultChecked={user.isActive} className="h-4 w-4" />
            <span>Usuario activo</span>
          </label>
        </SectionCard>
      </form>
    </div>
  );
}
