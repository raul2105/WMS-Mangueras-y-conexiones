import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import {
  purchaseOrderCreateLinesSchema,
  purchaseOrderCreateSchema,
  firstErrorMessage,
} from "@/lib/schemas/wms";
import { createAuditLogSafe } from "@/lib/audit-log";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { pageGuard } from "@/components/rbac/PageGuard";
import { resolvePurchaseOrderFrozenFields } from "@/lib/purchasing/purchase-order-document-service";
import { PurchaseOrderCreateForm } from "@/components/purchasing/PurchaseOrderCreateForm";
import { getPurchaseUnitPolicy, quantityValidationMessage } from "@/lib/quantity-policy";

async function createOrder(formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requirePermission("purchasing.manage");

  const supplierId = String(formData.get("supplierId") ?? "").trim();
  const deliveryWarehouseId = String(formData.get("deliveryWarehouseId") ?? "").trim();
  const expectedDate = String(formData.get("expectedDate") ?? "").trim() || undefined;
  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  const linesJson = String(formData.get("linesJson") ?? "[]");

  const parsed = purchaseOrderCreateSchema.safeParse({ supplierId, deliveryWarehouseId, expectedDate, notes });
  if (!parsed.success) {
    redirect(`/purchasing/orders/new?error=${encodeURIComponent(firstErrorMessage(parsed.error))}`);
  }

  let rawLines: unknown;
  try {
    rawLines = JSON.parse(linesJson);
  } catch {
    redirect(`/purchasing/orders/new?error=${encodeURIComponent("No se pudieron leer los productos de la orden")}`);
  }
  const parsedLines = purchaseOrderCreateLinesSchema.safeParse(rawLines);
  if (!parsedLines.success) {
    redirect(`/purchasing/orders/new?error=${encodeURIComponent(firstErrorMessage(parsedLines.error))}`);
  }

  const [supplier, warehouse] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: parsed.data.supplierId } }),
    prisma.warehouse.findUnique({ where: { id: parsed.data.deliveryWarehouseId } }),
  ]);
  if (!supplier || !supplier.isActive) {
    redirect(`/purchasing/orders/new?error=${encodeURIComponent("Proveedor no encontrado o inactivo")}`);
  }
  if (!warehouse || !warehouse.isActive) {
    redirect(`/purchasing/orders/new?error=${encodeURIComponent("Almacén destino no encontrado o inactivo")}`);
  }

  const productIds = parsedLines.data.map((line) => line.productId);
  const [validProducts, supplierPrices] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, unitLabel: true, purchaseUnitLabel: true, purchaseUnitFactor: true, type: true, attributes: true },
    }),
    prisma.supplierProduct.findMany({
      where: { supplierId: parsed.data.supplierId, productId: { in: productIds } },
      select: { productId: true, unitPrice: true },
    }),
  ]);
  if (validProducts.length !== productIds.length) {
    redirect(`/purchasing/orders/new?error=${encodeURIComponent("Uno de los productos ya no está disponible en el catálogo")}`);
  }
  const productById = new Map(validProducts.map((product) => [product.id, product]));
  for (const line of parsedLines.data) {
    const product = productById.get(line.productId);
    if (!product) continue;
    const quantityError = quantityValidationMessage(line.qtyOrdered, getPurchaseUnitPolicy(product));
    if (quantityError) {
      redirect(`/purchasing/orders/new?error=${encodeURIComponent(quantityError)}`);
    }
  }
  const supplierPriceByProduct = new Map(supplierPrices.map((item) => [item.productId, item.unitPrice]));

  const frozenFields = resolvePurchaseOrderFrozenFields({
    deliveryWarehouse: { id: warehouse.id, address: warehouse.address ?? null },
    supplierPaymentTerms: supplier.paymentTerms,
  });

  const count = await prisma.purchaseOrder.count();
  const year = new Date().getFullYear();
  const folio = `OC-${year}-${String(count + 1).padStart(4, "0")}`;

  const order = await prisma.$transaction(async (tx) => tx.purchaseOrder.create({
    data: {
      folio,
      supplierId: parsed.data.supplierId,
      deliveryWarehouseId: frozenFields.deliveryWarehouseId,
      expectedDate: parsed.data.expectedDate ? new Date(parsed.data.expectedDate) : null,
      notes: parsed.data.notes ?? null,
      deliveryAddressSnapshot: frozenFields.deliveryAddressSnapshot,
      paymentTermsSnapshot: frozenFields.paymentTermsSnapshot,
      lines: {
        create: parsedLines.data.map((line) => {
          const product = productById.get(line.productId)!;
          return {
            productId: line.productId,
            qtyOrdered: line.qtyOrdered,
            unitPrice: line.unitPrice ?? supplierPriceByProduct.get(line.productId) ?? null,
            purchaseUnitLabel: product.purchaseUnitLabel ?? product.unitLabel,
            purchaseUnitFactor: product.purchaseUnitFactor,
          };
        }),
      },
    },
    select: { id: true, folio: true },
  }));

  await createAuditLogSafe({
    entityType: "PURCHASE_ORDER",
    entityId: order.id,
    action: "CREATE",
    after: JSON.stringify({ folio: order.folio, supplierId }),
    source: "purchasing/orders/new",
  });

  const { emitSyncEventSafe } = await import("@/lib/sync/sync-events");
  await emitSyncEventSafe({
    entityType: "ORDER",
    entityId: order.id,
    action: "CREATE",
    payload: { orderId: order.id, code: order.folio, type: "PURCHASE_ORDER", status: "BORRADOR" },
  });

  redirect(`/purchasing/orders/${order.id}`);
}

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await pageGuard("purchasing.manage");
  const sp = await searchParams;

  const [suppliers, warehouses, products] = await Promise.all([
    prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, address: true },
    }),
    prisma.product.findMany({
      orderBy: { sku: "asc" },
      select: { id: true, sku: true, name: true, type: true, unitLabel: true, purchaseUnitLabel: true, purchaseUnitFactor: true, attributes: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        eyebrow="Compras y abastecimiento"
        title="Nueva orden de compra"
        description="Captura los datos y productos en una sola pantalla. La orden se guardará como borrador para revisión."
        actions={
          <Link href="/purchasing/orders" className={buttonStyles({ variant: "secondary" })}>
            Órdenes de compra
          </Link>
        }
      />

      {sp.error && (
        <section className="surface border-[var(--danger)]/40 bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">{sp.error}</section>
      )}

      {(suppliers.length === 0 || warehouses.length === 0) && (
        <EmptyState
          compact
          title={suppliers.length === 0 ? "No hay proveedores activos" : "No hay almacenes activos"}
          description={
            suppliers.length === 0
              ? "Registra un proveedor antes de generar nuevas órdenes de compra."
              : "Registra un almacén activo antes de generar nuevas órdenes de compra."
          }
          actions={
            <Link
              href={suppliers.length === 0 ? "/purchasing/suppliers/new" : "/warehouse/new"}
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              {suppliers.length === 0 ? "Crear proveedor" : "Crear almacén"}
            </Link>
          }
        />
      )}

      <PurchaseOrderCreateForm
        action={createOrder}
        suppliers={suppliers}
        warehouses={warehouses}
        products={products.map((product) => ({
          id: product.id,
          code: product.sku,
          name: product.name,
          type: product.type,
          unitLabel: product.unitLabel,
          purchaseUnitLabel: product.purchaseUnitLabel,
          purchaseUnitFactor: product.purchaseUnitFactor,
          attributes: product.attributes,
        }))}
      />
    </div>
  );
}
