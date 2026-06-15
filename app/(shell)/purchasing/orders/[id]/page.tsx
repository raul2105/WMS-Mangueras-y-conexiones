import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { purchaseOrderLineSchema, purchaseOrderUpdateSchema, firstErrorMessage } from "@/lib/schemas/wms";
import { pageGuard } from "@/components/rbac/PageGuard";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { TableWrap } from "@/components/ui/table";
import {
  loadLatestPurchaseOrderDocument,
  parsePurchaseOrderDocumentSnapshot,
  resolvePurchaseOrderFrozenFields,
  updatePurchaseOrderStatusWithDocument,
} from "@/lib/purchasing/purchase-order-document-service";
import {
  buildPurchaseOrderEmailContract,
  PURCHASE_ORDER_EMAIL_SEND_STATE_LABELS,
} from "@/lib/purchasing/purchase-order-email-contract";

const ORDER_TIMELINE = [
  { status: "BORRADOR", label: "Borrador" },
  { status: "CONFIRMADA", label: "Confirmada" },
  { status: "EN_TRANSITO", label: "En tránsito" },
  { status: "PARCIAL", label: "Parcial" },
  { status: "RECIBIDA", label: "Recibida" },
] as const;

const STATUS_LABELS: Record<string, string> = {
  BORRADOR: "Borrador",
  CONFIRMADA: "Confirmada",
  EN_TRANSITO: "En Tránsito",
  RECIBIDA: "Recibida",
  PARCIAL: "Parcial",
  CANCELADA: "Cancelada",
};

const STATUS_BADGE_VARIANTS: Record<string, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  BORRADOR: "neutral",
  CONFIRMADA: "accent",
  EN_TRANSITO: "warning",
  RECIBIDA: "success",
  PARCIAL: "warning",
  CANCELADA: "danger",
};

const EMAIL_STATUS_BADGE_VARIANTS: Record<string, "neutral" | "accent" | "success" | "warning" | "danger"> = {
    NOT_SENT: "neutral",
    SENT: "success",
    RESENT: "accent",
    FAILED: "danger",
  };

const mutedText = "text-[var(--text-secondary)]";
const softText = "text-[var(--text-muted)]";
const primaryText = "text-[var(--text-primary)]";
const successText = "text-[var(--status-success)]";
const warningText = "text-[var(--status-warning)]";
const dangerText = "text-[var(--status-danger)]";
const surfaceBorderSoft = "border-[var(--border-soft)]";

// Valid status transitions
const TRANSITIONS: Record<string, string[]> = {
  BORRADOR: ["CONFIRMADA", "CANCELADA"],
  CONFIRMADA: ["EN_TRANSITO", "CANCELADA"],
  EN_TRANSITO: ["RECIBIDA", "CANCELADA"],
  PARCIAL: ["EN_TRANSITO", "CANCELADA"],
  RECIBIDA: [],
  CANCELADA: [],
};

function getTimelineBadgeVariant(stepIndex: number, activeIndex: number, currentStatus: string) {
  if (currentStatus === "CANCELADA") {
    return stepIndex <= activeIndex ? "danger" : "neutral";
  }
  if (stepIndex < activeIndex) return "success";
  if (stepIndex === activeIndex) return "accent";
  return "neutral";
}

function getNextAction(orderStatus: string, canReceive: boolean, allowedTransitions: string[]) {
  if (orderStatus === "BORRADOR") {
    return {
      title: "Completar borrador",
      description: "Define almacén destino, fecha esperada y líneas antes de confirmar la orden.",
      action: allowedTransitions.includes("CONFIRMADA") ? "Confirmar OC" : null,
    };
  }

  if (canReceive) {
    return {
      title: "Registrar recepción",
      description: "La orden ya puede recibir mercancía. Continúa con la recepción operativa.",
      action: "Recibir mercancía",
    };
  }

  if (orderStatus === "PARCIAL") {
    return {
      title: "Completar recepciones",
      description: "Hay cantidades pendientes por cerrar. Revisa el historial antes de avanzar.",
      action: allowedTransitions.includes("EN_TRANSITO") ? "Volver a en tránsito" : null,
    };
  }

  if (orderStatus === "RECIBIDA") {
    return {
      title: "Orden cerrada",
      description: "Revisa documento oficial, correo al proveedor y historial de recepciones.",
      action: null,
    };
  }

  if (orderStatus === "CANCELADA") {
    return {
      title: "Orden cancelada",
      description: "No hay acciones operativas disponibles para esta OC.",
      action: null,
    };
  }

  return {
    title: "Revisar siguiente paso",
    description: "Consulta el estado de la orden y continúa con el flujo autorizado.",
    action: allowedTransitions[0] ? `Ir a ${allowedTransitions[0]}` : null,
  };
}

