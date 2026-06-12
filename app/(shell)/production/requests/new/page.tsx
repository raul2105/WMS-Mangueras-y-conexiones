import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getSessionContext } from "@/lib/auth/session-context";
import { pageGuard } from "@/components/rbac/PageGuard";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import CustomerSearchField from "@/components/CustomerSearchField";
import { SectionCard } from "@/components/ui/section-card";
import { buttonStyles } from "@/components/ui/button";
import { createSalesRequestDraftHeader } from "@/lib/sales/request-service";
import { requireSalesWriteAccess } from "@/lib/rbac/sales";
import {
  firstErrorMessage,
  parseDueDate,
  salesInternalOrderCreateSchema,
} from "@/lib/schemas/wms";
import { startPerf } from "@/lib/perf";

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
  const perf = startPerf("action.production.requests.new.create");
  const rbacPerf = startPerf("action.production.requests.new.create.rbac");
  await requireSalesWriteAccess();
  rbacPerf.end();

  const sessionPerf = startPerf(
    "action.production.requests.new.create.session",
  );
  const ctx = await getSessionContext();
  sessionPerf.end();
  const canViewCustomers =
    ctx.isSystemAdmin || ctx.permissions.includes("customers.view");
  const customerId = String(formData.get("customerId") ?? "").trim() || null;
  const customerName = String(formData.get("customerName") ?? "").trim();
  const warehouseId = String(formData.get("warehouseId") ?? "").trim();
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const parsed = salesInternalOrderCreateSchema.safeParse({
    customerId: customerId ?? undefined,
    customerName: customerName || undefined,
    warehouseId,
    dueDateRaw,
    notes: notes || undefined,
  });
  if (!parsed.success) {
    redirect(
      `/production/requests/new?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`,
    );
  }

  if (canViewCustomers && !customerId) {
    redirect(
      `/production/requests/new?error=${encodeURIComponent("Selecciona un cliente del catálogo")}`,
    );
  }

  if (!canViewCustomers && !customerName) {
    redirect(
      `/production/requests/new?error=${encodeURIComponent("Cliente es obligatorio")}`,
    );
  }

  const dueDate = parseDueDate(dueDateRaw);
  if (!dueDate) {
    redirect(
      `/production/requests/new?error=${encodeURIComponent("Fecha compromiso inválida")}`,
    );
  }

  try {
    const createPerf = startPerf(
      "action.production.requests.new.create.service",
    );
    const created = await createSalesRequestDraftHeader(prisma, {
      customerId: canViewCustomers ? customerId : null,
      customerName: canViewCustomers ? null : customerName,
      requireFormalCustomer: canViewCustomers,
      warehouseId,
      dueDate,
      notes: notes || null,
      requestedByUserId: ctx.user?.id ?? null,
      requestedByRoles: ctx.roles,
    });
    createPerf.end({ orderId: created.id });

    const persistedOrder = await prisma.salesInternalOrder.findUnique({
      where: { id: created.id },
      select: { customerName: true },
    });

    const syncPerf = startPerf(
      "action.production.requests.new.create.sync_event",
    );
    const { emitSyncEventSafe } = await import("@/lib/sync/sync-events");
    await emitSyncEventSafe({
      entityType: "ORDER",
      entityId: created.id,
      action: "CREATE",
      payload: {
        orderId: created.id,
        code: created.code,
        customerId: canViewCustomers ? customerId : null,
        customerName: persistedOrder?.customerName ?? null,
        warehouseId,
        status: "BORRADOR",
      },
    });
    syncPerf.end();
    perf.end({ orderId: created.id, ok: true });

    redirect(
      `/production/requests/${created.id}?ok=${encodeURIComponent("Pedido de surtido creado")}`,
    );
  } catch (error) {
    perf.end({ ok: false });
    if (isNextRedirectError(error)) throw error;
    const message =
      error instanceof Error ? error.message : "No se pudo crear el pedido";
    redirect(`/production/requests/new?error=${encodeURIComponent(message)}`);
  }
}

