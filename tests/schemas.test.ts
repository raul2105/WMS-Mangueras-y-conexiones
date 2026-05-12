import { describe, expect, it } from "vitest";
import {
  receiveStockSchema,
  pickStockSchema,
  inventoryAdjustmentSchema,
  transferStockSchema,
  productionOrderCreateSchema,
  assemblyOrderHeaderSchema,
  assemblyConfigSchema,
  assemblyOrderCancelSchema,
  assemblyOrderConfirmHeaderSchema,
  assemblyOrderConfirmTaskSchema,
  assemblyOrderReleaseSchema,
  parsePriority,
  parseDueDate,
  firstErrorMessage,
  productsLookupQuerySchema,
  productsSearchQuerySchema,
  salesInternalOrderAssemblyLineCreateSchema,
  salesInternalOrderCreateSchema,
  salesInternalOrderProductLineCreateSchema,
  salesOrderPickConfirmSchema,
  salesOrderPickListTransitionSchema,
} from "../lib/schemas/wms";
import { userCreateSchema, userResetPasswordSchema, userUpdateSchema } from "../lib/schemas/users";

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

describe("KAN-9 assembly order action schemas", () => {
  it("validates release and cancel order id", () => {
    expect(assemblyOrderReleaseSchema.safeParse({ orderId: "ord-1" }).success).toBe(true);
    expect(assemblyOrderCancelSchema.safeParse({ orderId: "ord-1" }).success).toBe(true);
    expect(assemblyOrderReleaseSchema.safeParse({ orderId: "" }).success).toBe(false);
  });

  it("requires operator and task ids for batch confirm", () => {
    const ok = assemblyOrderConfirmHeaderSchema.safeParse({
      orderId: "ord-1",
      operatorName: "Operador",
      taskIds: ["task-1"],
    });
    expect(ok.success).toBe(true);
    expect(assemblyOrderConfirmHeaderSchema.safeParse({
      orderId: "ord-1",
      operatorName: "",
      taskIds: ["task-1"],
    }).success).toBe(false);
  });

  it("rejects negative picked quantity", () => {
    expect(assemblyOrderConfirmTaskSchema.safeParse({
      taskId: "task-1",
      pickedQty: 0,
      shortReason: null,
    }).success).toBe(true);
    expect(assemblyOrderConfirmTaskSchema.safeParse({
      taskId: "task-1",
      pickedQty: -1,
      shortReason: null,
    }).success).toBe(false);
  });
});

describe("KAN-9 products query schemas", () => {
  it("applies defaults for search query", () => {
    const parsed = productsSearchQuerySchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.take).toBe(6);
      expect(parsed.data.cursor).toBe(0);
      expect(parsed.data.q).toBe("");
    }
  });

  it("rejects malformed numeric params", () => {
    expect(productsSearchQuerySchema.safeParse({ take: "abc" }).success).toBe(false);
    expect(productsSearchQuerySchema.safeParse({ cursor: "-2" }).success).toBe(false);
    expect(productsSearchQuerySchema.safeParse({ requiredQty: "0" }).success).toBe(false);
  });

  it("normalizes lookup code", () => {
    const parsed = productsLookupQuerySchema.safeParse({ code: "  abc  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.code).toBe("abc");
  });
});

