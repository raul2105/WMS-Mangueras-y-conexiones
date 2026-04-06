import { describe, expect, it } from "vitest";
import {
  receiveStockSchema,
  pickStockSchema,
  inventoryAdjustmentSchema,
  transferStockSchema,
  productionOrderCreateSchema,
  assemblyOrderHeaderSchema,
  assemblyConfigSchema,
  parsePriority,
  parseDueDate,
  firstErrorMessage,
} from "../lib/schemas/wms";

describe("receiveStockSchema", () => {
  const base = {
    code: "SKU-01",
    warehouseId: "wh-1",
    locationId: "loc-1",
    reference: "REF-01",
    operatorName: "Operador 1",
    quantityRaw: "5",
  };

  it("accepts valid input", () => {
    const result = receiveStockSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.quantityRaw).toBe(5);
  });

  it("accepts comma decimal separator", () => {
    const result = receiveStockSchema.safeParse({ ...base, quantityRaw: "3,5" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.quantityRaw).toBe(3.5);
  });

  it("rejects zero quantity", () => {
    expect(receiveStockSchema.safeParse({ ...base, quantityRaw: "0" }).success).toBe(false);
  });

  it("rejects negative quantity", () => {
    expect(receiveStockSchema.safeParse({ ...base, quantityRaw: "-1" }).success).toBe(false);
  });

  it("rejects empty code", () => {
    expect(receiveStockSchema.safeParse({ ...base, code: "" }).success).toBe(false);
  });

  it("rejects empty reference", () => {
    expect(receiveStockSchema.safeParse({ ...base, reference: "" }).success).toBe(false);
  });
});

describe("pickStockSchema", () => {
  const base = { code: "SKU-01", locationCode: "LOC-01", operatorName: "Operador 1", quantityRaw: "2" };

  it("accepts valid input", () => {
    expect(pickStockSchema.safeParse(base).success).toBe(true);
  });

  it("rejects zero quantity", () => {
    expect(pickStockSchema.safeParse({ ...base, quantityRaw: "0" }).success).toBe(false);
  });

  it("rejects missing location", () => {
    expect(pickStockSchema.safeParse({ ...base, locationCode: "" }).success).toBe(false);
  });
});

describe("inventoryAdjustmentSchema", () => {
  const base = {
    code: "SKU-01",
    locationCode: "LOC-01",
    operatorName: "Operador 1",
    reason: "CONTEO_CICLICO",
    deltaRaw: "3",
  };

  it("accepts positive delta", () => {
    const result = inventoryAdjustmentSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.deltaRaw).toBe(3);
  });

  it("accepts negative delta", () => {
    const result = inventoryAdjustmentSchema.safeParse({ ...base, deltaRaw: "-2" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.deltaRaw).toBe(-2);
  });

  it("rejects zero delta", () => {
    expect(inventoryAdjustmentSchema.safeParse({ ...base, deltaRaw: "0" }).success).toBe(false);
  });

  it("rejects missing reason", () => {
    expect(inventoryAdjustmentSchema.safeParse({ ...base, reason: "" }).success).toBe(false);
  });

  it("rejects missing operator", () => {
    expect(inventoryAdjustmentSchema.safeParse({ ...base, operatorName: "" }).success).toBe(false);
  });

  it("accepts comma as decimal separator", () => {
    const result = inventoryAdjustmentSchema.safeParse({ ...base, deltaRaw: "-1,5" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.deltaRaw).toBe(-1.5);
  });
});

describe("transferStockSchema", () => {
  const base = {
    code: "SKU-01",
    fromLocationCode: "LOC-A",
    toLocationCode: "LOC-B",
    quantityRaw: "5",
  };

  it("accepts valid transfer", () => {
    expect(transferStockSchema.safeParse(base).success).toBe(true);
  });

  it("rejects same from and to location", () => {
    expect(
      transferStockSchema.safeParse({ ...base, toLocationCode: "LOC-A" }).success
    ).toBe(false);
  });

  it("rejects zero quantity", () => {
    expect(transferStockSchema.safeParse({ ...base, quantityRaw: "0" }).success).toBe(false);
  });
});

describe("productionOrderCreateSchema", () => {
  const base = { code: "OP-001", status: "BORRADOR" as const, warehouseId: "wh-1" };

  it("accepts valid order", () => {
    expect(productionOrderCreateSchema.safeParse(base).success).toBe(true);
  });

  it("uppercases the code", () => {
    const result = productionOrderCreateSchema.safeParse({ ...base, code: "op-001" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.code).toBe("OP-001");
  });

  it("rejects invalid status", () => {
    expect(productionOrderCreateSchema.safeParse({ ...base, status: "UNKNOWN" }).success).toBe(false);
  });

  it("rejects code with spaces", () => {
    expect(productionOrderCreateSchema.safeParse({ ...base, code: "OP 001" }).success).toBe(false);
  });
});

describe("assemblyConfigSchema", () => {
  const base = {
    warehouseId: "wh-1",
    entryFittingProductId: "p1",
    hoseProductId: "p2",
    exitFittingProductId: "p3",
    hoseLengthRaw: "2",
    assemblyQuantityRaw: "5",
  };

  it("accepts valid assembly config", () => {
    expect(assemblyConfigSchema.safeParse(base).success).toBe(true);
  });

  it("rejects zero quantities", () => {
    expect(assemblyConfigSchema.safeParse({ ...base, hoseLengthRaw: "0" }).success).toBe(false);
    expect(assemblyConfigSchema.safeParse({ ...base, assemblyQuantityRaw: "0" }).success).toBe(false);
  });
});

describe("assemblyOrderHeaderSchema", () => {
  const base = {
    warehouseId: "wh-1",
    customerName: "Cliente Demo",
    dueDateRaw: "2026-04-15",
    priorityRaw: "3",
  };

  it("accepts a valid commercial header", () => {
    expect(assemblyOrderHeaderSchema.safeParse(base).success).toBe(true);
  });

  it("requires customer and due date", () => {
    expect(assemblyOrderHeaderSchema.safeParse({ ...base, customerName: "" }).success).toBe(false);
    expect(assemblyOrderHeaderSchema.safeParse({ ...base, dueDateRaw: "" }).success).toBe(false);
  });
});

describe("parsePriority", () => {
  it("returns the number for valid priorities", () => {
    expect(parsePriority("1")).toBe(1);
    expect(parsePriority("5")).toBe(5);
    expect(parsePriority("3")).toBe(3);
  });

  it("returns null for out-of-range values", () => {
    expect(parsePriority("0")).toBeNull();
    expect(parsePriority("6")).toBeNull();
  });

  it("returns fallback when value is undefined", () => {
    expect(parsePriority(undefined, 3)).toBe(3);
  });

  it("returns null for non-numeric values", () => {
    expect(parsePriority("abc")).toBeNull();
  });
});

describe("parseDueDate", () => {
  it("parses valid ISO date", () => {
    const date = parseDueDate("2026-06-01");
    expect(date).toBeInstanceOf(Date);
  });

  it("returns null for invalid date", () => {
    expect(parseDueDate("not-a-date")).toBeNull();
  });

  it("returns null when value is undefined", () => {
    expect(parseDueDate(undefined)).toBeNull();
  });
});

describe("firstErrorMessage", () => {
  it("returns the first Zod error message", () => {
    const result = receiveStockSchema.safeParse({ code: "", warehouseId: "", locationId: "", reference: "", quantityRaw: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = firstErrorMessage(result.error);
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});
