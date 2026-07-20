export const OPERATIONAL_FLOW_FIXTURES = {
  availability: {
    productId: "fixture-product-001",
    sku: "MANG-FIX-001",
    warehouseCode: "CENTRAL",
    availableQuantity: 12,
    requestedQuantity: 10,
    status: "promise_safe" as const,
  },
  order: {
    id: "fixture-order-001",
    code: "PI-FIX-0001",
    status: "CONFIRMADA" as const,
    customerName: "Cliente Fixture",
    hasProductLines: true,
    hasAssemblyLines: false,
  },
  blockedOrder: {
    id: "fixture-order-blocked-001",
    code: "PI-FIX-0002",
    blockingCause: "PICK_PARTIAL" as const,
    status: "Surtido parcial",
  },
  staging: {
    locationCode: "STG-01",
    quantity: 10,
    verified: true,
  },
};

export const ROLE_FIXTURES = {
  SALES_EXECUTIVE: { canCreateOrder: true, canExecutePick: false },
  WAREHOUSE_OPERATOR: { canCreateOrder: false, canExecutePick: true },
  MANAGER: { canCreateOrder: true, canExecutePick: true },
  SYSTEM_ADMIN: { canCreateOrder: true, canExecutePick: true },
};
