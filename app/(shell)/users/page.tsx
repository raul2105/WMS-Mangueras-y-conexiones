import Link from "next/link";
import { pageGuard } from "@/components/rbac/PageGuard";
import { buttonStyles } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableEmptyRow, TableRow, TableWrap, Td, Th } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listAssignableRoles, listUsers } from "@/lib/users/admin-service";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  role?: string;
  status?: "active" | "inactive" | "all";
  page?: string;
};

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await pageGuard("users.manage");

  const sp = await searchParams;
  const page = parsePage(sp.page);
  const query = String(sp.q ?? "").trim();
  const roleCode = String(sp.role ?? "").trim();
  const status = sp.status === "active" || sp.status === "inactive" ? sp.status : "all";

  const [roles, users] = await Promise.all([
    listAssignableRoles(),
    listUsers({
      query,
      roleCode,
      isActive: status,
      page,
      pageSize: 25,
    }),
  ]);

  const buildHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (roleCode) params.set("role", roleCode);
    if (status !== "all") params.set("status", status);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/users?${qs}` : "/users";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        description="Administración de cuentas, roles y estado de acceso."
        meta={`${users.total.toLocaleString("es-MX")} usuarios`}
        actions={
          <Link href="/users/new" className={buttonStyles()}>
            Nuevo usuario
          </Link>
        }
      />

      <SectionCard title="Filtros" description="Filtra por nombre/email, rol y estado de actividad.">
        <form method="get" className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Input name="q" defaultValue={query} label="Nombre o email" placeholder="Buscar usuario" rootClassName="md:col-span-2" />
          <Select
            name="role"
            label="Rol"
            defaultValue={roleCode}
            placeholder="Todos"
            options={roles.map((role) => ({
              value: role.code,
              label: `${role.code} - ${role.name}`,
            }))}
          />
          <Select
            name="status"
            label="Estado"
            defaultValue={status}
            options={[
              { value: "all", label: "Todos" },
              { value: "active", label: "Activos" },
              { value: "inactive", label: "Inactivos" },
            ]}
          />
          <div className="md:col-span-4 flex justify-end gap-2">
            <Link href="/users" className={buttonStyles({ variant: "secondary" })}>
              Limpiar
            </Link>
            <button type="submit" className={buttonStyles()}>
              Filtrar
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Listado" description={`Página ${users.page} de ${users.totalPages}`}>
        <TableWrap striped>
          <Table>
            <thead>
              <tr>
                <Th>Nombre</Th>
                <Th>Email</Th>
                <Th>Roles</Th>
                <Th>Estado</Th>
                <Th>Creado</Th>
                <Th>Actualizado</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {users.items.map((user) => (
                <TableRow key={user.id}>
                  <Td className="font-semibold text-[var(--text-primary)]">{user.name}</Td>
                  <Td className="font-mono text-xs">{user.email}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {user.userRoles.map((entry) => (
                        <Badge key={entry.role.id} variant="accent">
                          {entry.role.code}
                        </Badge>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    <Badge variant={user.isActive ? "success" : "danger"}>{user.isActive ? "Activo" : "Inactivo"}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap">{new Date(user.createdAt).toLocaleString("es-MX")}</Td>
                  <Td className="whitespace-nowrap">{new Date(user.updatedAt).toLocaleString("es-MX")}</Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <Link href={`/users/${user.id}`} className={buttonStyles({ variant: "ghost", size: "sm" })}>
                        Ver
                      </Link>
                      <Link href={`/users/${user.id}/edit`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                        Editar
                      </Link>
                    </div>
                  </Td>
                </TableRow>
              ))}
              {users.items.length === 0 ? <TableEmptyRow colSpan={7}>No hay usuarios para los filtros seleccionados.</TableEmptyRow> : null}
            </tbody>
          </Table>
        </TableWrap>

        {users.totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between gap-2 text-sm">
            <Link
              href={buildHref(Math.max(1, users.page - 1))}
              className={buttonStyles({ variant: "secondary", size: "sm", className: users.page <= 1 ? "pointer-events-none opacity-50" : "" })}
            >
              Anterior
            </Link>
            <span className="text-[var(--text-muted)]">
              {users.page} / {users.totalPages}
            </span>
            <Link
              href={buildHref(Math.min(users.totalPages, users.page + 1))}
              className={buttonStyles({
                variant: "secondary",
                size: "sm",
                className: users.page >= users.totalPages ? "pointer-events-none opacity-50" : "",
              })}
            >
              Siguiente
            </Link>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
