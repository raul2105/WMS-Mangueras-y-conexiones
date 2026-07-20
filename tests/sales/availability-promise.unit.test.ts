import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMMERCIAL_PROMISE_STALE_THRESHOLD_MINUTES,
  getCommercialPromiseStaleThresholdMinutes,
  parseCommercialPromise,
} from "@/lib/sales/availability-promise";

const validPromise = {
  productId: "9b3b22b5-4ac0-4a55-bafe-1a472d0ba8e1",
  sku: "MANG-001",
  warehouseId: "1c8f5a36-c47c-4d31-99d8-f8492d7b41c6",
  warehouseCode: "WH-01",
  warehouseName: "Almacén principal",
  requestedQuantity: 2,
  availableQuantity: 8,
  checkedAt: "2026-07-17T12:00:00.000Z",
  source: "availability",
  isSubstitute: false,
};

describe("commercial availability promise policy", () => {
  it("uses the default threshold when the environment value is missing or invalid", () => {
    expect(getCommercialPromiseStaleThresholdMinutes({})).toBe(DEFAULT_COMMERCIAL_PROMISE_STALE_THRESHOLD_MINUTES);
    expect(getCommercialPromiseStaleThresholdMinutes({ COMMERCIAL_PROMISE_STALE_THRESHOLD_MINUTES: "0" })).toBe(DEFAULT_COMMERCIAL_PROMISE_STALE_THRESHOLD_MINUTES);
    expect(getCommercialPromiseStaleThresholdMinutes({ COMMERCIAL_PROMISE_STALE_THRESHOLD_MINUTES: "481" })).toBe(DEFAULT_COMMERCIAL_PROMISE_STALE_THRESHOLD_MINUTES);
  });

  it("accepts a bounded whole-minute threshold", () => {
    expect(getCommercialPromiseStaleThresholdMinutes({ COMMERCIAL_PROMISE_STALE_THRESHOLD_MINUTES: "30.8" })).toBe(30);
  });

  it("accepts only a typed, complete promise posted from Nuevo Pedido", () => {
    expect(parseCommercialPromise(validPromise)).toMatchObject(validPromise);
    expect(parseCommercialPromise({ ...validPromise, isSubstitute: "false" })).toBeNull();
    expect(parseCommercialPromise({ ...validPromise, warehouseId: "" })).toBeNull();
  });
});