export default async function NewProductionRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await pageGuard("sales.view");
  const [sp, ctx] = await Promise.all([searchParams, getSessionContext()]);
  const canViewCustomers =
    ctx.isSystemAdmin || ctx.permissions.includes("customers.view");
  const canManageCustomers =
    ctx.isSystemAdmin || ctx.permissions.includes("customers.manage");

  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nuevo pedido comercial"
        description="Captura primero al cliente, luego confirma almacén, fecha compromiso y notas. Las líneas se agregan después."
        actions={
          <Link
            href="/production/requests"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:text-white"
          >
            ← Pedidos
          </Link>
        }
      />

      <SectionCard
        title="Herramientas de apoyo"
        description="Abre catálogo, disponibilidad o equivalencias sin salir del flujo de captura."
      >
        <div className="flex flex-wrap gap-2">
          <Link href="/catalog" className={buttonStyles({ variant: "secondary", size: "sm" })}>
            Buscar en catálogo
          </Link>
          <Link href="/production/availability" className={buttonStyles({ variant: "secondary", size: "sm" })}>
            Ver disponibilidad
          </Link>
          <Link href="/production/equivalences" className={buttonStyles({ variant: "secondary", size: "sm" })}>
            Revisar equivalencias
          </Link>
        </div>
      </SectionCard>

      <section className="glass-card space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Captura guiada</p>
            <p className="text-sm text-slate-400">
              Sigue este orden para crear el pedido sin perder contexto
              comercial.
            </p>
          </div>
          <Badge variant="accent">Paso 1 de 3</Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              step: "1",
              title: "Selecciona o crea el cliente",
              description:
                "Busca en el catálogo o usa el alta rápida si hace falta.",
            },
            {
              step: "2",
              title: "Confirma almacén y fecha",
              description:
                "Define desde dónde surtir y para cuándo se promete.",
            },
            {
              step: "3",
              title: "Agrega líneas o continúa",
              description:
                "Guarda el encabezado y completa productos o ensambles después.",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="rounded-xl border border-white/10 bg-white/5 p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Paso {item.step}
              </p>
              <p className="mt-2 text-sm font-semibold text-white">
                {item.title}
              </p>
              <p className="mt-1 text-sm text-slate-400">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {sp.error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {sp.error}
        </div>
      ) : null}

      <form action={createSalesRequest} className="space-y-6">
        <section className="glass-card grid gap-4 md:grid-cols-2">
          {canViewCustomers ? (
            <div className="md:col-span-2">
              <CustomerSearchField
                name="customerId"
                label="1. Selecciona o crea el cliente"
                required
                allowQuickCreate={canManageCustomers}
              />
              <p className="mt-2 text-xs text-slate-400">
                Empieza por la cuenta comercial. Si no existe, usa el alta
                rápida para continuar sin bloquear el pedido.
              </p>
            </div>
          ) : (
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm text-slate-400">
                1. Cliente comercial
              </span>
              <input
                name="customerName"
                required
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
                placeholder="Cliente, cuenta o razón social"
              />
              <p className="text-xs text-slate-500">
                No tienes acceso al catálogo de clientes. Captura el nombre
                comercial para continuar con el pedido.
              </p>
            </label>
          )}

          <label className="space-y-1">
            <span className="text-sm text-slate-400">2. Almacén</span>
            <select
              name="warehouseId"
              required
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
            >
              <option value="">Selecciona un almacén</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.code} - {warehouse.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm text-slate-400">2. Fecha compromiso</span>
            <input
              name="dueDate"
              type="date"
              required
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">2. Notas del pedido</span>
            <textarea
              name="notes"
              className="min-h-[96px] w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
              placeholder="Contexto comercial, prioridad o consideraciones del cliente"
            />
          </label>
        </section>

        <section className="glass-card space-y-3">
          <h2 className="text-lg font-semibold text-white">
            3. Completa el pedido
          </h2>
          <p className="text-sm text-slate-400">
            Después de guardar el encabezado podrás:
          </p>
          <ul className="space-y-2 text-sm text-slate-300">
            <li>
              Agregar productos independientes con reserva y surtido directo a
              staging.
            </li>
            <li>
              Agregar ensambles configurados sin depender de un SKU de ensamble
              predefinido.
            </li>
            <li>
              Dar seguimiento al surtido directo y a las órdenes exactas ligadas
              desde un solo pedido.
            </li>
          </ul>
        </section>

        <div className="flex justify-end gap-3">
          <Link
            href="/production/requests"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:text-white"
          >
            Cancelar
          </Link>
          <button type="submit" className="btn-primary">
            Crear pedido
          </button>
        </div>
      </form>
    </div>
  );
}
