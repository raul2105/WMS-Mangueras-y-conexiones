import { z } from "zod";

/**
 * KAN-128: Commercial Availability Promise Contract
 *
 * This defines the contract for carrying availability promise state
 * from the commercial availability page into the sales order creation flow.
 */

export type CommercialPromiseSource =
  | "catalog"
  | "availability"
  | "equivalences"
  | "manual"
  | "substitute";

export type CommercialPromiseStatus =
  | "promise_safe"
  | "insufficient_stock"
  | "unresolved"
  | "stale"
  | "substitute_requires_confirmation";

export interface CommercialAvailabilityPromise {
  /** Product being promised */
  productId: string;
  /** SKU at time of check */
  sku: string;
  /** Warehouse where availability was checked */
  warehouseId: string;
  /** Warehouse code for display */
  warehouseCode: string;
  /** Warehouse name for display */
  warehouseName: string;
  /** Quantity that was requested/checked */
  requestedQuantity: number;
  /** Available quantity at check time */
  availableQuantity: number;
  /** ISO timestamp when availability was checked */
  checkedAt: string;
  /** Source of the promise context */
  source: CommercialPromiseSource;
  /** Whether this is a substitute/equivalent product */
  isSubstitute: boolean;
  /** Original product ID if this is a substitute */
  originalProductId?: string;
  /** Original product SKU if this is a substitute */
  originalProductSku?: string;
}

export const DEFAULT_COMMERCIAL_PROMISE_STALE_THRESHOLD_MINUTES = 15;

/**
 * Keeps the promise-vigency policy in one place. The value is intentionally
 * server-side: changing it in AWS still requires applying environment
 * configuration and restarting/redeploying the runtime.
 */
export function getCommercialPromiseStaleThresholdMinutes(
  env?: { COMMERCIAL_PROMISE_STALE_THRESHOLD_MINUTES?: string | undefined },
) {
  const configured = Number(
    env?.COMMERCIAL_PROMISE_STALE_THRESHOLD_MINUTES ?? process.env["COMMERCIAL_PROMISE_STALE_THRESHOLD_MINUTES"],
  );
  if (!Number.isFinite(configured)) {
    return DEFAULT_COMMERCIAL_PROMISE_STALE_THRESHOLD_MINUTES;
  }

  const wholeMinutes = Math.trunc(configured);
  return wholeMinutes >= 1 && wholeMinutes <= 480
    ? wholeMinutes
    : DEFAULT_COMMERCIAL_PROMISE_STALE_THRESHOLD_MINUTES;
}

/**
 * Human-readable labels for promise status (Spanish commercial language)
 */
export const COMMERCIAL_PROMISE_STATUS_LABELS: Record<CommercialPromiseStatus, string> = {
  promise_safe: "Promesa segura",
  insufficient_stock: "Disponibilidad insuficiente",
  unresolved: "Disponibilidad no verificada",
  stale: "Promesa vencida",
  substitute_requires_confirmation: "Sustituto pendiente de confirmar",
};

/**
 * Badge variants for each promise status
 */
export const COMMERCIAL_PROMISE_STATUS_VARIANTS: Record<CommercialPromiseStatus, "success" | "warning" | "danger" | "neutral" | "accent"> = {
  promise_safe: "success",
  insufficient_stock: "danger",
  unresolved: "warning",
  stale: "warning",
  substitute_requires_confirmation: "accent",
};

/**
 * Compute the promise status based on the promise data
 */
