import { expect, test } from "@playwright/test";
import { EXPECTED_HOME, loginAs, type RoleKey, expectAllowed, expectForbidden } from "./lib/auth.helpers";

const ROLE_CHECKS: Record<RoleKey, { home: string; visibleRoutes: Array<[string, RegExp]>; blockedRoutes: string[] }> = {
  SYSTEM_ADMIN: {
    home: "/",
    visibleRoutes: [
      ["/users", /Usuarios/i],
      ["/catalog", /Catalogo/i],
      ["/inventory", /Inventario/i],
      ["/warehouse", /^Almacenes$/],
      ["/production", /Produccion/i],
      ["/purchasing", /Compras/i],
      ["/audit", /Auditoria/i],
    ],
    blockedRoutes: [],
  },
  MANAGER: {
    home: "/",
    visibleRoutes: [
      ["/catalog", /Catalogo/i],
      ["/inventory", /Inventario/i],
      ["/warehouse", /^Almacenes$/],
      ["/production", /Produccion/i],
      ["/purchasing", /Compras/i],
      ["/sales/customers", /Clientes/i],
      ["/audit", /Auditoria/i],
    ],
    blockedRoutes: ["/users"],
  },
  WAREHOUSE_OPERATOR: {
    home: "/inventory",
    visibleRoutes: [
      ["/inventory", /Inventario/i],
      ["/purchasing/orders", /Órdenes de compra/i],
      ["/production", /Produccion/i],
    ],
    blockedRoutes: ["/users", "/warehouse", "/audit", "/sales/availability", "/sales/equivalences"],
  },
  SALES_EXECUTIVE: {
    home: "/production/requests",
    visibleRoutes: [
      ["/production/requests", /Warehouse Execution Cockpit/i],
      ["/production/requests/new", /Nuevo pedido de surtido/i],
      ["/production/availability", /Disponibilidad para pedidos/i],
      ["/production/equivalences", /Equivalencias para pedidos/i],
      ["/sales/customers", /Clientes/i],
    ],
    blockedRoutes: ["/users", "/warehouse", "/inventory/adjust", "/inventory/transfer", "/inventory/pick", "/audit"],
  },
};

test.describe("full role matrix", () => {
  for (const role of Object.keys(ROLE_CHECKS) as RoleKey[]) {
    test(`${role} keeps the expected home, nav and route access`, async ({ page }) => {
      const config = ROLE_CHECKS[role];
      await loginAs(page, role, config.home);
      await expect(page).toHaveURL(new RegExp(`${EXPECTED_HOME[role]}(?:\\?.*)?$`));

      for (const [route, heading] of config.visibleRoutes) {
        await expectAllowed(page, route, heading);
      }

      for (const route of config.blockedRoutes) {
        await expectForbidden(page, route);
      }
    });
  }
});
