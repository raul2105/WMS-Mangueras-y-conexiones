import type { PrismaClient, Prisma } from "@prisma/client";
import { emitSyncEvent } from "@/lib/sync/sync-events";

type TxClient = Prisma.TransactionClient;

interface StockResult {
  quantity: number;
  reserved: number;
  available: number;
  movementId?: string;
}

interface TransferResult {
  from: StockResult;
  to: StockResult;
  movementId?: string;
}

interface ReceiveOptions {
  tx?: TxClient;
  notes?: string | null;
  referenceFilePath?: string | null;
  referenceFileName?: string | null;
  referenceFileMime?: string | null;
  referenceFileSize?: number | null;
  operatorName?: string | null;
  traceId?: string | null;
  documentType?: string | null;
  documentId?: string | null;
  documentLineId?: string | null;
  actor?: string | null;
  source?: string | null;
}

interface PickOptions {
  tx?: TxClient;
  notes?: string | null;
  operatorName?: string | null;
  traceId?: string | null;
  documentType?: string | null;
  documentId?: string | null;
  documentLineId?: string | null;
  actor?: string | null;
  source?: string | null;
}

interface TransferOptions {
  tx?: TxClient;
  notes?: string | null;
  fromLocationCode?: string | null;
  toLocationCode?: string | null;
  operatorName?: string | null;
  traceId?: string | null;
  documentType?: string | null;
  documentId?: string | null;
  documentLineId?: string | null;
  actor?: string | null;
  source?: string | null;
}

interface ReservationOptions {
  tx?: TxClient;
  notes?: string | null;
  actor?: string | null;
  source?: string | null;
  documentType?: string | null;
  documentId?: string | null;
  documentLineId?: string | null;
  reference?: string | null;
}

interface AuditData {
  entityType: string;
  entityId?: string | null;
  action: string;
  before?: string | null;
  after?: string | null;
  actor?: string | null;
  source?: string | null;
}

export class InventoryServiceError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.code = code;
    this.name = "InventoryServiceError";
  }
}

function assertNonEmpty(value: unknown, code: string, message: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InventoryServiceError(code, message);
  }
}

function assertNumber(value: unknown, code: string, message: string): asserts value is number {
  if (!Number.isFinite(value)) {
    throw new InventoryServiceError(code, message);
  }
}