export function computePromiseStatus(promise: CommercialAvailabilityPromise | null, opts?: {
  staleThresholdMinutes?: number;
  requestedQuantity?: number;
}): CommercialPromiseStatus {
  if (!promise) {
    return "unresolved";
  }

  // Check if substitute
  if (promise.isSubstitute) {
    return "substitute_requires_confirmation";
  }

  // Check staleness
  const staleThresholdMinutes = opts?.staleThresholdMinutes ?? getCommercialPromiseStaleThresholdMinutes();
  const checkedAt = new Date(promise.checkedAt);
  const ageMinutes = (Date.now() - checkedAt.getTime()) / (1000 * 60);
  if (ageMinutes > staleThresholdMinutes) {
    return "stale";
  }

  // Check sufficiency - use requestedQuantity from options if provided, otherwise use promise.requestedQuantity
  const qtyToCheck = opts?.requestedQuantity ?? promise.requestedQuantity;
  if (promise.availableQuantity >= qtyToCheck) {
    return "promise_safe";
  }

  return "insufficient_stock";
}

/**
 * Zod schema for validating promise from query params
 */
const commercialPromiseSchema = z.object({
  productId: z.string().uuid(),
  sku: z.string().min(1),
  warehouseId: z.string().min(1), // Allow both UUID and codes
  warehouseCode: z.string().min(1),
  warehouseName: z.string().min(1),
  requestedQuantity: z.coerce.number().positive(),
  availableQuantity: z.coerce.number().nonnegative(),
  checkedAt: z.string().datetime(),
  source: z.enum(["catalog", "availability", "equivalences", "manual", "substitute"]),
  isSubstitute: z.boolean().default(false),
  originalProductId: z.string().uuid().optional(),
  originalProductSku: z.string().optional(),
});

/**
 * Parse promise from URL search params (permissive - returns null if invalid)
 */
export function buildCommercialPromiseFromSearchParams(searchParams: URLSearchParams): CommercialAvailabilityPromise | null {
  try {
    const optionalParam = (key: string) => searchParams.get(key) ?? undefined;
    const substituteParam = searchParams.get("promiseIsSubstitute");
    const result = commercialPromiseSchema.safeParse({
      productId: searchParams.get("promiseProductId"),
      sku: searchParams.get("promiseSku"),
      warehouseId: searchParams.get("promiseWarehouseId"),
      warehouseCode: searchParams.get("promiseWarehouseCode"),
      warehouseName: searchParams.get("promiseWarehouseName"),
      requestedQuantity: searchParams.get("promiseRequestedQty"),
      availableQuantity: searchParams.get("promiseAvailableQty"),
      checkedAt: searchParams.get("promiseCheckedAt"),
      source: searchParams.get("promiseSource"),
      // URLSearchParams returns strings. Do not use z.coerce.boolean here:
      // Boolean("false") is true, which would incorrectly turn every normal
      // availability handoff into a substitute confirmation.
      isSubstitute: substituteParam === null ? undefined : substituteParam === "true",
      originalProductId: optionalParam("promiseOriginalProductId"),
      originalProductSku: optionalParam("promiseOriginalProductSku"),
    });

    if (result.success) {
      return result.data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parses a promise posted back by Nuevo Pedido. It is still treated as
 * client-provided context and must be revalidated against inventory on the
 * server before an order is created.
 */
export function parseCommercialPromise(value: unknown): CommercialAvailabilityPromise | null {
  const result = commercialPromiseSchema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * Build URL search params for passing promise context
 */
export function buildPromiseSearchParams(promise: CommercialAvailabilityPromise): URLSearchParams {
  const params = new URLSearchParams();
  params.set("promiseProductId", promise.productId);
  params.set("promiseSku", promise.sku);
  params.set("promiseWarehouseId", promise.warehouseId);
  params.set("promiseWarehouseCode", promise.warehouseCode);
  params.set("promiseWarehouseName", promise.warehouseName);
  params.set("promiseRequestedQty", String(promise.requestedQuantity));
  params.set("promiseAvailableQty", String(promise.availableQuantity));
  params.set("promiseCheckedAt", promise.checkedAt);
  params.set("promiseSource", promise.source);
  params.set("promiseIsSubstitute", String(promise.isSubstitute));
  if (promise.originalProductId) params.set("promiseOriginalProductId", promise.originalProductId);
  if (promise.originalProductSku) params.set("promiseOriginalProductSku", promise.originalProductSku);
  return params;
}