describe("sales internal order schemas", () => {
  it("validates salesInternalOrderCreateSchema", () => {
    expect(salesInternalOrderCreateSchema.safeParse({
      warehouseId: "wh-1",
      dueDateRaw: "2026-05-12",
      customerName: "Cliente",
    }).success).toBe(true);
    expect(salesInternalOrderCreateSchema.safeParse({
      warehouseId: "",
      dueDateRaw: "2026-05-12",
    }).success).toBe(false);
    expect(salesInternalOrderCreateSchema.safeParse({
      warehouseId: "wh-1",
      dueDateRaw: "",
    }).success).toBe(false);
  });

  it("validates salesInternalOrderProductLineCreateSchema", () => {
    expect(salesInternalOrderProductLineCreateSchema.safeParse({
      orderId: "ord-1",
      productId: "prod-1",
      requestedQtyRaw: "2",
    }).success).toBe(true);
    expect(salesInternalOrderProductLineCreateSchema.safeParse({
      orderId: "ord-1",
      productId: "prod-1",
      requestedQtyRaw: "0",
    }).success).toBe(false);
    expect(salesInternalOrderProductLineCreateSchema.safeParse({
      orderId: "ord-1",
      productId: "",
      requestedQtyRaw: "2",
    }).success).toBe(false);
  });

  it("validates salesInternalOrderAssemblyLineCreateSchema", () => {
    const base = {
      orderId: "ord-1",
      warehouseId: "wh-1",
      entryFittingProductId: "entry-1",
      hoseProductId: "hose-1",
      exitFittingProductId: "exit-1",
      hoseLengthRaw: "1",
      assemblyQuantityRaw: "1",
    };
    expect(salesInternalOrderAssemblyLineCreateSchema.safeParse(base).success).toBe(true);
    expect(salesInternalOrderAssemblyLineCreateSchema.safeParse({
      ...base,
      hoseLengthRaw: "0",
    }).success).toBe(false);
    expect(salesInternalOrderAssemblyLineCreateSchema.safeParse({
      ...base,
      assemblyQuantityRaw: "0",
    }).success).toBe(false);
  });
});

describe("sales pick schemas", () => {
  it("validates salesOrderPickListTransitionSchema", () => {
    expect(salesOrderPickListTransitionSchema.safeParse({ orderId: "ord-1" }).success).toBe(true);
    expect(salesOrderPickListTransitionSchema.safeParse({ orderId: "" }).success).toBe(false);
  });

  it("validates salesOrderPickConfirmSchema", () => {
    expect(salesOrderPickConfirmSchema.safeParse({
      orderId: "ord-1",
      operatorName: "Operador",
    }).success).toBe(true);
    expect(salesOrderPickConfirmSchema.safeParse({
      orderId: "",
      operatorName: "Operador",
    }).success).toBe(false);
    expect(salesOrderPickConfirmSchema.safeParse({
      orderId: "ord-1",
      operatorName: "",
    }).success).toBe(false);
  });
});

describe("user schemas", () => {
  it("validates userCreateSchema", () => {
    const base = {
      name: "Usuario Demo",
      email: "demo@wms.com",
      password: "Segura123",
      confirmPassword: "Segura123",
      roleIds: ["role-1"],
      isActive: true,
    };
    expect(userCreateSchema.safeParse(base).success).toBe(true);
    expect(userCreateSchema.safeParse({
      ...base,
      confirmPassword: "Distinta123",
    }).success).toBe(false);
    expect(userCreateSchema.safeParse({
      ...base,
      roleIds: [],
    }).success).toBe(false);
  });

  it("validates userUpdateSchema", () => {
    const base = {
      name: "Usuario Demo",
      email: "demo@wms.com",
      roleIds: ["role-1"],
      isActive: true,
    };
    expect(userUpdateSchema.safeParse(base).success).toBe(true);
    expect(userUpdateSchema.safeParse({
      ...base,
      roleIds: [],
    }).success).toBe(false);
    expect(userUpdateSchema.safeParse({
      ...base,
      email: "correo-invalido",
    }).success).toBe(false);
  });

  it("validates userResetPasswordSchema", () => {
    expect(userResetPasswordSchema.safeParse({
      password: "Segura123",
      confirmPassword: "Segura123",
    }).success).toBe(true);
    expect(userResetPasswordSchema.safeParse({
      password: "123",
      confirmPassword: "123",
    }).success).toBe(false);
    expect(userResetPasswordSchema.safeParse({
      password: "Segura123",
      confirmPassword: "NoCoincide123",
    }).success).toBe(false);
  });
});
