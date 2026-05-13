import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { handleSalesRequest } from "@/lib/sync/handlers/handle-sales-request";

let prisma: PrismaClient;

async function resetDb() {
  await prisma.purchaseReceiptLine.deleteMany();
  await prisma.purchaseReceipt.deleteMany();
  await prisma.purchaseOrderLine.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.supplierProduct.deleteMany();
  await prisma.supplierBrand.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.salesInternalOrderPickTask.deleteMany();
  await prisma.salesInternalOrderPickList.deleteMany();
  await prisma.salesInternalOrderAssemblyConfig.deleteMany();
  await prisma.salesInternalOrderLine.deleteMany();
  await prisma.salesInternalOrder.deleteMany();
  await prisma.pickTask.deleteMany();
  await prisma.pickList.deleteMany();
  await prisma.assemblyWorkOrderLine.deleteMany();
  await prisma.assemblyWorkOrder.deleteMany();
  await prisma.assemblyConfiguration.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.productionOrderItem.deleteMany();
  await prisma.productionOrder.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.location.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.traceRecord.deleteMany();
  await prisma.syncEvent.deleteMany();
}

beforeAll(async () => {
  prisma = new PrismaClient();
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

describe("handleSalesRequest", () => {
  it("creates a structured MaterialRequest -> SalesInternalOrder link", async () => {
    const warehouse = await prisma.warehouse.create({
      data: {
        code: "MOB",
        name: "Mobile Warehouse",
        isActive: true,
      },
      select: { id: true, code: true },
    });

    const requestId = "mr-structured-001";
    const result = await handleSalesRequest({
      requestId,
      code: "SUR-20260512-ABC123",
      warehouseCode: warehouse.code,
      customerName: "Cliente móvil",
      dueDate: "2026-05-20T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    expect(result.localId).toBeTruthy();

    const order = await prisma.salesInternalOrder.findUnique({
      where: { id: result.localId! },
      select: {
        code: true,
        customerName: true,
        warehouseId: true,
        status: true,
        sourceMaterialRequestId: true,
        notes: true,
      },
    });

    expect(order).toMatchObject({
      code: "SUR-20260512-ABC123",
      customerName: "Cliente móvil",
      warehouseId: warehouse.id,
      status: "BORRADOR",
      sourceMaterialRequestId: requestId,
      notes: `Creado desde solicitud móvil ${requestId}`,
    });
  });

  it("returns the existing sales order when the same material request is retried", async () => {
    const warehouse = await prisma.warehouse.create({
      data: {
        code: "MOB2",
        name: "Mobile Warehouse 2",
        isActive: true,
      },
      select: { code: true },
    });

    const requestId = "mr-retry-001";
    const first = await handleSalesRequest({
      requestId,
      code: "SUR-20260512-AAA111",
      warehouseCode: warehouse.code,
      customerName: "Cliente retry",
      dueDate: "2026-05-21T00:00:00.000Z",
    });

    const second = await handleSalesRequest({
      requestId,
      code: "SUR-20260512-BBB222",
      warehouseCode: warehouse.code,
      customerName: "Cliente retry duplicado",
      dueDate: "2026-05-22T00:00:00.000Z",
    });

    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: true, localId: first.localId });

    const orders = await prisma.salesInternalOrder.findMany({
      where: { sourceMaterialRequestId: requestId },
      select: { id: true, code: true },
      orderBy: { createdAt: "asc" },
    });

    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      id: first.localId,
      code: "SUR-20260512-AAA111",
    });
  });
});
