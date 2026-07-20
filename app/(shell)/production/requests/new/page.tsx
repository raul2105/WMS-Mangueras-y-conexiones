import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getSessionContext } from "@/lib/auth/session-context";
import { pageGuard } from "@/components/rbac/PageGuard";
import { PageHeader } from "@/components/ui/page-header";
import {
  firstErrorMessage,
  parseDueDate,
  salesInternalOrderAssemblyCreateSchema,
  salesInternalOrderCreateSchema,
  salesInternalOrderLinesCreateSchema,
} from "@/lib/schemas/wms";
import { startPerf } from "@/lib/perf";
import { getProductSearchSelection, resolveProductInput } from "@/lib/product-search";
import { buildCommercialSearchHref } from "@/lib/commercial-toolkit";
import { createSalesRequestDraftHeader, createSalesRequestWithAssembly, createSalesRequestWithLines } from "@/lib/sales/request-service";
import {
  buildCommercialPromiseFromSearchParams,
  computePromiseStatus,
  getCommercialPromiseStaleThresholdMinutes,
  parseCommercialPromise,
} from "@/lib/sales/availability-promise";
import { checkCurrentAvailability, validateCommercialPromise } from "@/lib/sales/availability-validator";
import { createAuditLogSafeWithDb } from "@/lib/audit-log";
import { requireSalesWriteAccess } from "@/lib/rbac/sales";
import { NewOrderForm } from "@/components/NewOrderForm";

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

function parseOrderLines(value: string) {
  if (!value) return null;
  try {
    return salesInternalOrderLinesCreateSchema.safeParse(JSON.parse(value));
  } catch {
    return { success: false as const, error: null };
  }
}

function parsePostedCommercialPromise(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return parseCommercialPromise(JSON.parse(value));
  } catch {
    return null;
  }
}

