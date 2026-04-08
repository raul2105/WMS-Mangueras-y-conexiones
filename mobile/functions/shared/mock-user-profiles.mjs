export const MOCK_USERS = {
  "mock-admin": {
    userId: "mock-admin",
    displayName: "Admin Mobile",
    roleCodes: ["SYSTEM_ADMIN"],
    preferredWarehouseCode: "WH-MAIN",
  },
  "mock-manager": {
    userId: "mock-manager",
    displayName: "Manager Mobile",
    roleCodes: ["MANAGER"],
    preferredWarehouseCode: "WH-MAIN",
  },
  "mock-operator": {
    userId: "mock-operator",
    displayName: "Operador Mobile",
    roleCodes: ["WAREHOUSE_OPERATOR"],
    preferredWarehouseCode: "WH-OPER",
  },
  "mock-sales": {
    userId: "mock-sales",
    displayName: "Sales Mobile",
    roleCodes: ["SALES_EXECUTIVE"],
    preferredWarehouseCode: "WH-SALES",
  },
};

export function getMockUserById(userId) {
  return MOCK_USERS[userId] || null;
}
