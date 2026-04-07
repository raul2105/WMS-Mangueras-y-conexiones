import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { pageGuard } from "@/components/rbac/PageGuard";
import { PageHeader } from "@/components/ui/page-header";
import { createSalesRequestDraftHeader } from "@/lib/sales/request-service";
import { requireSalesWriteAccess } from "@/lib/rbac/sales";
import { firstErrorMessage, parseDueDate, salesInternalOrderCreateSchema } from "@/lib/schemas/wms";

export const dynamic = "force-dynamic";

function isNextRedirectError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT"),
  );
}

async function createSalesRequest(formData: FormData) {
  "use server";
  await requireSalesWriteAccess();

  const session = await auth();
  const customerName = String(formData.get("customerName") ?? "").trim();
  const warehouseId = String(formData.get("warehouseId") ?? "").trim();
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const parsed = salesInternalOrderCreateSchema.safeParse({
    customerName,
    warehouseId,
    dueDateRaw,
    notes: notes || undefined,
  });
  if (!parsed.success) {
    redirect(`/production/requests/new?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  const dueDate = parseDueDate(dueDateRaw);
  if (!dueDate) {
    redirect(`/production/requests/new?error=${encodeURIComponent("Fecha compromiso inválida")}`);
  }

  try {
    const created = await createSalesRequestDraftHeader(prisma, {
      customerName,
      warehouseId,
      dueDate,
      notes: notes || null,
      requestedByUserId: session?.user?.id ?? null,
    });
    redirect(`/production/requests/${created.id}?ok=${encodeURIComponent("Pedido de surtido creado")}`);
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "No se pudo crear el pedido";
    redirect(`/production/requests/new?error=${encodeURIComponent(message)}`);
  }
}

export default async function NewProductionRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await pageGuard("sales.view");
  const sp = await searchParams;

  const [warehouses, recentCustomers] = await Promise.all([
    prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.salesInternalOrder.findMany({
      where: { customerName: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { customerName: true },
    }),
  ]);

  const customerSuggestions = Array.from(new Set(recentCustomers.map((row) => row.customerName?.trim() ?? "").filter(Boolean)));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nuevo pedido de surtido"
        description="Primero registra el encabezado del pedido. Las líneas de productos y ensambles configurados se agregan después."
        actions={
          <Link href="/production/requests" className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:text-white">
            ← Pedidos
          </Link>
        }
      />

      {sp.error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{sp.error}</div>
      ) : null}

      <form action={createSalesRequest} className="space-y-6">
        <section className="glass-card grid gap-4 md:grid-cols-2">
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Cliente</span>
            <input
              name="customerName"
              list={customerSuggestions.length > 0 ? "request-customer-options" : undefined}
              required
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
              placeholder="Cliente / cuenta"
            />
            {customerSuggestions.length > 0 ? (
              <datalist id="request-customer-options">
                {customerSuggestions.map((customer) => (
                  <option key={customer} value={customer} />
                ))}
              </datalist>
            ) : null}
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Almacén</span>
            <select name="warehouseId" required className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white">
              <option value="">Selecciona un almacén</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.code} - {warehouse.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">Fecha compromiso</span>
            <input name="dueDate" type="date" required className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white" />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Notas del pedido</span>
            <textarea
              name="notes"
              className="min-h-[96px] w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
              placeholder="Contexto comercial, prioridad o consideraciones del cliente"
            />
          </label>
        </section>

        <section className="glass-card space-y-3">
          <h2 className="text-lg font-semibold text-white">Siguiente paso</h2>
          <p className="text-sm text-slate-400">
            Después de guardar el encabezado podrás:
          </p>
          <ul className="space-y-2 text-sm text-slate-300">
            <li>Agregar productos independientes con reserva y surtido directo a staging.</li>
            <li>Agregar ensambles configurados sin depender de un SKU de ensamble predefinido.</li>
            <li>Dar seguimiento al surtido directo y a las órdenes exactas ligadas desde un solo pedido.</li>
          </ul>
        </section>

        <div className="flex justify-end gap-3">
          <Link href="/production/requests" className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:text-white">
            Cancelar
          </Link>
          <button type="submit" className="btn-primary">Crear pedido</button>
        </div>
      </form>
    </div>
  );
}
