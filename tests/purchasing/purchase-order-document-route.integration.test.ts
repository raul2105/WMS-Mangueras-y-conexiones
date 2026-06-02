import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { updatePurchaseOrderStatusWithDocument } from "@/lib/purchasing/purchase-order-document-service";

vi.mock("@/lib/rbac", () => ({
  requirePermission: vi.fn(async () => undefined),
}));

const shouldRunPostgresSuite = process.env.RUN_POSTGRES_TESTS === "1"
  && /^postgres(ql)?:\/\//i.test(String(process.env.DATABASE_URL ?? ""));

const describePostgres = shouldRunPostgresSuite ? describe : describe.skip;

describePostgres("purchase order document pdf route integration", () => {
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

  async function createFixture() {
    const supplier = await prisma.supplier.create({
      data: {
        code: `SUP-${unique()}`,
        name: "Proveedor PDF",
      },
    });
    const product = await prisma.product.create({
      data: {
        sku: `SKU-${unique()}`,
        name: "Producto PDF",
        type: "HOSE",
      },
    });
    const order = await prisma.purchaseOrder.create({
      data: {
        folio: `OC-${unique()}`,
        supplierId: supplier.id,
        status: "BORRADOR",
        lines: {
          create: [{
            productId: product.id,
            qtyOrdered: 2,
            qtyReceived: 0,
            unitPrice: 20,
          }],
        },
      },
      select: { id: true, folio: true },
    });

    await updatePurchaseOrderStatusWithDocument({
      purchaseOrderId: order.id,
      newStatus: "CONFIRMADA",
      prismaClient: prisma,
    });

    return { order };
  }

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns application/pdf and attachment filename", async () => {
    const { order } = await createFixture();
    const { GET } = await import("@/app/api/purchasing/orders/[id]/pdf/route");

    const response = await GET(new NextRequest(`http://localhost/api/purchasing/orders/${order.id}/pdf`), {
      params: { id: order.id },
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="OC-${order.folio}.pdf"`);

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Buffer.from(bytes).subarray(0, 4).toString("utf8")).toBe("%PDF");
  });

  it("fails cleanly when no official document exists", async () => {
    const supplier = await prisma.supplier.create({
      data: {
        code: `SUP-${unique()}`,
        name: "Proveedor Sin Doc",
      },
    });
    const product = await prisma.product.create({
      data: {
        sku: `SKU-${unique()}-missing`,
        name: "Producto",
        type: "HOSE",
      },
    });
    const order = await prisma.purchaseOrder.create({
      data: {
        folio: `OC-${unique()}`,
        supplierId: supplier.id,
        status: "CONFIRMADA",
        lines: {
          create: [{
            productId: product.id,
            qtyOrdered: 1,
            qtyReceived: 0,
            unitPrice: 10,
          }],
        },
      },
      select: { id: true },
    });

    const { GET } = await import("@/app/api/purchasing/orders/[id]/pdf/route");
    const response = await GET(new NextRequest(`http://localhost/api/purchasing/orders/${order.id}/pdf`), {
      params: { id: order.id },
    } as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Documento oficial no generado para esta orden de compra",
    });
  });

  it("does not create a new version on repeated PDF reads", async () => {
    const { order } = await createFixture();
    const { GET } = await import("@/app/api/purchasing/orders/[id]/pdf/route");

    await GET(new NextRequest(`http://localhost/api/purchasing/orders/${order.id}/pdf`), {
      params: { id: order.id },
    } as never);
    await GET(new NextRequest(`http://localhost/api/purchasing/orders/${order.id}/pdf`), {
      params: { id: order.id },
    } as never);

    const count = await prisma.purchaseOrderDocument.count({ where: { purchaseOrderId: order.id } });
    expect(count).toBe(1);
  });
});
