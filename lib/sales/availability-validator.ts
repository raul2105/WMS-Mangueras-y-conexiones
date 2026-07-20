import type { Prisma, PrismaClient } from "@prisma/client";
import {
  CommercialAvailabilityPromise,
  CommercialPromiseStatus,
  getCommercialPromiseStaleThresholdMinutes,
} from "@/lib/sales/availability-promise";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Server-side availability check for a specific product/warehouse combination.
 * Returns the current available quantity at the time of check.
 */
export interface CurrentAvailabilityCheck {
  productId: string;
  warehouseId: string;
  availableQuantity: number;
  checkedAt: string;
}

/**
 * Check current available quantity for a product in a specific warehouse.
 * This queries the inventory at STORAGE locations within the warehouse.
 */
export async function checkCurrentAvailability(
  db: Db,
  productId: string,
  warehouseId: string
): Promise<CurrentAvailabilityCheck> {
  const inventoryRows = await db.inventory.findMany({
    where: {
      productId,
      available: { gt: 0 },
      location: {
        warehouseId,
        isActive: true,
        usageType: "STORAGE",
      },
    },
    select: {
      available: true,
    },
  });

  const availableQuantity = inventoryRows.reduce((sum, row) => sum + row.available, 0);

  return {
    productId,
    warehouseId,
    availableQuantity,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Validate a commercial promise against current availability.
 * Returns the current status and whether the promise is still valid.
 */
export interface PromiseValidationResult {
  /** The computed promise status */
  status: CommercialPromiseStatus;
  /** Current available quantity */
  currentAvailable: number;
  /** Whether the promise is considered valid for commitment */
  isPromiseValid: boolean;
  /** The promise data if provided, or null */
  promise: CommercialAvailabilityPromise | null;
  /** Human-readable reason */
  reason: string;
  /** Timestamp of validation */
  validatedAt: string;
}

/**
 * Validate a commercial availability promise against current inventory.
 *
 * @param db - Database client
 * @param promise - The promise to validate (can be null)
 * @param requestedQuantity - Quantity being requested in the order (may differ from promise.requestedQuantity)
 * @param opts - Options including staleness threshold
 *
 * Returns validation result with current status and whether it's safe to commit.
 */
export async function validateCommercialPromise(
  db: Db,
  promise: CommercialAvailabilityPromise | null,
  requestedQuantity: number,
  opts?: { staleThresholdMinutes?: number }
): Promise<PromiseValidationResult> {
  const validatedAt = new Date().toISOString();

  // No promise = unresolved
  if (!promise) {
    return {
      status: "unresolved",
      currentAvailable: 0,
      isPromiseValid: false,
      promise: null,
      reason: "No hay contexto de disponibilidad. Verifique disponibilidad antes de confirmar.",
      validatedAt,
    };
  }

  // Check current availability
  const current = await checkCurrentAvailability(db, promise.productId, promise.warehouseId);

  // If substitute, always requires confirmation regardless of current stock
  if (promise.isSubstitute) {
    return {
      status: "substitute_requires_confirmation",
      currentAvailable: current.availableQuantity,
      isPromiseValid: false, // Requires explicit confirmation
      promise,
      reason: "Este producto es un sustituto/equivalencia. Requiere confirmación explícita del cliente.",
      validatedAt,
    };
  }

  // Check staleness
  const staleThresholdMinutes = opts?.staleThresholdMinutes ?? getCommercialPromiseStaleThresholdMinutes();
  const checkedAt = new Date(promise.checkedAt);
  const ageMinutes = (Date.now() - checkedAt.getTime()) / (1000 * 60);

  if (ageMinutes > staleThresholdMinutes) {
    // A server-side check has just refreshed the availability. Preserve the
    // stale source in the reason/audit, but do not reject a request that is
    // currently satisfiable; the later inventory reservation remains the
    // atomic source of truth.
    const isCurrentlySufficient = current.availableQuantity >= requestedQuantity;

    return {
      status: isCurrentlySufficient ? "promise_safe" : "insufficient_stock",
      currentAvailable: current.availableQuantity,
      isPromiseValid: isCurrentlySufficient,
      promise,
      reason: `Promesa verificada hace ${Math.round(ageMinutes)} min (límite ${staleThresholdMinutes} min). Vuelva a verificar disponibilidad.`,
      validatedAt,
    };
  }

  // Check sufficiency against requested quantity (not promise.requestedQuantity)
  const isSufficient = current.availableQuantity >= requestedQuantity;

  return {
    status: isSufficient ? "promise_safe" : "insufficient_stock",
    currentAvailable: current.availableQuantity,
    isPromiseValid: isSufficient,
    promise,
    reason: isSufficient
      ? `Disponibilidad confirmada: ${current.availableQuantity.toLocaleString("es-MX")} unidades en ${promise.warehouseCode}`
      : `Stock insuficiente: ${current.availableQuantity.toLocaleString("es-MX")} disponibles, ${requestedQuantity.toLocaleString("es-MX")} requeridas`,
    validatedAt,
  };
}

/**
 * Build a CommercialAvailabilityPromise from availability page context
 */
export async function buildPromiseFromAvailabilityContext(
  db: Db,
  productId: string,
  sku: string,
  warehouseId: string,
  requestedQuantity: number,
  source: CommercialAvailabilityPromise["source"]
): Promise<CommercialAvailabilityPromise> {
  // Get warehouse info
  const warehouse = await db.warehouse.findUnique({
    where: { id: warehouseId },
    select: { code: true, name: true },
  });

  if (!warehouse) {
    throw new Error("Warehouse not found");
  }

  // Check current availability
  const current = await checkCurrentAvailability(db, productId, warehouseId);

  return {
    productId,
    sku,
    warehouseId,
    warehouseCode: warehouse.code,
    warehouseName: warehouse.name,
    requestedQuantity,
    availableQuantity: current.availableQuantity,
    checkedAt: current.checkedAt,
    source,
    isSubstitute: false,
  };
}

/**
 * Build promise for substitute product
 */
export async function buildSubstitutePromise(
  db: Db,
  originalProductId: string,
  originalProductSku: string,
  substituteProductId: string,
  substituteSku: string,
  warehouseId: string,
  requestedQuantity: number,
  source: CommercialAvailabilityPromise["source"]
): Promise<CommercialAvailabilityPromise> {
  const basePromise = await buildPromiseFromAvailabilityContext(
    db,
    substituteProductId,
    substituteSku,
    warehouseId,
    requestedQuantity,
    source
  );

  return {
    ...basePromise,
    isSubstitute: true,
    originalProductId,
    originalProductSku,
  };
}
