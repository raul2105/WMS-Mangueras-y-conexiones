import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getSessionContext } from "@/lib/auth/session-context";
import { pageGuard } from "@/components/rbac/PageGuard";
import { PageHeader } from "@/components/ui/page-header";
import {
  firstErrorMessage,
  parseDueDate,
  salesInternalOrderCreateSchema,
} from "@/lib/schemas/wms";
import { startPerf } from "@/lib/perf";
import { getProductSearchSelection, resolveProductInput } from "@/lib/product-search";
import { buildCommercialSearchHref } from "@/lib/commercial-toolkit";
import { createSalesRequestDraftHeader } from "@/lib/sales/request-service";
import { requireSalesWriteAccess } from "@/lib/rbac/sales";
import { OrderSummary } from "@/components/OrderSummary";
import { NewOrderForm } from "@/components/NewOrderForm";
import { 
  buildCommercialPromiseFromSearchParams,
  computePromiseStatus,
} from "@/lib/sales/availability-promise";

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

function parsePositiveDecimal(value: string) {
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
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
  const lineProductId = String(formData.get("lineProductId") ?? "").trim();
  const lineRequestedQtyRaw = String(formData.get("lineRequestedQty") ?? "").trim();
  const lineNotes = String(formData.get("lineNotes") ?? "").trim();

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

  let initialProductLine:
    | { productId: string; requestedQty: number; notes?: string | null }
    | null = null;
  if (lineProductId) {
    const lineProduct = await getProductSearchSelection(prisma, lineProductId);
    if (lineProduct) {
      const requestedQty = lineRequestedQtyRaw
        ? parsePositiveDecimal(lineRequestedQtyRaw)
        : 1;
      if (!requestedQty) {
        redirect(
          `/production/requests/new?error=${encodeURIComponent("La cantidad de la línea debe ser mayor que cero")}`,
        );
      }

      initialProductLine = {
        productId: lineProduct.id,
        requestedQty,
        notes: lineNotes || null,
      };
    }
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
      initialProductLine,
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
  const [sp, sessionCtx] = await Promise.all([searchParams, getSessionContext()]);
  const canViewCustomers =
    sessionCtx.isSystemAdmin || sessionCtx.permissions.includes("customers.view");
  const canManageCustomers =
    sessionCtx.isSystemAdmin || sessionCtx.permissions.includes("customers.manage");

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
  const quantity = parsePositiveDecimal(firstParam(sp.quantity)) ?? 1;
  const lineNotes = firstParam(sp.notes);
  const displayQuery = searchQuery || sku;

  // Parse commercial availability promise from search params - KAN-128
  const searchParamsForPromise = new URLSearchParams();
  Object.entries(sp).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(v => searchParamsForPromise.append(key, v));
    } else if (value) {
      searchParamsForPromise.set(key, value);
    }
  });
  const commercialPromise = buildCommercialPromiseFromSearchParams(searchParamsForPromise);

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

  // Convert to display format for OrderSummary
  const commercialPromiseDisplay = commercialPromise ? {
    status: computePromiseStatus(commercialPromise, { requestedQuantity: quantity }),
    warehouseCode: commercialPromise.warehouseCode,
    warehouseName: commercialPromise.warehouseName,
    availableQuantity: commercialPromise.availableQuantity,
    checkedAt: commercialPromise.checkedAt,
    isSubstitute: commercialPromise.isSubstitute,
    originalProductName: originalProduct?.name,
    originalProductSku: originalProduct?.sku,
  } : null;

  // Pass commercialPromiseDisplay to OrderSummary

  // Determine readiness state and missing fields
  const missingFields: string[] = [];

  if (canViewCustomers && !firstParam(sp.customerId)) {
    missingFields.push("customerId");
  } else if (!canViewCustomers && !firstParam(sp.customerName)) {
    missingFields.push("customerName");
  }

  if (!firstParam(sp.warehouseId)) {
    missingFields.push("warehouseId");
  }

  const dueDateRaw = firstParam(sp.dueDate);
  if (!dueDateRaw) {
    missingFields.push("dueDate");
  } else if (!parseDueDate(dueDateRaw)) {
    missingFields.push("dueDate");
  }

  // Has product context if selectedProduct or hasCommercialContext
  const hasProductContext = Boolean(selectedProduct || (hasCommercialContext && !invalidProductContext));

  // Determine readiness state
  let readinessState: "not_ready" | "missing_required" | "ready" = "not_ready";
  if (missingFields.length === 0 && hasProductContext) {
    readinessState = "ready";
  } else if (missingFields.length > 0) {
    readinessState = "missing_required";
  }

  return (
    <>
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

      <div className="grid gap-6 lg:grid-cols-[1fr_384px]">
        {/* Main form column */}
        <div className="space-y-6">
          <NewOrderForm
            initialCustomerId={firstParam(sp.customerId) || undefined}
            initialCustomerName={firstParam(sp.customerName) || undefined}
            initialWarehouseId={firstParam(sp.warehouseId) || undefined}
            initialDueDate={firstParam(sp.dueDate) || undefined}
            initialQuantity={quantity}
            initialLineNotes={lineNotes}
            warehouses={warehouses}
            selectedProduct={selectedProduct}
            originalProduct={originalProduct}
            hasCommercialContext={hasCommercialContext}
            displayQuery={displayQuery}
            sourceLabel={sourceLabel}
            invalidProductContext={invalidProductContext}
            catalogHref={catalogHref}
            availabilityHref={availabilityHref}
            equivalencesHref={equivalencesHref}
            canViewCustomers={canViewCustomers}
            canManageCustomers={canManageCustomers}
            error={error}
          />
        </div>

        {/* Order Summary Sidebar */}
        <OrderSummary
          customerName={canViewCustomers ? undefined : firstParam(sp.customerName)}
          customerId={canViewCustomers ? firstParam(sp.customerId) : undefined}
          warehouseCode={warehouses.find((w) => w.id === firstParam(sp.warehouseId))?.code ?? null}
          warehouseName={warehouses.find((w) => w.id === firstParam(sp.warehouseId))?.name ?? null}
          dueDate={firstParam(sp.dueDate)}
          selectedProduct={selectedProduct}
          sourceLabel={sourceLabel}
          equivalentProduct={originalProduct}
          quantity={selectedProduct ? quantity : undefined}
          lineNotes={lineNotes}
          readinessState={readinessState}
          missingFields={missingFields}
          hasCommercialContext={hasCommercialContext}
          displayQuery={displayQuery}
          commercialPromise={commercialPromise ? {
            status: computePromiseStatus(commercialPromise, { requestedQuantity: quantity }),
            warehouseCode: commercialPromise.warehouseCode,
            warehouseName: commercialPromise.warehouseName,
            availableQuantity: commercialPromise.availableQuantity,
            checkedAt: commercialPromise.checkedAt,
            isSubstitute: commercialPromise.isSubstitute,
            originalProductName: originalProduct?.name,
            originalProductSku: originalProduct?.sku,
          } : null}
        />
      </div>
    </>
  );
}
