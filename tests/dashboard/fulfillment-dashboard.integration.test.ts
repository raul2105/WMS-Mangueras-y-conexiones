import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

import { getFulfillmentDashboardSnapshot } from "@/lib/dashboard/fulfillment-dashboard";

const shouldRunPostgresSuite = process.env.RUN_POSTGRES_TESTS === "1"
  && /^postgres(ql)?:\/\//i.test(String(process.env.DATABASE_URL ?? ""));

const describePostgres = shouldRunPostgresSuite ? describe : describe.skip;

describePostgres("fulfillment dashboard snapshot integration (postgres)", () => {
  const prisma = new PrismaClient();
  const runId = `DBD-IT-${Date.now()}`;

  async function cleanupRunData() {
    await prisma.salesInternalOrderPickTask.deleteMany({
      where: { pickList: { order: { code: { contains: runId } } } },
    });
    await prisma.salesInternalOrderPickList.deleteMany({
      where: { order: { code: { contains: runId } } },
    });
    await prisma.salesInternalOrderLine.deleteMany({
      where: { order: { code: { contains: runId } } },
    });
    await prisma.salesInternalOrder.deleteMany({
      where: { code: { contains: runId } },
    });
    await prisma.productionOrder.deleteMany({
      where: { code: { contains: runId } },
    });
    await prisma.location.deleteMany({
      where: { code: { contains: runId } },
    });
    await prisma.warehouse.deleteMany({
      where: { code: { contains: runId } },
    });
    await prisma.product.deleteMany({
      where: { sku: { contains: runId } },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await cleanupRunData();
  });

  afterAll(async () => {
    await cleanupRunData();
    await prisma.$disconnect();
  });

  it("includes confirmed not-delivered orders in KPI queue", async () => {
    const warehouse = await prisma.warehouse.create({
      data: {
        code: `${runId}-WH-A`,
        name: `${runId} Warehouse A`,
        isActive: true,
      },
      select: { id: true },
    });
    await prisma.location.createMany({
      data: [
        {
          code: `${runId}-STG-A`,
          name: `${runId} Staging A`,
          usageType: "STAGING",
          warehouseId: warehouse.id,
          isActive: true,
        },
        {
          code: `${runId}-STO-A`,
          name: `${runId} Storage A`,
          usageType: "STORAGE",
          warehouseId: warehouse.id,
          isActive: true,
        },
      ],
    });
    const product = await prisma.product.create({
      data: {
        sku: `${runId}-SKU-A`,
        name: `${runId} Producto A`,
        type: "ACCESSORY",
      },
      select: { id: true },
    });

    const order = await prisma.salesInternalOrder.create({
      data: {
        code: `${runId}-SO-1`,
        status: "CONFIRMADA",
        customerName: "Cliente Dashboard 1",
        warehouseId: warehouse.id,
        dueDate: new Date("2026-05-09T10:00:00.000Z"),
        lines: {
          create: [
            {
              lineKind: "PRODUCT",
              productId: product.id,
              requestedQty: 3,
            },
          ],
        },
      },
      select: { id: true },
    });

    const snapshot = await getFulfillmentDashboardSnapshot({
      role: "SYSTEM_ADMIN",
      now: new Date("2026-05-10T10:00:00.000Z"),
      staleHours: 4,
    });

    const queueItem = snapshot.queue.find((row) => row.orderId === order.id);
    expect(snapshot.kpis.ordersToFulfill).toBeGreaterThan(0);
    expect(queueItem).toBeTruthy();
    expect(queueItem?.blockingCause).toBe("OVERDUE_UNRELEASED");
    expect(queueItem?.riskLevel).toBe("ALTO");
  });

  it("does not include delivered orders in open queue", async () => {
    const warehouse = await prisma.warehouse.create({
      data: {
        code: `${runId}-WH-B`,
        name: `${runId} Warehouse B`,
        isActive: true,
      },
      select: { id: true },
    });
    await prisma.location.createMany({
      data: [
        {
          code: `${runId}-STG-B`,
          name: `${runId} Staging B`,
          usageType: "STAGING",
          warehouseId: warehouse.id,
          isActive: true,
        },
        {
          code: `${runId}-STO-B`,
          name: `${runId} Storage B`,
          usageType: "STORAGE",
          warehouseId: warehouse.id,
          isActive: true,
        },
      ],
    });
    const product = await prisma.product.create({
      data: {
        sku: `${runId}-SKU-B`,
        name: `${runId} Producto B`,
        type: "ACCESSORY",
      },
      select: { id: true },
    });

    await prisma.salesInternalOrder.create({
      data: {
        code: `${runId}-SO-2`,
        status: "CONFIRMADA",
        customerName: "Cliente Dashboard 2",
        warehouseId: warehouse.id,
        dueDate: new Date("2026-05-10T10:00:00.000Z"),
        deliveredToCustomerAt: new Date("2026-05-10T12:00:00.000Z"),
        lines: {
          create: [
            {
              lineKind: "PRODUCT",
              productId: product.id,
              requestedQty: 1,
            },
          ],
        },
      },
    });

    const snapshot = await getFulfillmentDashboardSnapshot({
      role: "MANAGER",
      now: new Date("2026-05-10T13:00:00.000Z"),
      staleHours: 4,
    });

    const hasDeliveredInQueue = snapshot.queue.some((row) => row.orderCode === `${runId}-SO-2`);
    expect(hasDeliveredInQueue).toBe(false);
  });
});
