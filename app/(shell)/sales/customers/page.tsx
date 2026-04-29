/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import prisma from "@/lib/prisma";
import { pageGuard } from "@/components/rbac/PageGuard";
import { getSessionContext } from "@/lib/auth/session-context";
import { searchCustomers } from "@/lib/customers/customer-service";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

type SearchParams = {
  page?: string;
  name?: string;
  taxId?: string;
  status?: string;
  ok?: string;
  error?: string;
};

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeStatus(value: string | undefined): "all" | "active" | "inactive" {
  if (value === "active" || value === "inactive") return value;
  return "all";
}

function buildHref(filters: { name: string; taxId: string; status: "all" | "active" | "inactive"; page: number }) {
  const params = new URLSearchParams();
  if (filters.name) params.set("name", filters.name);
  if (filters.taxId) params.set("taxId", filters.taxId);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `/sales/customers?${query}` : "/sales/customers";
}

export default async function SalesCustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await pageGuard("customers.view");
  const [sp, sessionCtx] = await Promise.all([searchParams, getSessionContext()]);
  const page = parsePage(sp.page);
  const nameFilter = String(sp.name ?? "").trim();
  const taxIdFilter = String(sp.taxId ?? "").trim();
  const statusFilter = normalizeStatus(sp.status);
  const canManageCustomers = sessionCtx.isSystemAdmin || sessionCtx.permissions.includes("customers.manage");

  const isActiveFilter = statusFilter === "all" ? "all" : statusFilter === "active";
  const [customerSearch, totalCustomers, activeCustomers] = await Promise.all([
    searchCustomers(prisma as never, {
      page,
      pageSize: PAGE_SIZE,
      name: nameFilter || undefined,
      taxId: taxIdFilter || undefined,
      isActive: isActiveFilter,
    }),
    (prisma as any).customer.count(),
    (prisma as any).customer.count({ where: { isActive: true } }),
  ]);

  const customerIds = customerSearch.items.map((customer) => customer.id);
  const orderGroups: Array<{ customerId: string | null; _count: { _all: number } }> =
    customerIds.length > 0
      ? await (prisma as any).salesInternalOrder.groupBy({
          by: ["customerId"],
          where: { customerId: { in: customerIds } },
          _count: { _all: true },
        })
      : [];
  const orderCountByCustomerId = new Map(
    orderGroups.filter((row) => Boolean(row.customerId)).map((row) => [String(row.customerId), row._count._all])
  );

  const totalPages = Math.max(1, Math.ceil(customerSearch.total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            Clientes
          </h1>
          <p className="text-slate-400 mt-1">Catálogo comercial y administrativo de clientes.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/sales" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
            ← Ventas
          </Link>
          {canManageCustomers ? (
            <Link href="/sales/customers/new" className="btn-primary">
              + Nuevo cliente
            </Link>
          ) : null}
        </div>
      </div>

      {sp.ok ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{sp.ok}</div>
      ) : null}
      {sp.error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{sp.error}</div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="glass-card text-center">
          <p className="text-3xl font-bold text-cyan-400">{totalCustomers}</p>
          <p className="text-sm text-slate-400 mt-1">Total clientes</p>
        </div>
        <div className="glass-card text-center">
          <p className="text-3xl font-bold text-emerald-400">{activeCustomers}</p>
          <p className="text-sm text-slate-400 mt-1">Activos</p>
        </div>
        <div className="glass-card text-center">
          <p className="text-3xl font-bold text-slate-400">{Math.max(0, totalCustomers - activeCustomers)}</p>
          <p className="text-sm text-slate-400 mt-1">Inactivos</p>
        </div>
      </div>

      <form method="get" className="glass-card flex flex-col gap-3 md:flex-row md:items-end">
        <label className="flex-1 space-y-1">
          <span className="text-sm text-slate-400">Nombre</span>
          <input
            type="text"
            name="name"
            defaultValue={nameFilter}
            placeholder="Nombre del cliente"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white"
          />
        </label>
        <label className="flex-1 space-y-1">
          <span className="text-sm text-slate-400">RFC</span>
          <input
            type="text"
            name="taxId"
            defaultValue={taxIdFilter}
            placeholder="RFC / taxId"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white"
          />
        </label>
        <label className="w-full md:w-48 space-y-1">
          <span className="text-sm text-slate-400">Estado</span>
          <select
            name="status"
            defaultValue={statusFilter}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white"
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </label>
        <div className="flex gap-2">
          <button type="submit" className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-200 hover:text-white">
            Filtrar
          </button>
          <Link href="/sales/customers" className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:text-white">
            Limpiar
          </Link>
        </div>
      </form>

      {customerSearch.total === 0 ? (
        <div className="glass-card text-center py-12">
          <p className="text-slate-500 mb-4">No hay clientes para el filtro seleccionado.</p>
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/10">
                <th className="text-left py-3">Código</th>
                <th className="text-left py-3">Nombre</th>
                <th className="text-left py-3">RFC</th>
                <th className="text-left py-3">Email</th>
                <th className="text-right py-3">Pedidos</th>
                <th className="text-center py-3">Estado</th>
                <th className="text-right py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {customerSearch.items.map((customer) => (
                <tr key={customer.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-3 font-mono text-cyan-400 text-xs">{customer.code}</td>
                  <td className="py-3 font-medium text-white">{customer.name}</td>
                  <td className="py-3 text-slate-400">{customer.taxId ?? "—"}</td>
                  <td className="py-3 text-slate-400 text-xs">{customer.email ?? "—"}</td>
                  <td className="py-3 text-right text-slate-300">{orderCountByCustomerId.get(customer.id) ?? 0}</td>
                  <td className="py-3 text-center">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded ${
                        customer.isActive ? "text-emerald-400 bg-emerald-500/20" : "text-red-400 bg-red-500/20"
                      }`}
                    >
                      {customer.isActive ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/sales/customers/${customer.id}`}
                        className="text-xs rounded border border-white/10 px-2 py-1 text-slate-300 hover:text-white"
                      >
                        Ver
                      </Link>
                      {canManageCustomers ? (
                        <Link
                          href={`/sales/customers/${customer.id}/edit`}
                          className="text-xs rounded border border-white/10 px-2 py-1 text-slate-300 hover:text-white"
                        >
                          Editar
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <Link
            href={buildHref({ name: nameFilter, taxId: taxIdFilter, status: statusFilter, page: Math.max(1, safePage - 1) })}
            className={`px-4 py-2 glass rounded-lg ${
              safePage <= 1 ? "pointer-events-none opacity-40" : "text-slate-300 hover:text-white"
            }`}
          >
            ← Anterior
          </Link>
          <span className="text-slate-500">
            Página {safePage} de {totalPages}
          </span>
          <Link
            href={buildHref({ name: nameFilter, taxId: taxIdFilter, status: statusFilter, page: Math.min(totalPages, safePage + 1) })}
            className={`px-4 py-2 glass rounded-lg ${
              safePage >= totalPages ? "pointer-events-none opacity-40" : "text-slate-300 hover:text-white"
            }`}
          >
            Siguiente →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