function formatDateInput(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

async function updateStatus(orderId: string, formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requirePermission("purchasing.manage");

  const newStatus = String(formData.get("status") ?? "").trim();
  const result = await updatePurchaseOrderStatusWithDocument({
    purchaseOrderId: orderId,
    newStatus,
    prismaClient: prisma,
  });

  if ("error" in result) {
    redirect(`/purchasing/orders/${orderId}?error=${encodeURIComponent(result.error)}`);
  }

  const { emitSyncEventSafe } = await import("@/lib/sync/sync-events");
  await emitSyncEventSafe({
    entityType: "ORDER",
    entityId: orderId,
    action: "UPDATE",
    payload: { orderId, type: "PURCHASE_ORDER", status: newStatus },
  });

  redirect(`/purchasing/orders/${orderId}?ok=1`);
}

async function addLine(orderId: string, formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requirePermission("purchasing.manage");

  const productId = String(formData.get("productId") ?? "").trim();
  const qtyOrderedRaw = String(formData.get("qtyOrderedRaw") ?? "").trim();
  const unitPriceRaw = String(formData.get("unitPriceRaw") ?? "").trim();

  const parsed = purchaseOrderLineSchema.safeParse({ purchaseOrderId: orderId, productId, qtyOrderedRaw, unitPriceRaw });
  if (!parsed.success) {
    redirect(`/purchasing/orders/${orderId}?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  const order = await prisma.purchaseOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "BORRADOR") {
    redirect(`/purchasing/orders/${orderId}?error=${encodeURIComponent("Solo se pueden agregar líneas a OCs en Borrador")}`);
  }

  const unitPrice = unitPriceRaw ? Number(unitPriceRaw.replace(",", ".")) : null;
  const qtyOrdered = parsed.data.qtyOrderedRaw;

  // Check if supplier has a price for this product
  let resolvedPrice = unitPrice;
  if (resolvedPrice == null) {
    const supplierProduct = await prisma.supplierProduct.findUnique({
      where: { supplierId_productId: { supplierId: order.supplierId, productId } },
    });
    resolvedPrice = supplierProduct?.unitPrice ?? null;
  }

  await prisma.purchaseOrderLine.upsert({
    where: { purchaseOrderId_productId: { purchaseOrderId: orderId, productId } },
    create: { purchaseOrderId: orderId, productId, qtyOrdered, unitPrice: resolvedPrice },
    update: { qtyOrdered, unitPrice: resolvedPrice },
  });

  redirect(`/purchasing/orders/${orderId}`);
}

async function updateDraftMetadata(orderId: string, formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requirePermission("purchasing.manage");

  const deliveryWarehouseId = String(formData.get("deliveryWarehouseId") ?? "").trim();
  const expectedDate = String(formData.get("expectedDate") ?? "").trim() || undefined;
  const notes = String(formData.get("notes") ?? "").trim() || undefined;

  const parsed = purchaseOrderUpdateSchema.safeParse({ deliveryWarehouseId, expectedDate, notes });
  if (!parsed.success) {
    redirect(`/purchasing/orders/${orderId}?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  const order = await prisma.purchaseOrder.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      paymentTermsSnapshot: true,
      supplier: { select: { paymentTerms: true } },
    },
  });
  if (!order || order.status !== "BORRADOR") {
    redirect(`/purchasing/orders/${orderId}?error=${encodeURIComponent("Solo se pueden editar datos de OCs en Borrador")}`);
  }

      const warehouse = await prisma.warehouse.findUnique({
      where: { id: parsed.data.deliveryWarehouseId },
      select: { id: true, address: true, isActive: true },
    });
  if (!warehouse || !warehouse.isActive) {
    redirect(`/purchasing/orders/${orderId}?error=${encodeURIComponent("Almacén destino no encontrado o inactivo")}`);
  }

  const frozenFields = resolvePurchaseOrderFrozenFields({
    deliveryWarehouse: warehouse,
    supplierPaymentTerms: order.paymentTermsSnapshot ?? order.supplier.paymentTerms,
  });

  await prisma.purchaseOrder.update({
    where: { id: orderId },
    data: {
      deliveryWarehouseId: frozenFields.deliveryWarehouseId,
      deliveryAddressSnapshot: frozenFields.deliveryAddressSnapshot,
      paymentTermsSnapshot: frozenFields.paymentTermsSnapshot,
      expectedDate: parsed.data.expectedDate ? new Date(parsed.data.expectedDate) : null,
      notes: parsed.data.notes ?? null,
    },
  });

  redirect(`/purchasing/orders/${orderId}?ok=1`);
}

