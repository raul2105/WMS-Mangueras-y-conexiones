import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { addGenericOrderItem, removeGenericOrderItem, transitionGenericOrderStatus, updateGenericOrderItemQty } from "@/lib/production/generic-order-service";
import { InventoryServiceError } from "@/lib/inventory-service";

let prisma: PrismaClient;

async function createGenericFixture() {
  const token = randomUUID().slice(0, 8).toUpperCase();
  const warehouse = await prisma.warehouse.create({
    data: { code: `WH-G77-${token}`, name: `Warehouse KAN-77 ${token}`, isActive: true },
  });

  const [locationA, locationB] = await Promise.all([
    prisma.location.create({
      data: {
        code: `LOC-G77-A-${token}`,
        name: `Location K77 A ${token}`,
        zone: "A",
        usageType: "STORAGE",
        isActive: true,
        warehouseId: warehouse.id,
      },
    }),
    prisma.location.create({
      data: {
        code: `LOC-G77-B-${token}`,
        name: `Location K77 B ${token}`,
        zone: "B",
        usageType: "STORAGE",
        isActive: true,
        warehouseId: warehouse.id,
      },
    }),
  ]);

  const [productA, productB] = await Promise.all([
    prisma.product.create({ data: { sku: `SKU-G77-A-${token}`, name: `Producto G77 A ${token}`, type: "ACCESSORY" } }),
    prisma.product.create({ data: { sku: `SKU-G77-B-${token}`, name: `Producto G77 B ${token}`, type: "ACCESSORY" } }),
  ]);

  await prisma.inventory.createMany({
    data: [
      { productId: productA.id, locationId: locationA.id, quantity: 50, reserved: 0, available: 50 },
      { productId: productB.id, locationId: locationB.id, quantity: 40, reserved: 0, available: 40 },
    ],
  });

  const order = await prisma.productionOrder.create({
    data: {
      code: `GEN-G77-001-${token}`,
      kind: "GENERIC",
      status: "BORRADOR",
      warehouseId: warehouse.id,
      priority: 3,
    },
  });

  return { warehouse, locationA, locationB, productA, productB, order };
}

beforeAll(async () => {
  prisma = new PrismaClient();
}, 180_000);

beforeEach(async () => {
  // Fixtures are tokenized per test to avoid global cleanup over AWS shared DB.
}, 30_000);

afterAll(async () => {
  await prisma.$disconnect();
}, 60_000);

