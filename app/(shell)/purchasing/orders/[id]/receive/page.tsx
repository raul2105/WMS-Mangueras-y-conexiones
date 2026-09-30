import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getSessionContext } from "@/lib/auth/session-context";
import { resolveAuthenticatedActor } from "@/lib/auth/authenticated-actor";
import { firstErrorMessage, purchaseReceiptOperationSchema, purchaseReceiptLineDiscrepancySchema } from "@/lib/schemas/wms";
import { pageGuard } from "@/components/rbac/PageGuard";
import { PurchaseReceiptForm } from "@/components/purchasing/PurchaseReceiptForm";
import { commitPurchaseOrderReceipt } from "@/lib/purchasing/purchase-order-receiving";
import { getPurchaseUnitPolicy, quantityValidationMessage } from "@/lib/quantity-policy";

const RECEIPT_QUEUE_HREF = "/purchasing/orders?preset=por_recibir";

async function receiveItems(orderId: string, formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requirePermission("purchasing.receive");
  const sessionCtx = await getSessionContext();
  const actor = resolveAuthenticatedActor(sessionCtx);

  const parsedHeader = purchaseReceiptOperationSchema.safeParse({
    locationId: String(formData.get("locationId") ?? "").trim(),
    referenceDoc: String(formData.get("referenceDoc") ?? "").trim() || undefined,
    notes: String(formData.get("notes") ?? "").trim() || undefined,
    operatorName: actor.operatorName ?? "",
  });

  if (!parsedHeader.success) {
    redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent(firstErrorMessage(parsedHeader.error))}`);
  }

  const locationId = parsedHeader.data.locationId;
  const referenceDoc = parsedHeader.data.referenceDoc?.trim() || null;
  const notes = parsedHeader.data.notes?.trim() || null;
  if (!actor.actorName) {
    redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent("Sesión inválida para registrar la recepción")}`);
  }

  const receivingLocation = await prisma.location.findUnique({
    where: { id: locationId },
    select: { code: true, isActive: true },
  });
  if (!receivingLocation?.isActive || !receivingLocation.code.startsWith("RECV")) {
    redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent("Selecciona una zona de recepción autorizada")}`);
  }

  const order = await prisma.purchaseOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      folio: true,
      status: true,
      lines: {
        select: {
          id: true,
          productId: true,
          qtyOrdered: true,
          qtyReceived: true,
          purchaseUnitLabel: true,
          purchaseUnitFactor: true,
          product: { select: { sku: true, type: true, unitLabel: true, attributes: true } },
        },
      },
    },
  });

  if (!order) {
    redirect("/purchasing/orders");
  }

  if (!["CONFIRMADA", "EN_TRANSITO", "PARCIAL"].includes(order.status)) {
    redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent("La OC no está en estado de recepción")}`);
  }

  const linesToReceive: Array<{
    lineId: string;
    productId: string;
    qtyReceived: number;
    qtyDamaged: number;
    qtyMissing: number;
    qtyRejected: number;
    qtySurplusReported: number;
    discrepancyReason: string | null;
  }> = [];
  for (const line of order.lines) {
    const pending = line.qtyOrdered - line.qtyReceived;
    if (pending <= 0) continue;

    const raw = String(formData.get(`qty_${line.id}`) ?? "0").trim();
    const qty = Number(raw.replace(",", ".") || "0");
    const purchasePolicy = getPurchaseUnitPolicy({
      ...line.product,
      purchaseUnitLabel: line.purchaseUnitLabel,
      purchaseUnitFactor: line.purchaseUnitFactor,
    });
    if (!Number.isFinite(qty) || qty < 0) {
      redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent(`Cantidad inválida para ${line.product.sku}`)}`);
    }
    const quantityError = qty === 0 ? null : quantityValidationMessage(qty, purchasePolicy);
    if (quantityError) {
      redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent(`${line.product.sku}: ${quantityError}`)}`);
    }
    if (qty > pending + 1e-8) {
      redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent(`Cantidad excede pendiente para ${line.product.sku} (máx: ${pending})`)}`);
    }

    const qtyDamaged = Number(String(formData.get(`dmg_${line.id}`) ?? "0").replace(",", "."));
    const qtyMissing = Number(String(formData.get(`missing_${line.id}`) ?? "0").replace(",", "."));
    const qtyRejected = Number(String(formData.get(`rejected_${line.id}`) ?? "0").replace(",", "."));
    const qtySurplusReported = Number(String(formData.get(`surplus_${line.id}`) ?? "0").replace(",", "."));
    const discrepancyValues = [qtyDamaged, qtyMissing, qtyRejected, qtySurplusReported];
    if (discrepancyValues.some((value) => !Number.isFinite(value) || value < 0 || quantityValidationMessage(value || 1, purchasePolicy))) {
      redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent(`Las diferencias de ${line.product.sku} no respetan la unidad de compra`)}`);
    }
    const discrepancyReason = String(formData.get(`reason_${line.id}`) ?? "").trim() || undefined;

    if (qty === 0 && qtyDamaged === 0 && qtyMissing === 0 && qtyRejected === 0 && qtySurplusReported === 0) {
      continue;
    }

    const lineParsed = purchaseReceiptLineDiscrepancySchema.safeParse({
      lineId: line.id,
      qtyReceived: qty,
      qtyDamaged,
      qtyMissing,
      qtyRejected,
      qtySurplusReported,
      discrepancyReason,
    });

    if (!lineParsed.success) {
      redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent(firstErrorMessage(lineParsed.error))}`);
    }

    const accounted = qty + qtyDamaged + qtyMissing + qtyRejected;
    if (accounted > pending + 1e-8) {
      redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent(`El total contado excede el pendiente para ${line.product.sku} (máx: ${pending})`)}`);
    }

    linesToReceive.push({
      lineId: line.id,
      productId: line.productId,
      qtyReceived: qty,
      qtyDamaged,
      qtyMissing,
      qtyRejected,
      qtySurplusReported,
      discrepancyReason: lineParsed.data.discrepancyReason ?? null,
    });
  }

  if (linesToReceive.length === 0) {
    redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent("Ingresa al menos una cantidad mayor a 0")}`);
  }

  let receiptId: string;
  try {
    receiptId = await commitPurchaseOrderReceipt({
      prismaClient: prisma,
      orderId,
      locationId,
      referenceDoc,
      notes,
      lines: linesToReceive,
      actor: {
        name: actor.actorName,
        userId: actor.actorUserId,
        operatorName: parsedHeader.data.operatorName?.trim() || null,
      },
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al registrar recepción";
    redirect(`/purchasing/orders/${orderId}/receive?error=${encodeURIComponent(message)}`);
  }

  redirect(`/labels/document/PURCHASE_RECEIPT/${receiptId}`);
}

export const dynamic = "force-dynamic";

export default async function ReceivePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await pageGuard("purchasing.receive");
  const { id } = await params;
  const sp = await searchParams;
  const actor = resolveAuthenticatedActor(await getSessionContext());

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: {
      id: true,
      folio: true,
      status: true,
      supplier: { select: { name: true, code: true, businessName: true } },
      lines: {
        select: {
          id: true,
          qtyOrdered: true,
          qtyReceived: true,
          purchaseUnitLabel: true,
          purchaseUnitFactor: true,
          product: { select: { sku: true, name: true, type: true, unitLabel: true, attributes: true } },
        },
        orderBy: { product: { sku: "asc" } },
      },
    },
  });

  if (!order) notFound();

  if (!["CONFIRMADA", "EN_TRANSITO", "PARCIAL"].includes(order.status)) {
    redirect(`${RECEIPT_QUEUE_HREF}&error=${encodeURIComponent("Esta OC no está pendiente de recepción")}`);
  }

  const pendingLines = order.lines.filter((line) => line.qtyOrdered - line.qtyReceived > 0);

  if (pendingLines.length === 0) {
    redirect(`${RECEIPT_QUEUE_HREF}&ok=${encodeURIComponent("La orden ya no tiene líneas pendientes de recepción")}`);
  }

  const locations = await prisma.location.findMany({
    where: { isActive: true, code: { startsWith: "RECV" } },
    orderBy: [{ warehouse: { name: "asc" } }, { code: "asc" }],
    select: { id: true, code: true, warehouse: { select: { name: true } } },
  });

  const receiveItemsBound = receiveItems.bind(null, id);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <Link href={RECEIPT_QUEUE_HREF} className="btn-secondary w-fit">
          ← Recepciones
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Recibir Mercancía</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {order.folio} · {order.supplier.code} — {order.supplier.businessName ?? order.supplier.name}
          </p>
        </div>
      </div>

      {sp.error ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-text)]">{sp.error}</div>
      ) : null}

      <p className="text-sm text-[var(--text-secondary)]">Usuario autenticado: {actor.actorName ?? "Usuario autenticado"}</p>
      <PurchaseReceiptForm
        action={receiveItemsBound}
        cancelHref={RECEIPT_QUEUE_HREF}
        locations={locations.map((location) => ({ id: location.id, code: location.code, warehouseName: location.warehouse.name }))}
        lines={pendingLines.map((line) => ({
          id: line.id,
          sku: line.product.sku,
          name: line.product.name,
          ordered: line.qtyOrdered,
          received: line.qtyReceived,
          pending: line.qtyOrdered - line.qtyReceived,
          unitLabel: line.purchaseUnitLabel ?? line.product.unitLabel,
          step: getPurchaseUnitPolicy({ ...line.product, purchaseUnitLabel: line.purchaseUnitLabel, purchaseUnitFactor: line.purchaseUnitFactor }).increment,
        }))}
      />
    </div>
  );
}