async function removeLine(orderId: string, formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requirePermission("purchasing.manage");

  const lineId = String(formData.get("lineId") ?? "").trim();

  const line = await prisma.purchaseOrderLine.findUnique({ where: { id: lineId } });
  if (!line || line.qtyReceived > 0) {
    redirect(`/purchasing/orders/${orderId}?error=${encodeURIComponent("No se puede eliminar una línea con recepciones")}`);
  }

  const order = await prisma.purchaseOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "BORRADOR") {
    redirect(`/purchasing/orders/${orderId}?error=${encodeURIComponent("Solo se pueden eliminar líneas de OCs en Borrador")}`);
  }

  await prisma.purchaseOrderLine.delete({ where: { id: lineId } });
  redirect(`/purchasing/orders/${orderId}`);
}

export const dynamic = "force-dynamic";

export default async function PurchaseOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await pageGuard("purchasing.manage");
  const { id } = await params;
  const sp = await searchParams;

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: {
      id: true,
      supplierId: true,
      folio: true,
      status: true,
      deliveryWarehouseId: true,
      expectedDate: true,
      notes: true,
      deliveryAddressSnapshot: true,
      paymentTermsSnapshot: true,
      emailSendState: true,
      emailRecipientSnapshot: true,
      emailSubjectSnapshot: true,
      emailBodySnapshot: true,
      emailDocumentVersionSnapshot: true,
      emailLastAttemptAt: true,
      emailLastSentAt: true,
      emailLastErrorCode: true,
      emailLastErrorMessage: true,
      supplier: { select: { id: true, code: true, name: true, businessName: true, email: true, paymentTerms: true } },
      deliveryWarehouse: { select: { id: true, code: true, name: true, address: true, isActive: true } },
      lines: {
        select: {
          id: true,
          qtyOrdered: true,
          qtyReceived: true,
          unitPrice: true,
          product: { select: { id: true, sku: true, name: true } },
        },
        orderBy: { product: { sku: "asc" } },
      },
      receipts: {
        orderBy: { receivedAt: "desc" },
        select: {
          id: true,
          receivedAt: true,
          notes: true,
          referenceDoc: true,
          location: { select: { code: true } },
          lines: { select: { qtyReceived: true } },
        },
      },
    },
  });

  if (!order) notFound();

  const products = await prisma.product.findMany({
    select: { id: true, sku: true, name: true },
    orderBy: { sku: "asc" },
  });

  const updateStatusBound = updateStatus.bind(null, id);
  const addLineBound = addLine.bind(null, id);
  const removeLineBound = removeLine.bind(null, id);
  const updateDraftMetadataBound = updateDraftMetadata.bind(null, id);

  const activeWarehouses = await prisma.warehouse.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, address: true },
  });

  const totalOrdered = order.lines.reduce((s, l) => s + l.qtyOrdered, 0);
  const totalReceived = order.lines.reduce((s, l) => s + l.qtyReceived, 0);
  const pctReceived = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;
  const totalValue = order.lines.reduce((s, l) => s + (l.unitPrice ?? 0) * l.qtyOrdered, 0);
  const documentRecord = await loadLatestPurchaseOrderDocument({ purchaseOrderId: id, prismaClient: prisma });
  let documentSnapshot = null;
  if (documentRecord) {
    try {
      documentSnapshot = parsePurchaseOrderDocumentSnapshot(documentRecord.snapshotJson);
    } catch {
      documentSnapshot = null;
    }
  }
  const emailContract = buildPurchaseOrderEmailContract({
    purchaseOrder: order,
    documentRecord,
    documentSnapshot,
    providerConfigured: false,
  });
  const allowedTransitions = TRANSITIONS[order.status] ?? [];
  const hasPending = order.lines.some((l) => l.qtyReceived < l.qtyOrdered);
  const canReceive = ["CONFIRMADA", "EN_TRANSITO", "PARCIAL"].includes(order.status) && hasPending;
  const currentTimelineIndex = ORDER_TIMELINE.findIndex((step) => step.status === order.status);
  const nextAction = getNextAction(order.status, canReceive, allowedTransitions);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/purchasing/orders" className={buttonStyles({ variant: "secondary", size: "md" })}>← OCs</Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono">{order.folio}</h1>
              <Badge variant={STATUS_BADGE_VARIANTS[order.status] ?? "neutral"} size="sm">
                {STATUS_LABELS[order.status] ?? order.status}
              </Badge>
            </div>
            <p className={`text-sm ${mutedText} mt-0.5`}>
              {order.supplier.code} — {order.supplier.businessName ?? order.supplier.name}
            </p>
          </div>
        </div>
        {canReceive && (
          <Link
            href={`/purchasing/orders/${id}/receive`}
            className={buttonStyles({ variant: "primary", size: "md" })}
          >
            Recibir mercancía →
          </Link>
        )}
      </div>

      {sp.error && <div className={`glass-card border ${surfaceBorderSoft} ${dangerText} text-sm`}>{sp.error}</div>}
      {sp.ok && <div className={`glass-card border ${surfaceBorderSoft} ${successText} text-sm`}>Orden actualizada correctamente.</div>}

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
        <div className="glass-card space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">Línea de tiempo operativa</h2>
              <p className={`text-sm ${mutedText} mt-1`}>
                KAN-88: resume el avance real de la OC y el estado visible para el siguiente paso.
              </p>
            </div>
            <Badge
              variant={order.status === "CANCELADA" ? "danger" : order.status === "RECIBIDA" ? "success" : "accent"}
              size="sm"
            >
              {STATUS_LABELS[order.status] ?? order.status}
            </Badge>
          </div>

          <div className="grid gap-2 md:grid-cols-5">
            {ORDER_TIMELINE.map((step, index) => (
              <div
                key={step.status}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  index < currentTimelineIndex
                    ? "border-[var(--status-success-border)] bg-[var(--status-success-bg)]"
                    : index === currentTimelineIndex
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--border-soft)] bg-[var(--surface-secondary)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-[var(--text-primary)]">{step.label}</p>
                  <Badge
                    variant={index === currentTimelineIndex ? "neutral" : getTimelineBadgeVariant(index, currentTimelineIndex, order.status)}
                    size="sm"
                  >
                    {index < currentTimelineIndex ? "Hecho" : index === currentTimelineIndex ? "Actual" : "Pendiente"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card space-y-4">
          <div>
            <h2 className="text-lg font-bold">Siguiente acción</h2>
            <p className={`text-sm ${mutedText} mt-1`}>Acción prioritaria del flujo de compras para este estado.</p>
          </div>
          <div className="space-y-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-secondary)] px-4 py-3">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{nextAction.title}</p>
            <p className={`text-sm ${mutedText}`}>{nextAction.description}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {canReceive ? (
              <Link href={`/purchasing/orders/${id}/receive`} className={buttonStyles({ variant: "primary", size: "md" })}>
                {nextAction.action ?? "Recibir mercancía"}
              </Link>
            ) : nextAction.action ? (
              <div className={`rounded-lg border ${surfaceBorderSoft} px-4 py-2 text-sm ${mutedText}`}>
                {nextAction.action}
              </div>
            ) : (
              <div className={`rounded-lg border ${surfaceBorderSoft} px-4 py-2 text-sm ${mutedText}`}>
                OC cerrada. Revisa el documento oficial si necesitas evidencia.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass p-4 rounded-lg">
          <p className={`text-xs ${softText} uppercase font-bold`}>Líneas</p>
          <p className={`text-xl font-bold ${primaryText} mt-1`}>{order.lines.length}</p>
        </div>
        <div className="glass p-4 rounded-lg">
          <p className={`text-xs ${softText} uppercase font-bold`}>Valor estimado</p>
          <p className={`text-xl font-bold ${warningText} mt-1`}>
            ${totalValue.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="glass p-4 rounded-lg">
          <p className={`text-xs ${softText} uppercase font-bold`}>% Recibido</p>
          <p className={`text-xl font-bold mt-1 ${pctReceived === 100 ? successText : pctReceived > 0 ? warningText : mutedText}`}>
            {pctReceived}%
          </p>
        </div>
        <div className="glass p-4 rounded-lg">
          <p className={`text-xs ${softText} uppercase font-bold`}>Fecha esperada</p>
          <p className={`text-sm font-medium ${primaryText} mt-1`}>
            {order.expectedDate ? new Date(order.expectedDate).toLocaleDateString("es-MX") : "—"}
          </p>
        </div>
      </div>

      {/* Cambio de estado */}
      {allowedTransitions.length > 0 && (
        <div className="glass-card">
          <h3 className={`text-sm font-semibold ${primaryText} mb-3`}>Cambiar estado</h3>
          <div className="flex flex-wrap gap-3">
            {allowedTransitions.map((s) => (
              <form key={s} action={updateStatusBound}>
                <input type="hidden" name="status" value={s} />
                <button
                  type="submit"
                  className={buttonStyles({
                    variant: s === "CANCELADA" ? "danger" : "secondary",
                    size: "sm",
                  })}
                >
                  → {STATUS_LABELS[s] ?? s}
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      <div className="glass-card space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Entrega y términos oficiales</h2>
            <p className={`text-sm ${mutedText} mt-1`}>Estos valores se congelan en el documento oficial de la orden de compra.</p>
          </div>
          <span className={`text-xs uppercase tracking-[0.2em] ${softText}`}>
            {order.status === "BORRADOR" ? "Editable" : "Congelado"}
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2 text-sm">
          <div className="space-y-1">
            <p className={`text-xs uppercase tracking-[0.18em] ${softText}`}>Dirección de entrega</p>
            <p className={primaryText}>{order.deliveryAddressSnapshot ?? order.deliveryWarehouse?.address ?? "—"}</p>
            <p className={`text-xs ${softText}`}>
              {order.deliveryWarehouse ? `${order.deliveryWarehouse.code} — ${order.deliveryWarehouse.name}` : "Sin almacén seleccionado"}
            </p>
          </div>
          <div className="space-y-1">
            <p className={`text-xs uppercase tracking-[0.18em] ${softText}`}>Términos de pago</p>
            <p className={primaryText}>{order.paymentTermsSnapshot ?? order.supplier.paymentTerms ?? "—"}</p>
            <p className={`text-xs ${softText}`}>Origen: ficha del proveedor.</p>
          </div>
        </div>

        {order.status === "BORRADOR" && (
          <form action={updateDraftMetadataBound} className={`grid gap-4 md:grid-cols-2 border-t ${surfaceBorderSoft} pt-4`}>
            <label className="space-y-1 md:col-span-2">
              <span className={`text-xs ${mutedText}`}>Almacén destino *</span>
              <select
                name="deliveryWarehouseId"
                required
                defaultValue={order.deliveryWarehouseId ?? ""}
                className="w-full px-3 py-2 glass rounded-lg text-sm"
              >
                <option value="">Seleccionar almacén...</option>
                {activeWarehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.code} — {warehouse.name} {warehouse.address ? `(${warehouse.address})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className={`text-xs ${mutedText}`}>Fecha esperada</span>
              <input
                name="expectedDate"
                type="date"
                defaultValue={formatDateInput(order.expectedDate)}
                className="w-full px-3 py-2 glass rounded-lg text-sm"
              />
            </label>

            <label className="space-y-1">
              <span className={`text-xs ${mutedText}`}>Notas</span>
              <textarea
                name="notes"
                rows={3}
                defaultValue={order.notes ?? ""}
                className="w-full px-3 py-2 glass rounded-lg text-sm min-h-[96px]"
              />
            </label>

            <div className="md:col-span-2 flex justify-end">
              <button type="submit" className={buttonStyles({ variant: "primary", size: "md" })}>
                Guardar datos de borrador
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="glass-card space-y-3">
        <h2 className={`text-lg font-bold border-b ${surfaceBorderSoft} pb-2`}>Documento oficial</h2>
        {order.status === "BORRADOR" ? (
          <p className={`text-sm ${mutedText}`}>Documento oficial disponible al confirmar.</p>
        ) : documentSnapshot ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 text-sm">
              <div className="glass p-3 rounded-lg">
                <p className={`text-xs uppercase ${softText}`}>Versión</p>
                <p className={`font-semibold ${primaryText}`}>v{documentSnapshot.documentVersion}</p>
              </div>
              <div className="glass p-3 rounded-lg">
                <p className={`text-xs uppercase ${softText}`}>Generado</p>
                <p className={`font-semibold ${primaryText}`}>{new Date(documentSnapshot.generatedAt).toLocaleString("es-MX")}</p>
              </div>
              <div className="glass p-3 rounded-lg">
                <p className={`text-xs uppercase ${softText}`}>Estado congelado</p>
                <p className={`font-semibold ${primaryText}`}>{documentSnapshot.purchaseOrder.status}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={`/purchasing/orders/${id}/document`} className={buttonStyles({ variant: "secondary", size: "md" })}>
                Ver documento oficial
              </Link>
              <a href={`/api/purchasing/orders/${id}/pdf`} className={buttonStyles({ variant: "primary", size: "md" })}>
                Descargar PDF
              </a>
            </div>
          </div>
        ) : (
          <p className={`text-sm ${warningText}`}>Documento oficial no generado para esta OC. Revisión requerida.</p>
        )}
      </div>

      <div className="glass-card space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Correo al proveedor</h2>
            <p className={`text-sm ${mutedText} mt-1`}>
              Contrato preparado para KAN-85. En esta versión no existe envío real por correo.
            </p>
          </div>
          <span className="inline-flex items-center gap-2">
            <Badge variant={EMAIL_STATUS_BADGE_VARIANTS[emailContract.sendState] ?? "neutral"} size="sm" />
            <span className="text-xs font-semibold">{PURCHASE_ORDER_EMAIL_SEND_STATE_LABELS[emailContract.sendState]}</span>
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2 text-sm">
          <div className="space-y-1">
            <p className={`text-xs uppercase tracking-[0.18em] ${softText}`}>Destinatario</p>
            <p className={primaryText}>{emailContract.recipientEmail ?? "Sin correo registrado"}</p>
            <p className={`text-xs ${softText}`}>Origen: email congelado del documento oficial o ficha viva del proveedor.</p>
          </div>
          <div className="space-y-1">
            <p className={`text-xs uppercase tracking-[0.18em] ${softText}`}>Adjunto oficial</p>
            <p className={primaryText}>
              {emailContract.document
                ? `v${emailContract.document.versionNumber}${emailContract.document.attachmentFilename ? ` · ${emailContract.document.attachmentFilename}` : ""}`
                : "No disponible"}
            </p>
            <p className={`text-xs ${softText}`}>
              {emailContract.document?.isSnapshotValid
                ? "Generado desde el snapshot oficial congelado."
                : "Pendiente de documento oficial o revisión de integridad."}
            </p>
          </div>
          <div className="space-y-1 md:col-span-2">
            <p className={`text-xs uppercase tracking-[0.18em] ${softText}`}>Asunto</p>
            <p className={`${primaryText} break-words`}>{emailContract.subject}</p>
          </div>
        </div>

        <details className={`rounded-lg border ${surfaceBorderSoft} bg-[var(--surface-secondary)] px-4 py-3`}>
          <summary className={`cursor-pointer text-sm font-semibold ${primaryText}`}>Vista previa del cuerpo</summary>
          <pre className={`mt-3 whitespace-pre-wrap text-sm leading-6 ${mutedText}`}>{emailContract.body}</pre>
        </details>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled
            className={buttonStyles({ variant: "secondary", size: "md" })}
            title={`${emailContract.providerNote} Envío deshabilitado en esta versión.`}
          >
            Envío por correo deshabilitado
          </button>
          <p className={`text-xs ${softText}`}>{emailContract.providerNote}</p>
        </div>

        {emailContract.blockedReasons.length > 0 ? (
          <div className={`space-y-1 rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-4 py-3 text-sm ${warningText}`}>
            <p className="font-semibold">Bloqueos del contrato</p>
            <ul className="space-y-1 text-xs">
              {emailContract.blockedReasons.map((reason) => (
                <li key={reason}>• {reason}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {emailContract.lastErrorMessage ? (
          <p className={`text-xs ${dangerText}`}>Último error registrado: {emailContract.lastErrorMessage}</p>
        ) : null}
      </div>

      {/* Líneas */}
      <div className="glass-card space-y-4">
        <h2 className={`text-lg font-bold border-b ${surfaceBorderSoft} pb-2`}>
          Líneas de Compra
          <span className={`text-sm ${mutedText} font-normal ml-2`}>({order.lines.length})</span>
        </h2>

        {order.lines.length === 0 ? (
          <p className={`text-sm ${softText}`}>Sin líneas. Agrega productos a continuación.</p>
        ) : (
          <div className="space-y-3 md:hidden">
            {order.lines.map((line) => {
              const pending = line.qtyOrdered - line.qtyReceived;
              const subtotal = (line.unitPrice ?? 0) * line.qtyOrdered;
              return (
                <article key={line.id} className={`rounded-lg border ${surfaceBorderSoft} bg-[var(--surface-primary)] p-3 text-sm`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs text-[var(--text-accent)]">{line.product.sku}</p>
                      <p className={`${primaryText} font-medium`}>{line.product.name}</p>
                    </div>
                    <div className={`text-right text-xs ${mutedText}`}>
                      <p>Pedido: <span className={primaryText}>{line.qtyOrdered}</span></p>
                      <p>Recibido: <span className={successText}>{line.qtyReceived}</span></p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className={`rounded-md border ${surfaceBorderSoft} px-2 py-1`}>
                      <p className={softText}>Pendiente</p>
                      <p className={pending > 0 ? warningText : mutedText}>{pending}</p>
                    </div>
                    <div className={`rounded-md border ${surfaceBorderSoft} px-2 py-1`}>
                      <p className={softText}>Precio / Subtotal</p>
                      <p className={primaryText}>
                        {line.unitPrice != null ? `$${line.unitPrice.toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : "—"}
                      </p>
                      <p className={mutedText}>
                        {line.unitPrice != null ? `$${subtotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : "—"}
                      </p>
                    </div>
                  </div>
                  {order.status === "BORRADOR" ? (
                    <form action={removeLineBound} className="mt-3">
                      <input type="hidden" name="lineId" value={line.id} />
                      <button type="submit" className={buttonStyles({ variant: "danger", size: "sm" })}>
                        Quitar línea
                      </button>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        {order.lines.length > 0 ? (
          <TableWrap label="Tabla de líneas de compra" className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${surfaceBorderSoft} ${mutedText}`}>
                  <th className="text-left py-2">SKU</th>
                  <th className="text-left py-2">Producto</th>
                  <th className="text-right py-2">Pedido</th>
                  <th className="text-right py-2">Recibido</th>
                  <th className="text-right py-2">Pendiente</th>
                  <th className="text-right py-2">Precio Unit.</th>
                  <th className="text-right py-2">Subtotal</th>
                  {order.status === "BORRADOR" && <th className="py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line) => {
                  const pending = line.qtyOrdered - line.qtyReceived;
                  const subtotal = (line.unitPrice ?? 0) * line.qtyOrdered;
                  return (
                    <tr key={line.id} className={`border-b ${surfaceBorderSoft} hover:bg-[var(--table-hover)]`}>
                      <td className="py-2 font-mono text-[var(--text-accent)] text-xs">{line.product.sku}</td>
                      <td className={`py-2 ${primaryText}`}>{line.product.name}</td>
                      <td className={`py-2 text-right font-semibold ${primaryText}`}>{line.qtyOrdered}</td>
                      <td className={`py-2 text-right ${successText}`}>{line.qtyReceived}</td>
                      <td className={`py-2 text-right font-semibold ${pending > 0 ? warningText : softText}`}>
                        {pending}
                      </td>
                      <td className={`py-2 text-right ${mutedText} text-xs`}>
                        {line.unitPrice != null ? `$${line.unitPrice.toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : "—"}
                      </td>
                      <td className={`py-2 text-right ${mutedText} text-xs`}>
                        {line.unitPrice != null ? `$${subtotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : "—"}
                      </td>
                      {order.status === "BORRADOR" && (
                        <td className="py-2 text-right">
                          <form action={removeLineBound} className="inline">
                            <input type="hidden" name="lineId" value={line.id} />
                            <button type="submit" className={buttonStyles({ variant: "danger", size: "sm" })}>
                              Quitar
                            </button>
                          </form>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        ) : null}

        {/* Form agregar línea (solo en BORRADOR) */}
        {order.status === "BORRADOR" && (
          <form action={addLineBound} className={`border-t ${surfaceBorderSoft} pt-4`}>
            <h3 className={`text-sm font-semibold ${primaryText} mb-3`}>Agregar producto</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <label className="space-y-1 md:col-span-2">
                <span className={`text-xs ${mutedText}`}>Producto *</span>
                <select name="productId" required className="w-full px-3 py-2 glass rounded-lg text-sm">
                  <option value="">Seleccionar…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className={`text-xs ${mutedText}`}>Cantidad *</span>
                <input
                  name="qtyOrderedRaw"
                  type="number"
                  min="1"
                  step="1"
                  required
                  placeholder="0"
                  className="w-full px-3 py-2 glass rounded-lg text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className={`text-xs ${mutedText}`}>Precio Unit. (MXN)</span>
                <input
                  name="unitPriceRaw"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="w-full px-3 py-2 glass rounded-lg text-sm"
                />
              </label>
              <div className="flex items-end">
                <button type="submit" className={buttonStyles({ variant: "primary", size: "md" })}>Agregar</button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* Historial de recepciones */}
      {order.receipts.length > 0 && (
        <div className="glass-card space-y-3">
          <h2 className={`text-lg font-bold border-b ${surfaceBorderSoft} pb-2`}>
            Recepciones ({order.receipts.length})
          </h2>
          <div className="space-y-3">
            {order.receipts.map((receipt) => (
              <div key={receipt.id} className="glass p-3 rounded-lg text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-medium ${primaryText}`}>
                      {new Date(receipt.receivedAt).toLocaleString("es-MX")}
                    </p>
                    <p className={`text-xs mt-0.5 ${mutedText}`}>
                      Ubicación: <span className="text-cyan-400 font-mono">{receipt.location.code}</span>
                      {receipt.referenceDoc && (
                        <span> · Referencia: <span className={primaryText}>{receipt.referenceDoc}</span></span>
                      )}
                    </p>
                  </div>
                  <span className={`${successText} font-bold`}>
                    {receipt.lines.reduce((s, l) => s + l.qtyReceived, 0)} u.
                  </span>
                </div>
                {receipt.notes && <p className={`text-xs mt-1 ${softText}`}>{receipt.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {order.notes && (
        <div className="glass-card">
          <p className={`text-xs ${mutedText} uppercase font-bold mb-1`}>Notas</p>
          <p className={`text-sm ${primaryText}`}>{order.notes}</p>
        </div>
      )}
    </div>
  );
}
