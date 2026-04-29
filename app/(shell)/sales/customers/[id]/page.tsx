import Link from "next/link";
import { notFound } from "next/navigation";
import type { SalesInternalOrderStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { pageGuard } from "@/components/rbac/PageGuard";
import { getSessionContext } from "@/lib/auth/session-context";
import { SALES_INTERNAL_ORDER_STATUS_LABELS, SALES_INTERNAL_ORDER_STATUS_STYLES } from "@/lib/sales/internal-orders";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await pageGuard("customers.view");
  const [{ id }, sp, sessionCtx] = await Promise.all([params, searchParams, getSessionContext()]);
  const canManageCustomers = sessionCtx.isSystemAdmin || sessionCtx.permissions.includes("customers.manage");
  type LinkedOrderRow = {
    id: string;
    code: string;
    status: SalesInternalOrderStatus;
    dueDate: Date | null;
    createdAt: Date;
    warehouse: { code: string; name: string } | null;
  };

  const [customer, linkedOrders] = await Promise.all([
    (prisma as any).customer.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        legalName: true,
        businessName: true,
        taxId: true,
        email: true,
        phone: true,
        address: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    (prisma as any).salesInternalOrder.findMany({
      where: { customerId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        code: true,
        status: true,
        dueDate: true,
        createdAt: true,
        warehouse: { select: { code: true, name: true } },
      },
    }),
  ]) as [any, LinkedOrderRow[]];

  if (!customer) notFound();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/sales/customers" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
            ← Clientes
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">{customer.businessName ?? customer.name}</h1>
            {customer.legalName && customer.legalName !== (customer.businessName ?? customer.name) ? (
              <p className="text-sm text-slate-400">{customer.legalName}</p>
            ) : null}
            <p className="text-xs text-slate-400 font-mono">{customer.code}</p>
          </div>
        </div>
        {canManageCustomers ? (
          <Link href={`/sales/customers/${customer.id}/edit`} className="btn-primary">
            Editar
          </Link>
        ) : null}
      </div>

      {sp.ok ? <div className="glass-card border border-green-500/30 text-green-200 text-sm">{sp.ok}</div> : null}
      {sp.error ? <div className="glass-card border border-red-500/30 text-red-200 text-sm">{sp.error}</div> : null}

      <div className="glass-card grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-xs text-slate-400">Nombre</p>
          <p className="text-slate-200">{customer.name}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">RFC</p>
          <p className="text-slate-200">{customer.taxId ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Email</p>
          <p className="text-slate-200">{customer.email ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Teléfono</p>
          <p className="text-slate-200">{customer.phone ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Razón social</p>
          <p className="text-slate-200">{customer.legalName ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Nombre comercial</p>
          <p className="text-slate-200">{customer.businessName ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Estado</p>
          <p className={customer.isActive ? "text-emerald-300" : "text-red-300"}>{customer.isActive ? "Activo" : "Inactivo"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Última actualización</p>
          <p className="text-slate-200">{new Date(customer.updatedAt).toLocaleString("es-MX")}</p>
        </div>
        {customer.address ? (
          <div className="col-span-full">
            <p className="text-xs text-slate-400">Dirección</p>
            <p className="text-slate-200">{customer.address}</p>
          </div>
        ) : null}
      </div>

      <div className="glass-card space-y-4">
        <h2 className="text-lg font-bold border-b border-white/10 pb-2">
          Pedidos ligados recientes
          <span className="text-sm text-slate-400 font-normal ml-2">({linkedOrders.length})</span>
        </h2>

        {linkedOrders.length === 0 ? (
          <p className="text-slate-500 text-sm">No hay pedidos ligados a este cliente.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-white/10">
                  <th className="text-left py-2">Código</th>
                  <th className="text-left py-2">Estado</th>
                  <th className="text-left py-2">Almacén</th>
                  <th className="text-left py-2">Fecha compromiso</th>
                  <th className="text-left py-2">Creado</th>
                </tr>
              </thead>
              <tbody>
                {linkedOrders.map((order) => (
                  <tr key={order.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2">
                      <Link href={`/production/requests/${order.id}`} className="font-mono text-cyan-300 hover:text-white">
                        {order.code}
                      </Link>
                    </td>
                    <td className="py-2">
                      <span className={`rounded px-2 py-1 text-xs font-semibold ${SALES_INTERNAL_ORDER_STATUS_STYLES[order.status]}`}>
                        {SALES_INTERNAL_ORDER_STATUS_LABELS[order.status]}
                      </span>
                    </td>
                    <td className="py-2 text-slate-300">{order.warehouse ? `${order.warehouse.code} - ${order.warehouse.name}` : "—"}</td>
                    <td className="py-2 text-slate-400">{order.dueDate ? new Date(order.dueDate).toLocaleDateString("es-MX") : "—"}</td>
                    <td className="py-2 text-slate-400">{new Date(order.createdAt).toLocaleDateString("es-MX")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