describe("generic-order-service KAN-77", () => {
  it("reserves stock when transitioning BORRADOR -> ABIERTA", async () => {
    const { order, productA, locationA } = await createGenericFixture();

    await addGenericOrderItem(prisma, {
      orderId: order.id,
      productId: productA.id,
      locationId: locationA.id,
      quantity: 5,
    });

    await transitionGenericOrderStatus(prisma, { orderId: order.id, targetStatus: "ABIERTA" });

    const inventory = await prisma.inventory.findUniqueOrThrow({
      where: { productId_locationId: { productId: productA.id, locationId: locationA.id } },
    });

    expect(inventory.reserved).toBe(5);
    expect(inventory.available).toBe(45);
  });

  it("adjusts reservation by delta when editing qty on active order", async () => {
    const { order, productA, locationA } = await createGenericFixture();

    const item = await addGenericOrderItem(prisma, {
      orderId: order.id,
      productId: productA.id,
      locationId: locationA.id,
      quantity: 4,
    });

    await transitionGenericOrderStatus(prisma, { orderId: order.id, targetStatus: "ABIERTA" });

    await updateGenericOrderItemQty(prisma, { orderId: order.id, itemId: item.id, quantity: 9 });

    let inventory = await prisma.inventory.findUniqueOrThrow({
      where: { productId_locationId: { productId: productA.id, locationId: locationA.id } },
    });
    expect(inventory.reserved).toBe(9);
    expect(inventory.available).toBe(41);

    await updateGenericOrderItemQty(prisma, { orderId: order.id, itemId: item.id, quantity: 3 });

    inventory = await prisma.inventory.findUniqueOrThrow({
      where: { productId_locationId: { productId: productA.id, locationId: locationA.id } },
    });
    expect(inventory.reserved).toBe(3);
    expect(inventory.available).toBe(47);
  });

  it("releases reservation when removing an active line", async () => {
    const { order, productA, locationA } = await createGenericFixture();

    const item = await addGenericOrderItem(prisma, {
      orderId: order.id,
      productId: productA.id,
      locationId: locationA.id,
      quantity: 6,
    });

    await transitionGenericOrderStatus(prisma, { orderId: order.id, targetStatus: "ABIERTA" });

    await removeGenericOrderItem(prisma, { orderId: order.id, itemId: item.id });

    const inventory = await prisma.inventory.findUniqueOrThrow({
      where: { productId_locationId: { productId: productA.id, locationId: locationA.id } },
    });
    expect(inventory.reserved).toBe(0);
    expect(inventory.available).toBe(50);

    const itemCount = await prisma.productionOrderItem.count({ where: { orderId: order.id } });
    expect(itemCount).toBe(0);
  });

  it("cancels generic order and reconciles reservations in scoped pairs only", async () => {
    const { warehouse, order, productA, productB, locationA, locationB } = await createGenericFixture();

    await addGenericOrderItem(prisma, {
      orderId: order.id,
      productId: productA.id,
      locationId: locationA.id,
      quantity: 4,
    });
    await transitionGenericOrderStatus(prisma, { orderId: order.id, targetStatus: "ABIERTA" });

    const second = await prisma.productionOrder.create({
      data: {
        code: `GEN-G77-002-${randomUUID().slice(0, 8).toUpperCase()}`,
        kind: "GENERIC",
        status: "BORRADOR",
        warehouseId: warehouse.id,
      },
    });
    await addGenericOrderItem(prisma, {
      orderId: second.id,
      productId: productA.id,
      locationId: locationA.id,
      quantity: 3,
    });
    await transitionGenericOrderStatus(prisma, { orderId: second.id, targetStatus: "ABIERTA" });

    const unrelated = await prisma.productionOrder.create({
      data: {
        code: `GEN-G77-003-${randomUUID().slice(0, 8).toUpperCase()}`,
        kind: "GENERIC",
        status: "BORRADOR",
        warehouseId: warehouse.id,
      },
    });
    await addGenericOrderItem(prisma, {
      orderId: unrelated.id,
      productId: productB.id,
      locationId: locationB.id,
      quantity: 2,
    });
    await transitionGenericOrderStatus(prisma, { orderId: unrelated.id, targetStatus: "ABIERTA" });

    await transitionGenericOrderStatus(prisma, { orderId: order.id, targetStatus: "CANCELADA" });

    const [mainInv, otherInv] = await Promise.all([
      prisma.inventory.findUniqueOrThrow({ where: { productId_locationId: { productId: productA.id, locationId: locationA.id } } }),
      prisma.inventory.findUniqueOrThrow({ where: { productId_locationId: { productId: productB.id, locationId: locationB.id } } }),
    ]);

    expect(mainInv.reserved).toBe(3);
    expect(mainInv.available).toBe(47);
    expect(otherInv.reserved).toBe(2);
    expect(otherInv.available).toBe(38);
  });

  it("keeps reservation consistent under concurrent qty updates", async () => {
    const { order, productA, locationA } = await createGenericFixture();

    const item = await addGenericOrderItem(prisma, {
      orderId: order.id,
      productId: productA.id,
      locationId: locationA.id,
      quantity: 2,
    });

    await transitionGenericOrderStatus(prisma, { orderId: order.id, targetStatus: "ABIERTA" });

    const results = await Promise.allSettled([
      updateGenericOrderItemQty(prisma, { orderId: order.id, itemId: item.id, quantity: 6 }),
      updateGenericOrderItemQty(prisma, { orderId: order.id, itemId: item.id, quantity: 7 }),
    ]);

    const rejected = results.filter((row): row is PromiseRejectedResult => row.status === "rejected");
    if (rejected.length > 0) {
      const error = rejected[0].reason;
      if (error instanceof InventoryServiceError) {
        expect(["CONCURRENT_MODIFICATION", "INSUFFICIENT_AVAILABLE"]).toContain(error.code);
      }
    }

    const [dbItem, inventory] = await Promise.all([
      prisma.productionOrderItem.findUniqueOrThrow({ where: { id: item.id }, select: { quantity: true } }),
      prisma.inventory.findUniqueOrThrow({ where: { productId_locationId: { productId: productA.id, locationId: locationA.id } } }),
    ]);

    expect(inventory.reserved).toBe(dbItem.quantity);
    expect(inventory.available).toBe(inventory.quantity - dbItem.quantity);
  });

  it("completes GENERIC order with final consume and release", async () => {
    const { order, productA, locationA } = await createGenericFixture();

    const firstItem = await addGenericOrderItem(prisma, {
      orderId: order.id,
      productId: productA.id,
      locationId: locationA.id,
      quantity: 8,
    });
    await transitionGenericOrderStatus(prisma, { orderId: order.id, targetStatus: "ABIERTA" });
    await transitionGenericOrderStatus(prisma, { orderId: order.id, targetStatus: "COMPLETADA" });

    const [latest, inventory, completionMovements] = await Promise.all([
      prisma.productionOrder.findUniqueOrThrow({
        where: { id: order.id },
        select: { status: true },
      }),
      prisma.inventory.findUniqueOrThrow({
        where: { productId_locationId: { productId: productA.id, locationId: locationA.id } },
      }),
      prisma.inventoryMovement.findMany({
        where: {
          productId: productA.id,
          locationId: locationA.id,
          documentType: "PRODUCTION_ORDER_GENERIC",
          documentId: order.id,
          documentLineId: firstItem.id,
        },
        select: { type: true, quantity: true },
      }),
    ]);

    expect(latest.status).toBe("COMPLETADA");
    expect(inventory.quantity).toBe(42);
    expect(inventory.reserved).toBe(0);
    expect(inventory.available).toBe(42);
    expect(completionMovements.some((row) => row.type === "OUT" && row.quantity === 8)).toBe(true);
  }, 300_000);
});