function buildSearchParams(searchParams: SearchParams) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    const normalized = firstParam(value);
    if (normalized) params.set(key, normalized);
  }
  return params;
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
  const lineKind = String(formData.get("lineKind") ?? "").trim();
  const orderLinesInput = parseOrderLines(String(formData.get("orderLines") ?? ""));
  const lineProductId = String(formData.get("lineProductId") ?? "").trim();
  const lineRequestedQtyRaw = String(formData.get("lineRequestedQty") ?? "").trim();
  const lineNotes = String(formData.get("lineNotes") ?? "").trim();
  const submittedPromiseValue = formData.get("commercialPromise");

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

  if (orderLinesInput && !orderLinesInput.success) {
    const message = orderLinesInput.error
      ? firstErrorMessage(orderLinesInput.error)
      : "Las líneas del pedido no tienen un formato válido";
    redirect(`/production/requests/new?error=${encodeURIComponent(message)}`);
  }

  let initialProductLine:
    | { productId: string; requestedQty: number; notes?: string | null }
    | null = null;
  if (lineKind === "PRODUCT" && lineProductId) {
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

  if (!orderLinesInput?.success && lineKind !== "PRODUCT" && lineKind !== "ASSEMBLY") {
    redirect(`/production/requests/new?error=${encodeURIComponent("Elige producto directo o ensamble")}`);
  }

  if (!orderLinesInput?.success && lineKind === "PRODUCT" && !initialProductLine) {
    redirect(`/production/requests/new?error=${encodeURIComponent("Selecciona un producto para crear el pedido")}`);
  }

  const assemblyInput = !orderLinesInput?.success && lineKind === "ASSEMBLY"
    ? salesInternalOrderAssemblyCreateSchema.safeParse({
        warehouseId,
        entryFittingProductId: String(formData.get("entryFittingProductId") ?? "").trim(),
        hoseProductId: String(formData.get("hoseProductId") ?? "").trim(),
        exitFittingProductId: String(formData.get("exitFittingProductId") ?? "").trim(),
        hoseLengthRaw: String(formData.get("hoseLength") ?? "").trim(),
        assemblyQuantityRaw: String(formData.get("assemblyQuantity") ?? "").trim(),
        sourceDocumentRef: String(formData.get("sourceDocumentRef") ?? "").trim() || undefined,
        notes: String(formData.get("assemblyNotes") ?? "").trim() || undefined,
      })
    : null;

  if (assemblyInput && !assemblyInput.success) {
    redirect(`/production/requests/new?error=${encodeURIComponent(firstErrorMessage(assemblyInput.error))}`);
  }

  const commercialPromise = parsePostedCommercialPromise(submittedPromiseValue);
  if (typeof submittedPromiseValue === "string" && submittedPromiseValue.trim() && !commercialPromise) {
    redirect(`/production/requests/new?error=${encodeURIComponent("La verificación de disponibilidad no es válida. Vuelve a consultar existencias.")}`);
  }

  let promiseAudit: Record<string, unknown> | null = null;
  if (commercialPromise && orderLinesInput?.success) {
    const promisedQty = orderLinesInput.data
      .filter((line): line is Extract<(typeof orderLinesInput.data)[number], { kind: "PRODUCT" }> => line.kind === "PRODUCT")
      .filter((line) => line.productId === commercialPromise.productId)
      .reduce((total, line) => total + line.requestedQty, 0);

    if (commercialPromise.warehouseId !== warehouseId || promisedQty <= 0) {
      redirect(`/production/requests/new?error=${encodeURIComponent("La verificación no corresponde al almacén o producto del pedido. Vuelve a consultar existencias.")}`);
    }

    const staleThresholdMinutes = getCommercialPromiseStaleThresholdMinutes();
    const validation = await validateCommercialPromise(prisma, commercialPromise, promisedQty, { staleThresholdMinutes });
    if (!validation.isPromiseValid) {
      redirect(`/production/requests/new?error=${encodeURIComponent(validation.reason)}`);
    }

    promiseAudit = {
      productId: commercialPromise.productId,
      sku: commercialPromise.sku,
      warehouseId: commercialPromise.warehouseId,
      requestedQty: promisedQty,
      sourceCheckedAt: commercialPromise.checkedAt,
      source: commercialPromise.source,
      status: validation.status,
      currentAvailable: validation.currentAvailable,
      validatedAt: validation.validatedAt,
      staleThresholdMinutes,
    };
  }

  try {
    const createPerf = startPerf(
      "action.production.requests.new.create.service",
    );
    const requestArgs = {
      customerId: canViewCustomers ? customerId : null,
      customerName: canViewCustomers ? null : customerName,
      requireFormalCustomer: canViewCustomers,
      warehouseId,
      dueDate,
      notes: notes || null,
      requestedByUserId: ctx.user?.id ?? null,
      requestedByRoles: ctx.roles,
      initialProductLine,
    };
    const created = orderLinesInput?.success
      ? await createSalesRequestWithLines(prisma, { ...requestArgs, lines: orderLinesInput.data })
      : assemblyInput?.success
      ? await createSalesRequestWithAssembly(prisma, {
          ...requestArgs,
          assembly: {
            warehouseId: assemblyInput.data.warehouseId,
            entryFittingProductId: assemblyInput.data.entryFittingProductId,
            hoseProductId: assemblyInput.data.hoseProductId,
            exitFittingProductId: assemblyInput.data.exitFittingProductId,
            hoseLength: assemblyInput.data.hoseLengthRaw,
            assemblyQuantity: assemblyInput.data.assemblyQuantityRaw,
            sourceDocumentRef: assemblyInput.data.sourceDocumentRef ?? null,
            notes: assemblyInput.data.notes ?? null,
          },
        })
      : await createSalesRequestDraftHeader(prisma, requestArgs);
    createPerf.end({ orderId: created.id });

    const persistedOrder = await prisma.salesInternalOrder.findUnique({
      where: { id: created.id },
      select: { customerName: true },
    });

    if (promiseAudit) {
      await createAuditLogSafeWithDb({
        entityType: "SALES_INTERNAL_ORDER",
        entityId: created.id,
        action: "REVALIDATE_COMMERCIAL_PROMISE",
        actor: ctx.user?.name ?? ctx.user?.email ?? "system",
        actorUserId: ctx.user?.id ?? null,
        source: "production/requests/new",
        after: promiseAudit,
      }, prisma);
    }

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
  const canQuickCreateCustomers =
    canManageCustomers ||
    sessionCtx.permissions.includes("customers.quick_create_sales");

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
  // Availability handoffs carry the quantity that was actually checked. Use
  // it when the generic order quantity is not present so the promise status
  // cannot be downgraded to a safe promise by the default quantity of 1.
  const quantity =
    parsePositiveDecimal(firstParam(sp.quantity)) ??
    parsePositiveDecimal(firstParam(sp.promiseRequestedQty)) ??
    1;
  const lineNotes = firstParam(sp.notes);
  const displayQuery = searchQuery || sku;
  const promiseFromUrl = buildCommercialPromiseFromSearchParams(buildSearchParams(sp));

  const selectedProduct = productId
    ? await getProductSearchSelection(prisma, productId)
    : sku
      ? (await resolveProductInput(prisma, sku, { minScore: 1600 })).product
      : null;
  const originalProduct =
    equivalentProductId && equivalentProductId !== selectedProduct?.id
      ? await getProductSearchSelection(prisma, equivalentProductId)
      : null;
  const promiseWarehouse = promiseFromUrl
    ? warehouses.find((warehouse) => warehouse.id === promiseFromUrl.warehouseId) ?? null
    : null;
  const coherentPromise = Boolean(
    promiseFromUrl &&
    selectedProduct?.id === promiseFromUrl.productId &&
    selectedProduct.sku === promiseFromUrl.sku &&
    promiseWarehouse &&
    promiseWarehouse.code === promiseFromUrl.warehouseCode &&
    promiseWarehouse.name === promiseFromUrl.warehouseName,
  );
  const staleThresholdMinutes = getCommercialPromiseStaleThresholdMinutes();
  const currentPromiseAvailability = coherentPromise && promiseFromUrl
    ? await checkCurrentAvailability(prisma, promiseFromUrl.productId, promiseFromUrl.warehouseId)
    : null;
  const commercialPromise = coherentPromise && promiseFromUrl && currentPromiseAvailability
    ? {
        ...promiseFromUrl,
        availableQuantity: currentPromiseAvailability.availableQuantity,
        status: computePromiseStatus(
          { ...promiseFromUrl, availableQuantity: currentPromiseAvailability.availableQuantity },
          { staleThresholdMinutes, requestedQuantity: quantity },
        ),
        staleThresholdMinutes,
      }
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
    <>
      <PageHeader
        title="Nuevo pedido comercial"
        description="Captura cliente, líneas y fecha compromiso."
        actions={
          <Link
            href="/production/requests"
            className="op-link rounded-[var(--radius-md)] border border-[var(--border-default)] px-4 py-2 text-sm"
          >
            ← Pedidos
          </Link>
        }
      />

      <div className="mx-auto max-w-5xl">
        <NewOrderForm
          initialCustomerId={firstParam(sp.customerId) || undefined}
          initialCustomerName={firstParam(sp.customerName) || undefined}
          initialWarehouseId={firstParam(sp.warehouseId) || promiseWarehouse?.id || undefined}
          initialDueDate={firstParam(sp.dueDate) || undefined}
          initialQuantity={quantity}
          initialLineNotes={lineNotes}
          warehouses={warehouses}
          selectedProduct={selectedProduct}
          originalProduct={originalProduct}
          hasCommercialContext={hasCommercialContext}
          displayQuery={displayQuery}
          sourceLabel={sourceLabel}
          commercialPromise={commercialPromise}
          invalidProductContext={invalidProductContext}
          catalogHref={catalogHref}
          availabilityHref={availabilityHref}
          equivalencesHref={equivalencesHref}
          canViewCustomers={canViewCustomers}
          canManageCustomers={canManageCustomers}
          canQuickCreateCustomers={canQuickCreateCustomers}
          action={createSalesRequest}
          error={error}
        />
      </div>
    </>
  );
}
