import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createSalesRequestDraftHeader } from "@/lib/sales/request-service";

const shouldRunPostgresSuite = process.env.RUN_POSTGRES_TESTS === "1"
  && /^postgres(ql)?:\/\//i.test(String(process.env.DATABASE_URL ?? ""));

const describePostgres = shouldRunPostgresSuite ? describe : describe.skip;

describePostgres("postgres customer-order integration", () => {
  const prisma = new PrismaClient();
  const createdOrderIds: string[] = [];
  const createdCustomerIds: string[] = [];
  let warehouseId = "";
  const runId = `E2E-CUST-${Date.now()}`;

  beforeAll(async () => {
    await prisma.$connect();
    const client = prisma as any;
    if (!client.customer?.create || !client.salesInternalOrder?.create) {
      throw new Error("Prisma client no incluye modelo Customer/SalesInternalOrder. Ejecuta: npm run prisma:generate:aws");
    }

    const warehouse = await client.warehouse.create({
      data: {
        code: `${runId}-WH`,
        name: `${runId} Warehouse`,
        isActive: true,
      },
      select: { id: true },
    });
    warehouseId = warehouse.id;
  });

  afterAll(async () => {
    const client = prisma as any;
    if (createdOrderIds.length > 0) {
      await client.salesInternalOrder.deleteMany({
        where: { id: { in: createdOrderIds } },
      });
    }
    if (createdCustomerIds.length > 0) {
      await client.customer.deleteMany({
        where: { id: { in: createdCustomerIds } },
      });
    }
    if (warehouseId) {
      await client.warehouse.deleteMany({ where: { id: warehouseId } });
    }
    await prisma.$disconnect();
  });

  it("persists customerId + customerName snapshot when customerId is selected", async () => {
    const client = prisma as any;
    const customer = await client.customer.create({
      data: {
        code: `${runId}-C1`,
        name: "Cliente Snapshot Uno",
        isActive: true,
      },
      select: { id: true, name: true },
    });
    createdCustomerIds.push(customer.id);

    const created = await createSalesRequestDraftHeader(prisma, {
      customerId: customer.id,
      warehouseId,
      dueDate: new Date("2026-05-10T00:00:00.000Z"),
      notes: "order with formal customer",
    });
    createdOrderIds.push(created.id);

    const saved = await client.salesInternalOrder.findUnique({
      where: { id: created.id },
      select: { customerId: true, customerName: true },
    });

    expect(saved?.customerId).toBe(customer.id);
    expect(saved?.customerName).toBe(customer.name);
  });

  it("supports historical fallback without customerId", async () => {
    const created = await createSalesRequestDraftHeader(prisma, {
      customerName: "Cliente Histórico Legacy",
      warehouseId,
      dueDate: new Date("2026-05-11T00:00:00.000Z"),
      notes: "fallback without customerId",
    });
    createdOrderIds.push(created.id);

    const saved = await (prisma as any).salesInternalOrder.findUnique({
      where: { id: created.id },
      select: { customerId: true, customerName: true },
    });

    expect(saved?.customerId).toBeNull();
    expect(saved?.customerName).toBe("Cliente Histórico Legacy");
  });

  it("rejects nonexistent or inactive customerId", async () => {
    const client = prisma as any;

    await expect(
      createSalesRequestDraftHeader(prisma, {
        customerId: "missing-customer-id",
        warehouseId,
        dueDate: new Date("2026-05-12T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      code: "CUSTOMER_NOT_FOUND",
    });

    const inactive = await client.customer.create({
      data: {
        code: `${runId}-C2`,
        name: "Cliente Inactivo",
        isActive: false,
      },
      select: { id: true },
    });
    createdCustomerIds.push(inactive.id);

    await expect(
      createSalesRequestDraftHeader(prisma, {
        customerId: inactive.id,
        warehouseId,
        dueDate: new Date("2026-05-13T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      code: "CUSTOMER_INACTIVE",
    });
  });
});

