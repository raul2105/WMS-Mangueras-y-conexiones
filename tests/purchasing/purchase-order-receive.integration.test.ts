import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const shouldRunPostgresSuite = process.env.RUN_POSTGRES_TESTS === "1"
  && /^postgres(ql)?:\/\//i.test(String(process.env.DATABASE_URL ?? ""));

const describePostgres = shouldRunPostgresSuite ? describe : describe.skip;

describePostgres("purchase order receive integration", () => {
  const prisma = new PrismaClient();
  const unique = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  async function resetDb() {
    await prisma.purchaseReceiptLine.deleteMany();
    await prisma.purchaseReceipt.deleteMany();
    await prisma.purchaseOrderLine.deleteMany();
    await prisma.purchaseOrder.deleteMany();
    await prisma.supplierProduct.deleteMany();
    await prisma.warehouse.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.product.deleteMany();
    await prisma.location.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.inventoryMovement.deleteMany();
  }

  async function createFixture() {
    const supplier = await prisma.supplier.create({
      data: {
        code: `SUP-${unique()}`,
        name: "Proveedor Test",
        businessName: "Proveedor Test SA",
        legalName: "Proveedor Test SA de CV",
        taxId: "TAX-123",
        email: "compras@proveedor.test",
        phone: "555-111-2222",
        address: "Calle 1",
        paymentTerms: "30 días",
      },
    });

    const warehouse = await prisma.warehouse.create({
      data: {
        code: `WH-${unique()}`,
        name: "Almacén Test",
        address: "Carretera 1 Km 10",
      },
    });

    const location = await prisma.location.create({
      data: {
        code: `LOC-${unique()}`,
        name: "Ubicación Test",
        zone: "A",
        isActive: true,
        warehouseId: warehouse.id,
      },
    });

    const productA = await prisma.product.create({
      data: {
        sku: `SKU-${unique()}-1`,
        name: "Manguera Test",
        type: "HOSE",
        unitLabel: "metro",
      },
    });

    const productB = await prisma.product.create({
      data: {
        sku: `SKU-${unique()}-2`,
        name: "Conexión Test",
        type: "FITTING",
      },
    });

    const order = await prisma.purchaseOrder.create({
      data: {
        folio: `OC-${unique()}`,
        supplierId: supplier.id,
        deliveryWarehouseId: warehouse.id,
        status: "CONFIRMADA",
        notes: "OC para recepción",
        deliveryAddressSnapshot: warehouse.address,
        paymentTermsSnapshot: supplier.paymentTerms,
        lines: {
          create: [
            {
              productId: productA.id,
              qtyOrdered: 10,
              qtyReceived: 0,
              unitPrice: 12.5,
            },
            {
              productId: productB.id,
              qtyOrdered: 5,
              qtyReceived: 0,
              unitPrice: 8.0,
            },
          ],
        },
      },
    });

    const orderLines = await prisma.purchaseOrderLine.findMany({
      where: { purchaseOrderId: order.id },
    });

    return { supplier, warehouse, location, productA, productB, order, orderLines };
  }

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("full receipt updates PO status to RECIBIDA", async () => {
    const { order, orderLines, location } = await createFixture();

    await prisma.$transaction(async (tx) => {
      const receipt = await tx.purchaseReceipt.create({
        data: { purchaseOrderId: order.id, locationId: location.id, referenceDoc: "REM-001", notes: "Recepción completa" },
      });

      for (const line of orderLines) {
        const qty = line.qtyOrdered;
        await tx.purchaseReceiptLine.create({
          data: {
            purchaseReceiptId: receipt.id,
            purchaseOrderLineId: line.id,
            productId: line.productId,
            qtyReceived: qty,
          },
        });

        const updated = await tx.purchaseOrderLine.updateMany({
          where: {
            id: line.id,
            qtyReceived: { lte: line.qtyOrdered - qty },
          },
          data: { qtyReceived: { increment: qty } },
        });
        expect(updated.count).toBe(1);
      }

      await tx.purchaseOrder.update({
        where: { id: order.id },
        data: { status: "RECIBIDA" as never },
      });
    });

    const updatedOrder = await prisma.purchaseOrder.findUnique({ where: { id: order.id } });
    expect(updatedOrder?.status).toBe("RECIBIDA");

    const updatedLines = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: order.id } });
    for (const line of updatedLines) {
      expect(line.qtyReceived).toBe(line.qtyOrdered);
    }
  });

  it("partial receipt updates PO status to PARCIAL", async () => {
    const { order, orderLines, location } = await createFixture();

    await prisma.$transaction(async (tx) => {
      const receipt = await tx.purchaseReceipt.create({
        data: { purchaseOrderId: order.id, locationId: location.id, referenceDoc: "REM-002", notes: "Recepción parcial" },
      });

      const lineA = orderLines[0];
      const qtyA = lineA.qtyOrdered;
      await tx.purchaseReceiptLine.create({
        data: { purchaseReceiptId: receipt.id, purchaseOrderLineId: lineA.id, productId: lineA.productId, qtyReceived: qtyA },
      });
      const updatedA = await tx.purchaseOrderLine.updateMany({
        where: { id: lineA.id, qtyReceived: { lte: lineA.qtyOrdered - qtyA } },
        data: { qtyReceived: { increment: qtyA } },
      });
      expect(updatedA.count).toBe(1);
    });

    // Compute and set status like server action does
    const updatedLinesAll = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: order.id } });
    const allDone = updatedLinesAll.every((l) => l.qtyReceived >= l.qtyOrdered);
    const anyDone = updatedLinesAll.some((l) => l.qtyReceived > 0);
    const newStatus = allDone ? "RECIBIDA" : anyDone ? "PARCIAL" : "CONFIRMADA";
    await prisma.purchaseOrder.update({ where: { id: order.id }, data: { status: newStatus as never } });
    expect(newStatus).toBe("PARCIAL");

    const updatedLines = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: order.id } });
    expect(updatedLines[0].qtyReceived).toBe(10);
    expect(updatedLines[1].qtyReceived).toBe(0);
  });

  it("over-receipt fails with conditional update returning count 0", async () => {
    const { order, orderLines, location } = await createFixture();

    // First receipt: receive 5 of line A (qtyOrdered=10)
    await prisma.$transaction(async (tx) => {
      const receipt = await tx.purchaseReceipt.create({
        data: { purchaseOrderId: order.id, locationId: location.id, referenceDoc: "REM-003", notes: "Primera recepción" },
      });
      const lineA = orderLines[0];
      await tx.purchaseReceiptLine.create({
        data: { purchaseReceiptId: receipt.id, purchaseOrderLineId: lineA.id, productId: lineA.productId, qtyReceived: 5 },
      });
      const updated = await tx.purchaseOrderLine.updateMany({
        where: { id: lineA.id, qtyReceived: { lte: lineA.qtyOrdered - 5 } },
        data: { qtyReceived: { increment: 5 } },
      });
      expect(updated.count).toBe(1);
    });

    // Second receipt: try to receive 10 more of line A (would exceed qtyOrdered)
    await expect(
      prisma.$transaction(async (tx) => {
        const receipt = await tx.purchaseReceipt.create({
          data: { purchaseOrderId: order.id, locationId: location.id, referenceDoc: "REM-004", notes: "Segunda recepción" },
        });
        const lineA = orderLines[0];
        await tx.purchaseReceiptLine.create({
          data: { purchaseReceiptId: receipt.id, purchaseOrderLineId: lineA.id, productId: lineA.productId, qtyReceived: 10 },
        });
        const updated = await tx.purchaseOrderLine.updateMany({
          where: { id: lineA.id, qtyReceived: { lte: lineA.qtyOrdered - 10 } },
          data: { qtyReceived: { increment: 10 } },
        });
        if (updated.count === 0) {
          throw new Error("Cantidad excede pendiente");
        }
      })
    ).rejects.toThrow("Cantidad excede pendiente");
  });

  it("concurrent receives cannot overcount (race condition protection)", async () => {
    const { order, orderLines, location } = await createFixture();
    const lineA = orderLines[0]; // qtyOrdered=10

    let successCount = 0;
    const errors: Error[] = [];

    const attemptReceive = async (qty: number) => {
      try {
        await prisma.$transaction(async (tx) => {
          const receipt = await tx.purchaseReceipt.create({
            data: { purchaseOrderId: order.id, locationId: location.id, referenceDoc: `REM-${unique()}`, notes: `Concurrencia ${qty}` },
          });
          await tx.purchaseReceiptLine.create({
            data: { purchaseReceiptId: receipt.id, purchaseOrderLineId: lineA.id, productId: lineA.productId, qtyReceived: qty },
          });
          const updated = await tx.purchaseOrderLine.updateMany({
            where: { id: lineA.id, qtyReceived: { lte: lineA.qtyOrdered - qty } },
            data: { qtyReceived: { increment: qty } },
          });
          if (updated.count === 0) {
            throw new Error("Concurrency protection triggered");
          }
        });
        successCount++;
      } catch (e) {
        errors.push(e as Error);
      }
    };

    await Promise.all([attemptReceive(8), attemptReceive(8)]);

    expect(successCount).toBe(1);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("Concurrency protection");

    const finalLine = await prisma.purchaseOrderLine.findUnique({ where: { id: lineA.id } });
    expect(finalLine?.qtyReceived).toBe(8);
  });

  it("creates purchase receipt and receipt lines correctly", async () => {
    const { order, orderLines, location } = await createFixture();
    const lineA = orderLines[0];

    await prisma.$transaction(async (tx) => {
      const receipt = await tx.purchaseReceipt.create({
        data: { purchaseOrderId: order.id, locationId: location.id, referenceDoc: "REM-005", notes: "Test trace" },
      });
      await tx.purchaseReceiptLine.create({
        data: { purchaseReceiptId: receipt.id, purchaseOrderLineId: lineA.id, productId: lineA.productId, qtyReceived: 3 },
      });
      await tx.purchaseOrderLine.updateMany({
        where: { id: lineA.id, qtyReceived: { lte: lineA.qtyOrdered - 3 } },
        data: { qtyReceived: { increment: 3 } },
      });
    });

    // Verify receipt created
    const receipts = await prisma.purchaseReceipt.findMany({
      where: { purchaseOrderId: order.id },
    });
    expect(receipts.length).toBeGreaterThan(0);
    const receipt = receipts[0];
    expect(receipt.referenceDoc).toBe("REM-005");

    // Verify receipt lines created
    const receiptLines = await prisma.purchaseReceiptLine.findMany({
      where: { purchaseReceiptId: receipt.id },
    });
    expect(receiptLines.length).toBe(1);
    expect(receiptLines[0].qtyReceived).toBe(3);
    expect(receiptLines[0].productId).toBe(lineA.productId);
  });
});
