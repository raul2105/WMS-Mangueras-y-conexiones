class InventoryServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function assertNonEmpty(value, code, message) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InventoryServiceError(code, message);
  }
}

function assertNumber(value, code, message) {
  if (!Number.isFinite(value)) {
    throw new InventoryServiceError(code, message);
  }
}

class InventoryService {
  constructor(prisma) {
    if (!prisma) {
      throw new Error("InventoryService requires PrismaClient");
    }
    this.prisma = prisma;
  }

  async receiveStock(productId, locationId, qty, reference, options = {}) {
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
        select: { id: true, quantity: true, reserved: true },
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
          data: {
            productId,
            locationId,
            quantity: newQty,
            reserved: 0,
            available,
          },
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

      return { quantity: newQty, reserved, available };
    });
  }

  async pickStock(productId, locationId, qty, reference, options = {}) {
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

      return { quantity: newQty, reserved: existing.reserved, available };
    });
  }

  async adjustStock(productId, locationId, deltaQty, reason) {
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
          data: {
            productId,
            locationId,
            quantity: newQty,
            reserved: 0,
            available,
          },
        });
      }

      await tx.inventoryMovement.create({
        data: {
          productId,
          locationId,
          type: "ADJUSTMENT",
          quantity: deltaQty,
          notes: reason,
        },
      });

      return { quantity: newQty, reserved, available };
    });
  }
}

module.exports = {
  InventoryService,
  InventoryServiceError,
  default: InventoryService,
};
