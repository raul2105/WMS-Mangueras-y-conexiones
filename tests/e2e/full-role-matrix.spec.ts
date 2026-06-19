import { expect, test } from "@playwright/test";
import {
  EXPECTED_HOME,
  loginAs,
  type RoleKey,
  expectAllowed,
  expectForbidden,
} from "./lib/auth.helpers";

const ROLE_CHECKS: Record<
  RoleKey,
  {
    home: string;
    visibleRoutes: Array<[string, RegExp]>;
    blockedRoutes: string[];
  }
> = {
  SYSTEM_ADMIN: {
    home: "/",
    visibleRoutes: [
      ["/users", /Usuarios/i],
      ["/catalog", /Cat[aá]logo comercial/i],
      ["/inventory", /Inventario/i],
      ["/warehouse", /Almacenes/i],
      ["/production", /Produccion de ensambles/i],
      ["/audit", /Auditoria/i],
    ],
    blockedRoutes: [],
  },
  MANAGER: {
    home: "/",
    visibleRoutes: [
      ["/catalog", /Cat[aá]logo comercial/i],
      ["/inventory", /Inventario/i],
      ["/warehouse", /Almacenes/i],
      ["/production", /Produccion de ensambles/i],
      ["/sales/customers", /Clientes/i],
      ["/audit", /Auditoria/i],
    ],
    blockedRoutes: ["/users"],
  },
  WAREHOUSE_OPERATOR: {
    home: "/inventory",
    visibleRoutes: [
      ["/inventory", /Inventario/i],
      ["/production", /Produccion de ensambles/i],
      ["/production/requests", /Cockpit de ejecución/i],
    ],
    blockedRoutes: [
      "/users",
      "/warehouse",
      "/audit",
      "/sales/availability",
      "/sales/equivalences",
    ],
  },
  SALES_EXECUTIVE: {
    home: "/production/requests",
    visibleRoutes: [
      ["/production/requests", /Pedidos y surtidos/i],
      ["/production/requests/new", /Nuevo pedido comercial/i],
      ["/catalog", /Cat[aá]logo comercial/i],
      ["/production/availability", /Disponibilidad comercial/i],
      ["/production/equivalences", /Alternativas y equivalencias/i],
      ["/sales/customers", /Clientes/i],
    ],
    blockedRoutes: [
      "/users",
      "/warehouse",
      "/inventory/adjust",
      "/inventory/transfer",
      "/inventory/pick",
      "/audit",
    ],
  },
};

test.describe("full role matrix", () => {
  for (const role of Object.keys(ROLE_CHECKS) as RoleKey[]) {
    test(`${role} keeps the expected home, nav and route access`, async ({
      page,
    }) => {
      const config = ROLE_CHECKS[role];
      await loginAs(page, role, config.home);
      await expect(page).toHaveURL(
        new RegExp(`${EXPECTED_HOME[role]}(?:\\?.*)?$`),
      );

      for (const [route, heading] of config.visibleRoutes) {
        await expectAllowed(page, route, heading);
      }

      if (role === "SYSTEM_ADMIN" || role === "MANAGER") {
        await expectAllowed(page, "/production/requests", /Pedidos y surtidos/i);
        await expect(page.getByText("Vista administrativa", { exact: true })).toBeVisible();
        await page.locator("summary").filter({ hasText: /Vista administrativa/i }).click();
        await expect(page.getByRole("table", { name: /Tabla administrativa de pedidos/i })).toBeVisible();
      }

      if (role === "SALES_EXECUTIVE") {
        await expectAllowed(page, "/production/requests", /Pedidos y surtidos/i);
        await expect(page.getByText("Vista administrativa", { exact: true })).toHaveCount(0);
      }

      if (role === "WAREHOUSE_OPERATOR") {
        await expectAllowed(page, "/production/requests", /Cockpit de ejecución/i);
        await expect(page.getByText("Vista administrativa", { exact: true })).toHaveCount(0);
      }

      for (const route of config.blockedRoutes) {
        await expectForbidden(page, route);
      }
    });
  }
});
