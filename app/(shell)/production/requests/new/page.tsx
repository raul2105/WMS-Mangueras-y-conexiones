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
import { getProductSearchSelection, resolveProductInput } from "@/lib/product-search";
import { buildCommercialSearchHref } from "@/lib/commercial-toolkit";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const SOURCE_LABELS: Record<string, string> = {
  catalog: "Catálogo",
  availability: "Disponibilidad",
  equivalences: "Equivalencias",
};

function isNextRedirectError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT"),
  );
}

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return typeof value === "string" ? value.trim() : "";
}

function getSourceLabel(source: string) {
  return SOURCE_LABELS[source] ?? "Contexto comercial";
}

function buildHandoffParams(input: {
  selectedProduct?: { id: string; sku: string } | null;
  searchQuery?: string;
  source?: string;
  equivalentProductId?: string | null;
}) {
  const params: Record<string, string | undefined> = {
    productId: input.selectedProduct?.id,
    sku: input.selectedProduct?.sku,
    q: input.searchQuery || input.selectedProduct?.sku,
    source: input.source,
    equivalentProductId: input.equivalentProductId ?? undefined,
  };

  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => Boolean(value?.trim())),
  ) as Record<string, string | undefined>;
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
  searchParams: Promise<SearchParams>;
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

  const error = firstParam(sp.error);
  const productId = firstParam(sp.productId);
  const sku = firstParam(sp.sku);
  const searchQuery = firstParam(sp.q);
  const source = firstParam(sp.source);
  const equivalentProductId = firstParam(sp.equivalentProductId);
  const displayQuery = searchQuery || sku;

  const selectedProduct = productId
    ? await getProductSearchSelection(prisma, productId)
    : sku
      ? (await resolveProductInput(prisma, sku, { minScore: 1600 })).product
      : null;
  const originalProduct =
    equivalentProductId && equivalentProductId !== selectedProduct?.id
      ? await getProductSearchSelection(prisma, equivalentProductId)
      : null;
  const invalidProductContext = Boolean(productId && !selectedProduct);
  const sourceLabel = getSourceLabel(source);
  const requestContext = buildHandoffParams({
    selectedProduct,
    searchQuery: displayQuery,
    source,
    equivalentProductId: originalProduct?.id,
  });
  const catalogQuery = displayQuery || selectedProduct?.sku;
  const catalogHref = catalogQuery
    ? buildCommercialSearchHref("/catalog", catalogQuery)
    : "/catalog";
  const availabilityHref = catalogQuery
    ? buildCommercialSearchHref("/production/availability", catalogQuery, requestContext)
    : buildCommercialSearchHref("/production/availability", undefined, requestContext);
  const equivalencesHref = catalogQuery
    ? buildCommercialSearchHref("/production/equivalences", catalogQuery, requestContext)
    : buildCommercialSearchHref("/production/equivalences", undefined, requestContext);

  const hasCommercialContext = Boolean(
    selectedProduct || displayQuery || invalidProductContext || originalProduct,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nuevo pedido comercial"
        description="Captura primero al cliente, confirma almacén, fecha compromiso y notas. Si llegas desde catálogo, disponibilidad o equivalencias, el producto aparecerá arriba como contexto comercial."
        actions={
          <Link
            href="/production/requests"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:text-white"
          >
            ← Pedidos
          </Link>
        }
      />

      <form action={createSalesRequest} className="space-y-6">
        <SectionCard
          title="Captura comercial"
          description="Empieza por el cliente, agrega contexto de producto solo si existe y termina el pedido sin abrir otra pantalla."
        >
          <div className="space-y-5">
            {error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            {hasCommercialContext ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {selectedProduct ? "Producto de referencia" : "Contexto comercial"}
                  </p>
                  <Badge variant="accent">{sourceLabel}</Badge>
                </div>

                {invalidProductContext ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                    No encontramos el producto seleccionado. Puedes corregir la
                    selección o seguir con la captura manual sin perder el
                    pedido.
                  </div>
                ) : selectedProduct ? (
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.7fr)]">
                    <div className="space-y-2">
                      <p className="text-lg font-semibold text-white">
                        {selectedProduct.name}
                      </p>
                      <div className="grid gap-2 text-sm text-slate-200 sm:grid-cols-2">
                        <p>
                          <span className="text-slate-400">SKU:</span>{" "}
                          <span className="font-mono">{selectedProduct.sku}</span>
                        </p>
                        {selectedProduct.referenceCode ? (
                          <p>
                            <span className="text-slate-400">Referencia:</span>{" "}
                            <span className="font-mono">
                              {selectedProduct.referenceCode}
                            </span>
                          </p>
                        ) : null}
                        <p>
                          <span className="text-slate-400">Stock disponible:</span>{" "}
                          {selectedProduct.totalAvailable.toLocaleString("es-MX")}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-cyan-50">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
                        Siguiente acción
                      </p>
                      <p className="mt-2">
                        Confirma el cliente y continúa el pedido con esta
                        referencia comercial.
                      </p>
                    </div>
                  </div>
                ) : displayQuery ? (
                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-cyan-50">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
                      Contexto comercial
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      Búsqueda comercial: {displayQuery}
                    </p>
                    <p className="mt-2 text-sm text-slate-300">
                      No hay un producto resuelto todavía. La búsqueda se
                      mantiene como referencia para continuar el pedido manual.
                    </p>
                  </div>
                ) : null}

                {originalProduct ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Sustituye a
                    </p>
                    <p className="mt-1 font-semibold text-white">
                      {originalProduct.name}
                    </p>
                    <p className="font-mono text-xs text-slate-400">
                      {originalProduct.sku}
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Link
                    href="#captura-cliente"
                    className={buttonStyles({ size: "sm" })}
                  >
                    {selectedProduct
                      ? "Continuar con este producto"
                      : "Continuar con la captura"}
                  </Link>
                  <Link
                    href={catalogHref}
                    className={buttonStyles({ variant: "secondary", size: "sm" })}
                  >
                    Cambiar producto
                  </Link>
                  <Link
                    href="/production/requests/new"
                    className={buttonStyles({ variant: "secondary", size: "sm" })}
                  >
                    Quitar selección
                  </Link>
                </div>
              </div>
            ) : null}

            <section id="captura-cliente" className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-white">1. Cliente</h2>
                  <p className="text-sm text-slate-400">
                    Empieza por la cuenta comercial. Si no existe, usa el alta
                    rápida para continuar sin bloquear el pedido.
                  </p>
                </div>
                {canManageCustomers ? (
                  <Link
                    href="/sales/customers/new"
                    className={buttonStyles({ variant: "secondary", size: "sm" })}
                  >
                    Registrar cliente
                  </Link>
                ) : null}
              </div>
              {canViewCustomers ? (
                <CustomerSearchField
                  name="customerId"
                  label="Selecciona o crea el cliente"
                  required
                  allowQuickCreate={canManageCustomers}
                />
              ) : (
                <label className="space-y-1">
                  <span className="text-sm text-slate-400">
                    Cliente comercial
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
              {canViewCustomers && canManageCustomers ? (
                <p className="text-xs text-slate-400">
                  ¿No encuentras al cliente? Regístralo para continuar con el pedido.
                </p>
              ) : null}
            </section>

            {selectedProduct ? (
              <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      2. Contexto del producto
                    </h2>
                    <p className="text-sm text-slate-300">
                      El producto seleccionado acompaña la captura comercial y
                      sirve como referencia para continuar el pedido.
                    </p>
                  </div>
                  <Badge variant="accent">Referencia</Badge>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,1fr)]">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Producto seleccionado
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {selectedProduct.name}
                    </p>
                    <div className="mt-3 space-y-2 text-sm text-slate-300">
                      <p>
                        <span className="text-slate-400">SKU:</span>{" "}
                        <span className="font-mono">{selectedProduct.sku}</span>
                      </p>
                      <p>
                        <span className="text-slate-400">Fuente:</span>{" "}
                        {sourceLabel}
                      </p>
                      <p>
                        <span className="text-slate-400">Acción sugerida:</span>{" "}
                        Continúa con el cliente y el detalle del pedido.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="#captura-cliente"
                    className={buttonStyles({ size: "sm" })}
                  >
                    Continuar con este producto
                  </Link>
                  <Link
                    href={catalogHref}
                    className={buttonStyles({ variant: "secondary", size: "sm" })}
                  >
                    Cambiar producto
                  </Link>
                  <Link
                    href="/production/requests/new"
                    className={buttonStyles({ variant: "secondary", size: "sm" })}
                  >
                    Quitar selección
                  </Link>
                </div>
              </section>
            ) : null}

            <section className="space-y-3">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-white">
                  {selectedProduct ? "3. Datos del pedido" : "2. Datos del pedido"}
                </h2>
                <p className="text-sm text-slate-400">
                  Confirma almacén, fecha compromiso y notas del pedido.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm text-slate-400">Almacén</span>
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
                  <span className="text-sm text-slate-400">Fecha compromiso</span>
                  <input
                    name="dueDate"
                    type="date"
                    required
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
                  />
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="text-sm text-slate-400">Notas del pedido</span>
                  <textarea
                    name="notes"
                    className="min-h-[96px] w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
                    placeholder="Contexto comercial, prioridad o consideraciones del cliente"
                  />
                </label>
              </div>
            </section>

            <details className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-white">
                Herramientas de apoyo
              </summary>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={catalogHref}
                  className={buttonStyles({ variant: "secondary", size: "sm" })}
                >
                  Buscar en catálogo
                </Link>
                <Link
                  href={availabilityHref}
                  className={buttonStyles({ variant: "secondary", size: "sm" })}
                >
                  Ver disponibilidad
                </Link>
                <Link
                  href={equivalencesHref}
                  className={buttonStyles({ variant: "secondary", size: "sm" })}
                >
                  Revisar equivalencias
                </Link>
              </div>
            </details>

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
          </div>
        </SectionCard>
      </form>
    </div>
  );
}