export class InventoryService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    if (!prisma) {
      throw new Error("InventoryService requires PrismaClient");
    }
    this.prisma = prisma;
  }

  private async writeAuditSafe(tx: TxClient, data: AuditData): Promise<void> {
    try {
      await tx.auditLog.create({ data });
    } catch {
      // Keep warehouse operation alive even if audit table is not available yet.
    }
  }

  private withTransaction<T>(tx: TxClient | undefined, fn: (txClient: TxClient) => Promise<T>): Promise<T> {
    if (tx) {
      return fn(tx);
    }
    return this.prisma.$transaction((newTx) => fn(newTx));
  }

  async receiveStock(
    productId: string,
    locationId: string,
    qty: number,
    reference: string | null | undefined,
    options: ReceiveOptions = {}
  ): Promise<StockResult> {
    assertNonEmpty(productId, "PRODUCT_REQUIRED", "Product is required");
    assertNonEmpty(locationId, "LOCATION_REQUIRED", "Location is required");
    assertNumber(qty, "INVALID_QTY", "Quantity is invalid");
    if (qty <= 0) {
      throw new InventoryServiceError("INVALID_QTY", "Quantity must be greater than zero");
    }

    const referenceValue = typeof reference === "string" && reference.trim() ? reference.trim() : null;

    return this.withTransaction(options.tx, async (tx) => {
      const existing = await tx.inventory.findUnique({
        where: { productId_locationId: { productId, locationId } },
        select: { id: true, quantity: true, reserved: true, available: true },
      });

      const reserved = existing?.reserved ?? 0;
      const newQty = (existing?.quantity ?? 0) + qty;

      if (newQty < reserved) {
        throw new InventoryServiceError("RESERVED_EXCEEDS_QUANTITY", "Reserved exceeds quantity");
      }

      const available = newQty - reserved;

      if (existing) {
        await tx.inventory.update({
          where: { id: existing.id },
          data: { quantity: newQty, available },
        });
      } else {
        await tx.inventory.create({
          data: { productId, locationId, quantity: newQty, reserved: 0, available },
        });
      }

      const movement = await tx.inventoryMovement.create({
        select: { id: true },
        data: {
          productId,
          locationId,
          type: "IN",
          traceId: options.traceId ?? null,
          operatorName: options.operatorName ?? options.actor ?? null,
          quantity: qty,
          reference: referenceValue,
          notes: options.notes ?? null,
          documentType: options.documentType ?? null,
          documentId: options.documentId ?? null,
          documentLineId: options.documentLineId ?? null,
          referenceFilePath: options.referenceFilePath ?? null,
          referenceFileName: options.referenceFileName ?? null,
          referenceFileMime: options.referenceFileMime ?? null,
          referenceFileSize: options.referenceFileSize ?? null,
        },
      });

      await this.writeAuditSafe(tx, {
        entityType: "INVENTORY",
        entityId: `${productId}:${locationId}`,
        action: "RECEIVE_STOCK",
        before: JSON.stringify({ quantity: existing?.quantity ?? 0, reserved, available: existing?.available ?? 0 }),
        after: JSON.stringify({ quantity: newQty, reserved, available }),
        actor: options.actor ?? null,
        source: options.source ?? "inventory-service",
      });

      await emitSyncEvent({
        entityType: "INVENTORY",
        entityId: `${productId}:${locationId}`,
        action: "UPDATE",
        payload: { productId, locationId, quantity: newQty, reserved, available, movementId: movement.id },
      }, tx);

      return { quantity: newQty, reserved, available, movementId: movement.id };
    });
  }

  async pickStock(
    productId: string,
    locationId: string,
    qty: number,
    reference: string | null | undefined,
    options: PickOptions = {}
  ): Promise<StockResult> {
    assertNonEmpty(productId, "PRODUCT_REQUIRED", "Product is required");
    assertNonEmpty(locationId, "LOCATION_REQUIRED", "Location is required");
    assertNumber(qty, "INVALID_QTY", "Quantity is invalid");
    if (qty <= 0) {
      throw new InventoryServiceError("INVALID_QTY", "Quantity must be greater than zero");
    }

    const referenceValue = typeof reference === "string" && reference.trim() ? reference.trim() : null;

    return this.withTransaction(options.tx, async (tx) => {
      const existing = await tx.inventory.findUnique({
        where: { productId_locationId: { productId, locationId } },
        select: { id: true, quantity: true, reserved: true, available: true },
      });

      if (!existing) {
        throw new InventoryServiceError("INVENTORY_NOT_FOUND", "Inventory not found");
      }

      if (existing.available < qty) {
        throw new InventoryServiceError("INSUFFICIENT_AVAILABLE", "Insufficient available stock");
      }

      const newQty = existing.quantity - qty;
      if (newQty < existing.reserved) {
        throw new InventoryServiceError("RESERVED_EXCEEDS_QUANTITY", "Reserved exceeds quantity");
      }

      const available = newQty - existing.reserved;

      await tx.inventory.update({
        where: { id: existing.id },
        data: { quantity: newQty, available },
      });

      const movement = await tx.inventoryMovement.create({
        select: { id: true },
        data: {
          productId,
          locationId,
          type: "OUT",
          traceId: options.traceId ?? null,
          operatorName: options.operatorName ?? options.actor ?? null,
          quantity: qty,
          reference: referenceValue,
          notes: options.notes ?? null,
          documentType: options.documentType ?? null,
          documentId: options.documentId ?? null,
          documentLineId: options.documentLineId ?? null,
        },
      });

      await this.writeAuditSafe(tx, {
        entityType: "INVENTORY",
        entityId: `${productId}:${locationId}`,
        action: "PICK_STOCK",
        before: JSON.stringify({ quantity: existing.quantity, reserved: existing.reserved, available: existing.available }),
        after: JSON.stringify({ quantity: newQty, reserved: existing.reserved, available }),
        actor: options.actor ?? null,
        source: options.source ?? "inventory-service",
      });

      await emitSyncEvent({
        entityType: "INVENTORY",
        entityId: `${productId}:${locationId}`,
        action: "UPDATE",
        payload: { productId, locationId, quantity: newQty, reserved: existing.reserved, available, movementId: movement.id },
      }, tx);

      return { quantity: newQty, reserved: existing.reserved, available, movementId: movement.id };
    });
  }

  async adjustStock(
    productId: string,
    locationId: string,
    deltaQty: number,
    reason: string,
    options: PickOptions = {}
  ): Promise<StockResult> {
    assertNonEmpty(productId, "PRODUCT_REQUIRED", "Product is required");
    assertNonEmpty(locationId, "LOCATION_REQUIRED", "Location is required");
    assertNumber(deltaQty, "INVALID_QTY", "Delta is invalid");
    if (deltaQty === 0) {
      throw new InventoryServiceError("INVALID_QTY", "Delta cannot be zero");
    }
    assertNonEmpty(reason, "INVALID_REASON", "Reason is required");

    return this.withTransaction(options.tx, async (tx) => {
      const existing = await tx.inventory.findUnique({
        where: { productId_locationId: { productId, locationId } },
        select: { id: true, quantity: true, reserved: true },
      });

      if (!existing && deltaQty < 0) {
        throw new InventoryServiceError("NEGATIVE_STOCK", "Cannot reduce non-existing inventory");
      }

      const currentQty = existing?.quantity ?? 0;
      const reserved = existing?.reserved ?? 0;
      const newQty = currentQty + deltaQty;

      if (newQty < 0) {
        throw new InventoryServiceError("NEGATIVE_STOCK", "Resulting quantity cannot be negative");
      }

      if (newQty < reserved) {
        throw new InventoryServiceError("RESERVED_EXCEEDS_QUANTITY", "Reserved exceeds quantity");
      }

      const available = newQty - reserved;

      if (existing) {
        await tx.inventory.update({
          where: { id: existing.id },
          data: { quantity: newQty, available },
        });
      } else {
        await tx.inventory.create({
          data: { productId, locationId, quantity: newQty, reserved: 0, available },
        });
      }

      const movement = await tx.inventoryMovement.create({
        select: { id: true },
        data: {
          productId,
          locationId,
          type: "ADJUSTMENT",
          traceId: options.traceId ?? null,
          operatorName: options.operatorName ?? options.actor ?? null,
          quantity: deltaQty,
          notes: reason,
          documentType: options.documentType ?? null,
          documentId: options.documentId ?? null,
          documentLineId: options.documentLineId ?? null,
        },
      });

      await this.writeAuditSafe(tx, {
        entityType: "INVENTORY",
        entityId: `${productId}:${locationId}`,
        action: "ADJUST_STOCK",
        before: JSON.stringify({ quantity: currentQty, reserved, available: currentQty - reserved }),
        after: JSON.stringify({ quantity: newQty, reserved, available }),
        actor: options.actor ?? null,
        source: options.source ?? "inventory-service",
      });

      await emitSyncEvent({
        entityType: "INVENTORY",
        entityId: `${productId}:${locationId}`,
        action: "UPDATE",
        payload: { productId, locationId, quantity: newQty, reserved, available, movementId: movement.id },
      }, tx);

      return { quantity: newQty, reserved, available, movementId: movement.id };
    });
  }

  async transferStock(
    productId: string,
    fromLocationId: string,
    toLocationId: string,
    qty: number,
    reference: string | null | undefined,
    options: TransferOptions = {}
  ): Promise<TransferResult> {
    assertNonEmpty(productId, "PRODUCT_REQUIRED", "Product is required");
    assertNonEmpty(fromLocationId, "FROM_LOCATION_REQUIRED", "From location is required");
    assertNonEmpty(toLocationId, "TO_LOCATION_REQUIRED", "To location is required");
    assertNumber(qty, "INVALID_QTY", "Quantity is invalid");
    if (qty <= 0) {
      throw new InventoryServiceError("INVALID_QTY", "Quantity must be greater than zero");
    }
    if (fromLocationId === toLocationId) {
      throw new InventoryServiceError("INVALID_TRANSFER", "Source and destination cannot be equal");
    }

    const referenceValue = typeof reference === "string" && reference.trim() ? reference.trim() : null;

    return this.withTransaction(options.tx, async (tx) => {
      const fromInv = await tx.inventory.findUnique({
        where: { productId_locationId: { productId, locationId: fromLocationId } },
        select: { id: true, quantity: true, reserved: true, available: true },
      });

      if (!fromInv || fromInv.available < qty) {
        throw new InventoryServiceError("INSUFFICIENT_AVAILABLE", "Insufficient available stock in source");
      }

      const toInv = await tx.inventory.findUnique({
        where: { productId_locationId: { productId, locationId: toLocationId } },
        select: { id: true, quantity: true, reserved: true },
      });

      const newFromQty = fromInv.quantity - qty;
      const newFromAvailable = newFromQty - fromInv.reserved;
      await tx.inventory.update({
        where: { id: fromInv.id },
        data: { quantity: newFromQty, available: newFromAvailable },
      });

      const toReserved = toInv?.reserved ?? 0;
      const newToQty = (toInv?.quantity ?? 0) + qty;
      const newToAvailable = newToQty - toReserved;

      if (toInv) {
        await tx.inventory.update({
          where: { id: toInv.id },
          data: { quantity: newToQty, available: newToAvailable },
        });
      } else {
        await tx.inventory.create({
          data: { productId, locationId: toLocationId, quantity: newToQty, reserved: 0, available: newToQty },
        });
      }

      const movement = await tx.inventoryMovement.create({
        select: { id: true },
        data: {
          productId,
          locationId: fromLocationId,
          type: "TRANSFER",
          traceId: options.traceId ?? null,
          operatorName: options.operatorName ?? options.actor ?? null,
          quantity: qty,
          reference: referenceValue,
          notes: options.notes ?? null,
          fromLocationCode: options.fromLocationCode ?? null,
          toLocationCode: options.toLocationCode ?? null,
          documentType: options.documentType ?? null,
          documentId: options.documentId ?? null,
          documentLineId: options.documentLineId ?? null,
        },
      });

      await this.writeAuditSafe(tx, {
        entityType: "INVENTORY",
        entityId: `${productId}:${fromLocationId}->${toLocationId}`,
        action: "TRANSFER_STOCK",
        before: JSON.stringify({
          from: { quantity: fromInv.quantity, reserved: fromInv.reserved, available: fromInv.available },
          to: { quantity: toInv?.quantity ?? 0, reserved: toReserved, available: (toInv?.quantity ?? 0) - toReserved },
        }),
        after: JSON.stringify({
          from: { quantity: newFromQty, reserved: fromInv.reserved, available: newFromAvailable },
          to: { quantity: newToQty, reserved: toReserved, available: newToAvailable },
          quantity: qty,
        }),
        actor: options.actor ?? null,
        source: options.source ?? "inventory-service",
      });

      await emitSyncEvent({
        entityType: "INVENTORY",
        entityId: `${productId}:${fromLocationId}`,
        action: "UPDATE",
        payload: { productId, locationId: fromLocationId, quantity: newFromQty, reserved: fromInv.reserved, available: newFromAvailable },
      }, tx);
      await emitSyncEvent({
        entityType: "INVENTORY",
        entityId: `${productId}:${toLocationId}`,
        action: "UPDATE",
        payload: { productId, locationId: toLocationId, quantity: newToQty, reserved: toReserved, available: newToAvailable },
      }, tx);

      return {
        from: { quantity: newFromQty, reserved: fromInv.reserved, available: newFromAvailable },
        to: { quantity: newToQty, reserved: toReserved, available: newToAvailable },
        movementId: movement.id,
      };
    });
  }

  async reserveStock(
    productId: string,
    locationId: string,
    qty: number,
    options: ReservationOptions = {}
  ): Promise<StockResult> {
    assertNonEmpty(productId, "PRODUCT_REQUIRED", "Product is required");
    assertNonEmpty(locationId, "LOCATION_REQUIRED", "Location is required");
    assertNumber(qty, "INVALID_QTY", "Quantity is invalid");
    if (qty <= 0) {
      throw new InventoryServiceError("INVALID_QTY", "Quantity must be greater than zero");
    }

    return this.withTransaction(options.tx, async (tx) => {
      const existing = await tx.inventory.findUnique({
        where: { productId_locationId: { productId, locationId } },
        select: { id: true, quantity: true, reserved: true, available: true },
      });
      if (!existing) {
        throw new InventoryServiceError("INVENTORY_NOT_FOUND", "Inventory not found");
      }
      if (existing.available < qty) {
        throw new InventoryServiceError("INSUFFICIENT_AVAILABLE", "Insufficient available stock");
      }

      const newReserved = existing.reserved + qty;
      const newAvailable = existing.quantity - newReserved;
      await tx.inventory.update({
        where: { id: existing.id },
        data: { reserved: newReserved, available: newAvailable },
      });

      await tx.inventoryMovement.create({
        select: { id: true },
        data: {
          productId,
          locationId,
          type: "ADJUSTMENT",
          quantity: 0,
          reference: options.reference ?? null,
          notes: options.notes ?? "Reserva para orden operativa",
          documentType: options.documentType ?? null,
          documentId: options.documentId ?? null,
          documentLineId: options.documentLineId ?? null,
        },
      });

      await this.writeAuditSafe(tx, {
        entityType: "INVENTORY",
        entityId: `${productId}:${locationId}`,
        action: "RESERVE_STOCK",
        before: JSON.stringify({ quantity: existing.quantity, reserved: existing.reserved, available: existing.available }),
        after: JSON.stringify({ quantity: existing.quantity, reserved: newReserved, available: newAvailable }),
        actor: options.actor ?? null,
        source: options.source ?? "inventory-service",
      });

      await emitSyncEvent({
        entityType: "INVENTORY",
        entityId: `${productId}:${locationId}`,
        action: "UPDATE",
        payload: { productId, locationId, quantity: existing.quantity, reserved: newReserved, available: newAvailable },
      }, tx);

      return { quantity: existing.quantity, reserved: newReserved, available: newAvailable };
    });
  }

  async releaseReservedStock(
    productId: string,
    locationId: string,
    qty: number,
    options: ReservationOptions = {}
  ): Promise<StockResult> {
    assertNonEmpty(productId, "PRODUCT_REQUIRED", "Product is required");
    assertNonEmpty(locationId, "LOCATION_REQUIRED", "Location is required");
    assertNumber(qty, "INVALID_QTY", "Quantity is invalid");
    if (qty <= 0) {
      throw new InventoryServiceError("INVALID_QTY", "Quantity must be greater than zero");
    }

    return this.withTransaction(options.tx, async (tx) => {
      const existing = await tx.inventory.findUnique({
        where: { productId_locationId: { productId, locationId } },
        select: { id: true, quantity: true, reserved: true, available: true },
      });
      if (!existing) {
        throw new InventoryServiceError("INVENTORY_NOT_FOUND", "Inventory not found");
      }
      if (existing.reserved < qty) {
        throw new InventoryServiceError("INSUFFICIENT_RESERVED", "Reserved stock is insufficient");
      }

      const newReserved = existing.reserved - qty;
      const newAvailable = existing.quantity - newReserved;
      await tx.inventory.update({
        where: { id: existing.id },
        data: { reserved: newReserved, available: newAvailable },
      });

      await tx.inventoryMovement.create({
        select: { id: true },
        data: {
          productId,
          locationId,
          type: "ADJUSTMENT",
          quantity: 0,
          reference: options.reference ?? null,
          notes: options.notes ?? "Liberacion de reserva operativa",
          documentType: options.documentType ?? null,
          documentId: options.documentId ?? null,
          documentLineId: options.documentLineId ?? null,
        },
      });

      await this.writeAuditSafe(tx, {
        entityType: "INVENTORY",
        entityId: `${productId}:${locationId}`,
        action: "RELEASE_RESERVED_STOCK",
        before: JSON.stringify({ quantity: existing.quantity, reserved: existing.reserved, available: existing.available }),
        after: JSON.stringify({ quantity: existing.quantity, reserved: newReserved, available: newAvailable }),
        actor: options.actor ?? null,
        source: options.source ?? "inventory-service",
      });

      await emitSyncEvent({
        entityType: "INVENTORY",
        entityId: `${productId}:${locationId}`,
        action: "UPDATE",
        payload: { productId, locationId, quantity: existing.quantity, reserved: newReserved, available: newAvailable },
      }, tx);

      return { quantity: existing.quantity, reserved: newReserved, available: newAvailable };
    });
  }

  async moveReservedStockToLocation(
    productId: string,
    fromLocationId: string,
    toLocationId: string,
    qty: number,
    options: TransferOptions & ReservationOptions = {}
  ): Promise<TransferResult> {
    assertNonEmpty(productId, "PRODUCT_REQUIRED", "Product is required");
    assertNonEmpty(fromLocationId, "FROM_LOCATION_REQUIRED", "From location is required");
    assertNonEmpty(toLocationId, "TO_LOCATION_REQUIRED", "To location is required");
    assertNumber(qty, "INVALID_QTY", "Quantity is invalid");
    if (qty <= 0) {
      throw new InventoryServiceError("INVALID_QTY", "Quantity must be greater than zero");
    }
    if (fromLocationId === toLocationId) {
      throw new InventoryServiceError("INVALID_TRANSFER", "Source and destination cannot be equal");
    }

    return this.withTransaction(options.tx, async (tx) => {
      const fromInv = await tx.inventory.findUnique({
        where: { productId_locationId: { productId, locationId: fromLocationId } },
        select: { id: true, quantity: true, reserved: true, available: true },
      });
      if (!fromInv) {
        throw new InventoryServiceError("INVENTORY_NOT_FOUND", "Source inventory not found");
      }
      if (fromInv.reserved < qty) {
        throw new InventoryServiceError("INSUFFICIENT_RESERVED", "Reserved stock is insufficient in source");
      }
      if (fromInv.quantity < qty) {
        throw new InventoryServiceError("INSUFFICIENT_STOCK", "Source quantity is insufficient");
      }

      const toInv = await tx.inventory.findUnique({
        where: { productId_locationId: { productId, locationId: toLocationId } },
        select: { id: true, quantity: true, reserved: true },
      });

      const newFromQty = fromInv.quantity - qty;
      const newFromReserved = fromInv.reserved - qty;
      const newFromAvailable = newFromQty - newFromReserved;
      await tx.inventory.update({
        where: { id: fromInv.id },
        data: { quantity: newFromQty, reserved: newFromReserved, available: newFromAvailable },
      });

      const toReserved = toInv?.reserved ?? 0;
      const newToQty = (toInv?.quantity ?? 0) + qty;
      const newToAvailable = newToQty - toReserved;
      if (toInv) {
        await tx.inventory.update({
          where: { id: toInv.id },
          data: { quantity: newToQty, available: newToAvailable },
        });
      } else {
        await tx.inventory.create({
          data: { productId, locationId: toLocationId, quantity: newToQty, reserved: 0, available: newToQty },
        });
      }

      await tx.inventoryMovement.create({
        select: { id: true },
        data: {
          productId,
          locationId: fromLocationId,
          type: "TRANSFER",
          quantity: qty,
          reference: options.reference ?? null,
          notes: options.notes ?? null,
          fromLocationCode: options.fromLocationCode ?? null,
          toLocationCode: options.toLocationCode ?? null,
          documentType: options.documentType ?? null,
          documentId: options.documentId ?? null,
          documentLineId: options.documentLineId ?? null,
        },
      });

      await this.writeAuditSafe(tx, {
        entityType: "INVENTORY",
        entityId: `${productId}:${fromLocationId}->${toLocationId}`,
        action: "MOVE_RESERVED_STOCK_TO_LOCATION",
        before: JSON.stringify({
          from: { quantity: fromInv.quantity, reserved: fromInv.reserved, available: fromInv.available },
          to: { quantity: toInv?.quantity ?? 0, reserved: toReserved, available: (toInv?.quantity ?? 0) - toReserved },
        }),
        after: JSON.stringify({
          from: { quantity: newFromQty, reserved: newFromReserved, available: newFromAvailable },
          to: { quantity: newToQty, reserved: toReserved, available: newToAvailable },
          quantity: qty,
        }),
        actor: options.actor ?? null,
        source: options.source ?? "inventory-service",
      });

      await emitSyncEvent({
        entityType: "INVENTORY",
        entityId: `${productId}:${fromLocationId}`,
        action: "UPDATE",
        payload: { productId, locationId: fromLocationId, quantity: newFromQty, reserved: newFromReserved, available: newFromAvailable },
      }, tx);
      await emitSyncEvent({
        entityType: "INVENTORY",
        entityId: `${productId}:${toLocationId}`,
        action: "UPDATE",
        payload: { productId, locationId: toLocationId, quantity: newToQty, reserved: toReserved, available: newToAvailable },
      }, tx);

      return {
        from: { quantity: newFromQty, reserved: newFromReserved, available: newFromAvailable },
        to: { quantity: newToQty, reserved: toReserved, available: newToAvailable },
      };
    });
  }

  async consumeFromLocation(
    productId: string,
    locationId: string,
    qty: number,
    reference: string | null | undefined,
    options: PickOptions & ReservationOptions = {}
  ): Promise<StockResult> {
    assertNonEmpty(productId, "PRODUCT_REQUIRED", "Product is required");
    assertNonEmpty(locationId, "LOCATION_REQUIRED", "Location is required");
    assertNumber(qty, "INVALID_QTY", "Quantity is invalid");
    if (qty <= 0) {
      throw new InventoryServiceError("INVALID_QTY", "Quantity must be greater than zero");
    }

    const referenceValue = typeof reference === "string" && reference.trim() ? reference.trim() : null;
    return this.withTransaction(options.tx, async (tx) => {
      const existing = await tx.inventory.findUnique({
        where: { productId_locationId: { productId, locationId } },
        select: { id: true, quantity: true, reserved: true, available: true },
      });
      if (!existing) {
        throw new InventoryServiceError("INVENTORY_NOT_FOUND", "Inventory not found");
      }
      if (existing.quantity < qty) {
        throw new InventoryServiceError("INSUFFICIENT_STOCK", "Insufficient stock quantity");
      }

      const newQty = existing.quantity - qty;
      if (newQty < existing.reserved) {
        throw new InventoryServiceError("RESERVED_EXCEEDS_QUANTITY", "Reserved exceeds quantity");
      }
      const newAvailable = newQty - existing.reserved;
      await tx.inventory.update({
        where: { id: existing.id },
        data: { quantity: newQty, available: newAvailable },
      });

      await tx.inventoryMovement.create({
        data: {
          productId,
          locationId,
          type: "OUT",
          traceId: options.traceId ?? null,
          operatorName: options.operatorName ?? options.actor ?? null,
          quantity: qty,
          reference: referenceValue,
          notes: options.notes ?? "Consumo operativo",
          documentType: options.documentType ?? null,
          documentId: options.documentId ?? null,
          documentLineId: options.documentLineId ?? null,
        },
      });

      await this.writeAuditSafe(tx, {
        entityType: "INVENTORY",
        entityId: `${productId}:${locationId}`,
        action: "CONSUME_FROM_LOCATION",
        before: JSON.stringify({ quantity: existing.quantity, reserved: existing.reserved, available: existing.available }),
        after: JSON.stringify({ quantity: newQty, reserved: existing.reserved, available: newAvailable }),
        actor: options.actor ?? null,
        source: options.source ?? "inventory-service",
      });

      await emitSyncEvent({
        entityType: "INVENTORY",
        entityId: `${productId}:${locationId}`,
        action: "UPDATE",
        payload: { productId, locationId, quantity: newQty, reserved: existing.reserved, available: newAvailable },
      }, tx);

      return { quantity: newQty, reserved: existing.reserved, available: newAvailable };
    });
  }
}

export default InventoryService;

