import type { PrismaClient, Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

interface StockResult {
  quantity: number;
  reserved: number;
  available: number;
}

interface TransferResult {
  from: StockResult;
  to: StockResult;
}

interface ReceiveOptions {
  notes?: string | null;
  referenceFilePath?: string | null;
  referenceFileName?: string | null;
  referenceFileMime?: string | null;
  referenceFileSize?: number | null;
  actor?: string | null;
  source?: string | null;
}

interface PickOptions {
  notes?: string | null;
  actor?: string | null;
  source?: string | null;
}

interface TransferOptions {
  notes?: string | null;
  fromLocationCode?: string | null;
  toLocationCode?: string | null;
  actor?: string | null;
  source?: string | null;
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

    return this.prisma.$transaction(async (tx) => {
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

      await tx.inventoryMovement.create({
        data: {
          productId,
          locationId,
          type: "IN",
          quantity: qty,
          reference: referenceValue,
          notes: options.notes ?? null,
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

      return { quantity: newQty, reserved, available };
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

    return this.prisma.$transaction(async (tx) => {
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

      await tx.inventoryMovement.create({
        data: {
          productId,
          locationId,
          type: "OUT",
          quantity: qty,
          reference: referenceValue,
          notes: options.notes ?? null,
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

      return { quantity: newQty, reserved: existing.reserved, available };
    });
  }

  async adjustStock(productId: string, locationId: string, deltaQty: number, reason: string): Promise<StockResult> {
    assertNonEmpty(productId, "PRODUCT_REQUIRED", "Product is required");
    assertNonEmpty(locationId, "LOCATION_REQUIRED", "Location is required");
    assertNumber(deltaQty, "INVALID_QTY", "Delta is invalid");
    if (deltaQty === 0) {
      throw new InventoryServiceError("INVALID_QTY", "Delta cannot be zero");
    }
    assertNonEmpty(reason, "INVALID_REASON", "Reason is required");

    return this.prisma.$transaction(async (tx) => {
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

      await tx.inventoryMovement.create({
        data: { productId, locationId, type: "ADJUSTMENT", quantity: deltaQty, notes: reason },
      });

      await this.writeAuditSafe(tx, {
        entityType: "INVENTORY",
        entityId: `${productId}:${locationId}`,
        action: "ADJUST_STOCK",
        before: JSON.stringify({ quantity: currentQty, reserved, available: currentQty - reserved }),
        after: JSON.stringify({ quantity: newQty, reserved, available }),
        actor: null,
        source: "inventory-service",
      });

      return { quantity: newQty, reserved, available };
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

    return this.prisma.$transaction(async (tx) => {
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

      await tx.inventoryMovement.create({
        data: {
          productId,
          locationId: fromLocationId,
          type: "TRANSFER",
          quantity: qty,
          reference: referenceValue,
          notes: options.notes ?? null,
          fromLocationCode: options.fromLocationCode ?? null,
          toLocationCode: options.toLocationCode ?? null,
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

      return {
        from: { quantity: newFromQty, reserved: fromInv.reserved, available: newFromAvailable },
        to: { quantity: newToQty, reserved: toReserved, available: newToAvailable },
      };
    });
  }
}

export default InventoryService;
