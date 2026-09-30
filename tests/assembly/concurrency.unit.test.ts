import { describe, expect, it, vi } from "vitest";
import { reserveInventoryInTx } from "@/lib/assembly/work-order-service";
import {
  claimAssemblyPickTaskInTx,
  claimAssemblyWorkOrderConfirmationInTx,
  confirmAssemblyPickTask,
} from "@/lib/assembly/picking-service";

vi.mock("@/lib/assembly/compatibility-guard", () => ({
  assertAssemblyOperationalCompatibility: vi.fn().mockResolvedValue({ status: "APPROVED" }),
}));
vi.mock("@/lib/labeling-service", () => ({ createMovementTraceAndLabelJob: vi.fn() }));
vi.mock("@/lib/audit-log", () => ({ createAuditLogSafeWithDb: vi.fn() }));

describe("assembly concurrency guards", () => {
  it("reserves against the inventory snapshot and records movement only after a successful CAS", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const createMovement = vi.fn().mockResolvedValue({ id: "movement-1" });
    const tx = {
      inventory: {
        findUnique: vi.fn().mockResolvedValue({
          id: "inventory-1",
          quantity: 10,
          reserved: 2,
          available: 8,
        }),
        updateMany,
      },
      inventoryMovement: { create: createMovement },
    } as never;

    await reserveInventoryInTx({
      tx,
      productId: "product-1",
      locationId: "location-1",
      qty: 5,
      reference: "ENS-1",
      documentType: "ASSEMBLY_ORDER",
      documentId: "order-1",
      documentLineId: "line-1",
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "inventory-1", quantity: 10, reserved: 2, available: 8 },
      data: { reserved: 7, available: 3 },
    });
    expect(createMovement).toHaveBeenCalledOnce();
  });

  it("rejects a stale inventory snapshot and writes no reservation movement", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const createMovement = vi.fn();
    const tx = {
      inventory: {
        findUnique: vi.fn().mockResolvedValue({
          id: "inventory-1",
          quantity: 10,
          reserved: 2,
          available: 8,
        }),
        updateMany,
      },
      inventoryMovement: { create: createMovement },
    } as never;

    await expect(reserveInventoryInTx({
      tx,
      productId: "product-1",
      locationId: "location-1",
      qty: 5,
      reference: "ENS-1",
      documentType: "ASSEMBLY_ORDER",
      documentId: "order-1",
      documentLineId: "line-1",
    })).rejects.toMatchObject({ code: "CONCURRENT_MODIFICATION" });
    expect(createMovement).not.toHaveBeenCalled();
  });

  it("claims a pick task with its prior state and refuses a second claim", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const tx = { pickTask: { updateMany } } as never;

    await expect(claimAssemblyPickTaskInTx({
      tx,
      task: { id: "task-1", status: "PENDING", pickedQty: 0, shortQty: 0 },
      next: { status: "COMPLETED", pickedQty: 4, shortQty: 0, shortReason: null },
    })).rejects.toMatchObject({ code: "CONCURRENT_PICK_CONFIRMATION" });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "task-1", status: "PENDING", pickedQty: 0, shortQty: 0 },
      data: { status: "COMPLETED", pickedQty: 4, shortQty: 0, shortReason: null },
    });
  });

  it("stores the terminal pick values as part of a successful claim", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = { pickTask: { updateMany } } as never;

    await claimAssemblyPickTaskInTx({
      tx,
      task: { id: "task-1", status: "IN_PROGRESS", pickedQty: 1, shortQty: 0 },
      next: { status: "PARTIAL", pickedQty: 3, shortQty: 1, shortReason: "FALTANTE" },
    });

    expect(updateMany).toHaveBeenCalledOnce();
  });

  it("serializes confirmations through the work-order updatedAt compare-and-swap", async () => {
    const updatedAt = new Date("2026-09-01T12:00:00.000Z");
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const tx = { assemblyWorkOrder: { updateMany } } as never;

    await expect(claimAssemblyWorkOrderConfirmationInTx({
      tx,
      assemblyWorkOrderId: "work-order-1",
      updatedAt,
    })).rejects.toMatchObject({ code: "CONCURRENT_PICK_CONFIRMATION" });

    const call = updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "work-order-1", updatedAt });
    expect(call.data.updatedAt.getTime()).toBeGreaterThan(updatedAt.getTime());
  });

  it("does not touch inventory when another request already claimed the same task", async () => {
    const inventoryFindUnique = vi.fn();
    const movementCreate = vi.fn();
    const pickTaskUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    const task = {
      id: "task-1",
      reservedQty: 4,
      pickedQty: 0,
      shortQty: 0,
      status: "PENDING",
      sourceLocationId: "source-1",
      targetWipLocationId: "wip-1",
      assemblyWorkOrderLineId: "line-1",
      pickListId: "pick-list-1",
      assemblyWorkOrderLine: {
        id: "line-1",
        productId: "product-1",
        requiredQty: 4,
        reservedQty: 4,
        pickedQty: 0,
        wipQty: 0,
        shortQty: 0,
        assemblyWorkOrderId: "work-order-1",
        assemblyWorkOrder: {
          id: "work-order-1",
          updatedAt: new Date("2026-09-01T12:00:00.000Z"),
          productionOrder: { id: "order-1", code: "ENS-1", sourceDocumentType: null, sourceDocumentId: null },
        },
      },
      pickList: { id: "pick-list-1", status: "RELEASED", assemblyWorkOrderId: "work-order-1" },
    };
    const tx = {
      pickTask: { findUnique: vi.fn().mockResolvedValue(task), updateMany: pickTaskUpdateMany },
      assemblyWorkOrder: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      inventory: { findUnique: inventoryFindUnique },
      inventoryMovement: { create: movementCreate },
    };
    const prisma = { $transaction: (run: (client: typeof tx) => Promise<unknown>) => run(tx) } as never;

    await expect(confirmAssemblyPickTask(prisma, { taskId: task.id, pickedQty: 4 }))
      .rejects.toMatchObject({ code: "CONCURRENT_PICK_CONFIRMATION" });

    expect(pickTaskUpdateMany).toHaveBeenCalledOnce();
    expect(inventoryFindUnique).not.toHaveBeenCalled();
    expect(movementCreate).not.toHaveBeenCalled();
  });

  it("rejects stale assembly-line totals instead of overwriting another task's progress", async () => {
    const lineUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    const task = {
      id: "task-1",
      reservedQty: 4,
      pickedQty: 0,
      shortQty: 0,
      status: "PENDING",
      sourceLocationId: "source-1",
      targetWipLocationId: "wip-1",
      assemblyWorkOrderLineId: "line-1",
      pickListId: "pick-list-1",
      assemblyWorkOrderLine: {
        id: "line-1",
        productId: "product-1",
        requiredQty: 4,
        reservedQty: 4,
        pickedQty: 0,
        wipQty: 0,
        shortQty: 0,
        assemblyWorkOrderId: "work-order-1",
        assemblyWorkOrder: {
          id: "work-order-1",
          updatedAt: new Date("2026-09-01T12:00:00.000Z"),
          productionOrder: { id: "order-1", code: "ENS-1", sourceDocumentType: null, sourceDocumentId: null },
        },
      },
      pickList: { id: "pick-list-1", status: "RELEASED", assemblyWorkOrderId: "work-order-1" },
    };
    const tx = {
      pickTask: {
        findUnique: vi.fn().mockResolvedValue(task),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      assemblyWorkOrder: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn() },
      assemblyWorkOrderLine: { updateMany: lineUpdateMany },
      inventory: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({ id: "source-inventory", quantity: 10, reserved: 4, available: 6 })
          .mockResolvedValueOnce({ id: "wip-inventory", quantity: 0, reserved: 0, available: 0 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      inventoryMovement: { create: vi.fn().mockResolvedValue({ id: "movement-1" }) },
      pickList: { update: vi.fn() },
    };
    const prisma = { $transaction: (run: (client: typeof tx) => Promise<unknown>) => run(tx) } as never;

    await expect(confirmAssemblyPickTask(prisma, { taskId: task.id, pickedQty: 4 }))
      .rejects.toMatchObject({ code: "CONCURRENT_PICK_CONFIRMATION" });

    expect(lineUpdateMany).toHaveBeenCalledWith({
      where: { id: "line-1", pickedQty: 0, wipQty: 0, shortQty: 0 },
      data: { pickedQty: 4, wipQty: 4, shortQty: 0, pickStatus: "COMPLETED", wipStatus: "IN_WIP" },
    });
  });
});
