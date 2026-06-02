import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  buildPurchaseOrderDocumentSnapshot,
  ensurePurchaseOrderDocumentVersion,
  loadLatestPurchaseOrderDocument,
  parsePurchaseOrderDocumentSnapshot,
  updatePurchaseOrderStatusWithDocument,
} from "@/lib/purchasing/purchase-order-document-service";

const shouldRunPostgresSuite = process.env.RUN_POSTGRES_TESTS === "1"
  && /^postgres(ql)?:\/\//i.test(String(process.env.DATABASE_URL ?? ""));

const describePostgres = shouldRunPostgresSuite ? describe : describe.skip;

describePostgres("purchase order document service integration", () => {
  const prisma = new PrismaClient();
  const unique = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  async function resetDb() {
    await prisma.purchaseOrderDocument.deleteMany();
    await prisma.purchaseReceiptLine.deleteMany();
    await prisma.purchaseReceipt.deleteMany();
    await prisma.purchaseOrderLine.deleteMany();
    await prisma.purchaseOrder.deleteMany();
    await prisma.supplierProduct.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.product.deleteMany();
  }

  async function createFixture(options?: { unitPrice?: number | null }) {
    const supplier = await prisma.supplier.create({
      data: {
        code: `SUP-${unique()}`,
        name: "Proveedor Documento",
        businessName: "Proveedor Documento SA",
        legalName: "Proveedor Documento SA de CV",
        taxId: "TAX-123",
        email: "compras@proveedor.test",
        phone: "555-111-2222",
        address: "Calle 1",
      },
    });

    const productA = await prisma.product.create({
      data: {
        sku: `SKU-${unique()}-1`,
        name: "Manguera A",
        type: "HOSE",
        unitLabel: "metro",
      },
    });

    const productB = await prisma.product.create({
      data: {
        sku: `SKU-${unique()}-2`,
        name: "Conexión B",
        type: "FITTING",
      },
    });

    const order = await prisma.purchaseOrder.create({
      data: {
        folio: `OC-${unique()}`,
        supplierId: supplier.id,
        status: "BORRADOR",
        notes: "OC para snapshot",
        lines: {
          create: [
            {
              productId: productA.id,
              qtyOrdered: 4,
              qtyReceived: 1,
              unitPrice: options?.unitPrice ?? 12.5,
            },
            {
              productId: productB.id,
              qtyOrdered: 2,
              qtyReceived: 0,
              unitPrice: null,
            },
          ],
        },
      },
    });

    return { supplier, productA, productB, order };
  }

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("fails when purchase order does not exist", async () => {
    await expect(
      buildPurchaseOrderDocumentSnapshot({ purchaseOrderId: "missing-id", prismaClient: prisma }),
    ).rejects.toMatchObject({ code: "PURCHASE_ORDER_NOT_FOUND" });
  });

  it("fails when purchase order has no lines", async () => {
    const supplier = await prisma.supplier.create({
      data: {
        code: `SUP-${unique()}`,
        name: "Proveedor Vacío",
      },
    });
    const order = await prisma.purchaseOrder.create({
      data: {
        folio: `OC-${unique()}`,
        supplierId: supplier.id,
        status: "BORRADOR",
      },
    });

    await expect(
      buildPurchaseOrderDocumentSnapshot({ purchaseOrderId: order.id, prismaClient: prisma }),
    ).rejects.toMatchObject({ code: "PURCHASE_ORDER_HAS_NO_LINES" });
  });

  it("builds a deterministic snapshot with supplier, totals and pending quantities", async () => {
    const { order } = await createFixture();

    const snapshot = await buildPurchaseOrderDocumentSnapshot({
      purchaseOrderId: order.id,
      prismaClient: prisma,
    });

    expect(snapshot.purchaseOrder.folio).toBe(order.folio);
    expect(snapshot.purchaseOrder.status).toBe("BORRADOR");
    expect(snapshot.supplier.businessName).toBe("Proveedor Documento SA");
    expect(snapshot.lines).toHaveLength(2);
    expect(snapshot.lines[0].pendingQty).toBe(3);
    expect(snapshot.lines[0].currency).toBe("MXN");
    expect(snapshot.lines[1].unitPrice).toBe(0);
    expect(snapshot.lines[1].subtotal).toBe(0);
    expect(snapshot.totals.subtotal).toBeCloseTo(50);
    expect(snapshot.totals.total).toBeCloseTo(50);
    expect(snapshot.totals.currency).toBe("MXN");
    expect(snapshot.metadata.lineCount).toBe(2);
    expect(snapshot.metadata.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("creates version v1 once and keeps it idempotent", async () => {
    const { order } = await createFixture();

    const first = await ensurePurchaseOrderDocumentVersion({
      purchaseOrderId: order.id,
      prismaClient: prisma,
      createdForStatus: "CONFIRMADA",
    });

    const second = await ensurePurchaseOrderDocumentVersion({
      purchaseOrderId: order.id,
      prismaClient: prisma,
      createdForStatus: "CONFIRMADA",
    });

    const count = await prisma.purchaseOrderDocument.count({ where: { purchaseOrderId: order.id } });

    expect(first.versionNumber).toBe(1);
    expect(first.createdForStatus).toBe("CONFIRMADA");
    expect(second.id).toBe(first.id);
    expect(count).toBe(1);
  });

  it("freezes supplier and product data after live relations change", async () => {
    const { supplier, productA, order } = await createFixture({ unitPrice: 15 });

    await ensurePurchaseOrderDocumentVersion({
      purchaseOrderId: order.id,
      prismaClient: prisma,
      createdForStatus: "CONFIRMADA",
    });

    await prisma.supplier.update({
      where: { id: supplier.id },
      data: { businessName: "Proveedor Mutado" },
    });
    await prisma.product.update({
      where: { id: productA.id },
      data: { name: "Producto Mutado" },
    });

    const persisted = await loadLatestPurchaseOrderDocument({ purchaseOrderId: order.id, prismaClient: prisma });
    expect(persisted).toBeTruthy();
    const snapshot = parsePurchaseOrderDocumentSnapshot(persisted?.snapshotJson ?? "");
    expect(snapshot.supplier.businessName).toBe("Proveedor Documento SA");
    expect(snapshot.lines[0].name).toBe("Manguera A");
    expect(snapshot.lines[0].subtotal).toBeCloseTo(60);
  });

  it("confirms BORRADOR to CONFIRMADA creates one document v1", async () => {
    const { order } = await createFixture();

    const result = await updatePurchaseOrderStatusWithDocument({
      purchaseOrderId: order.id,
      newStatus: "CONFIRMADA",
      prismaClient: prisma,
    });

    expect(result).toEqual({ ok: true });

    const updated = await prisma.purchaseOrder.findUnique({
      where: { id: order.id },
      select: { status: true },
    });
    const documents = await prisma.purchaseOrderDocument.findMany({
      where: { purchaseOrderId: order.id },
      orderBy: { versionNumber: "asc" },
    });

    expect(updated?.status).toBe("CONFIRMADA");
    expect(documents).toHaveLength(1);
    expect(documents[0]?.versionNumber).toBe(1);
    expect(documents[0]?.createdForStatus).toBe("CONFIRMADA");
  });
});
