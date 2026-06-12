import { test, expect } from "@playwright/test";

import {
  loginAs,
  expectAllowed,
  expectRedirectedAllowed,
  expectForbidden,
} from "./lib/auth.helpers";

test.describe("RBAC en navegador por rol", () => {
  test("login no muestra shell de la app", async ({ page }) => {
    await page.goto("/login?callbackUrl=%2F");
    await expect(
      page.locator('nav[aria-label="Navegacion principal"]'),
    ).toHaveCount(0);
    await expect(page.getByLabel("Abrir navegacion")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Acceso WMS" }),
    ).toBeVisible();
  });

  test("SYSTEM_ADMIN puede acceder a rutas criticas", async ({ page }) => {
    await loginAs(page, "SYSTEM_ADMIN");
    await expectAllowed(page, "/users", /Usuarios/i);
    await expectAllowed(page, "/inventory/adjust", /Ajuste de Inventario/i);
    await expectAllowed(page, "/inventory/transfer", /Transferencia Interna/i);
    await expectAllowed(page, "/inventory/pick", /Picking/i);
    await expectAllowed(page, "/audit", /Auditoria/i);
  });

  test("MANAGER puede acceder a inventario critico y auditoria", async ({
    page,
  }) => {
    await loginAs(page, "MANAGER");
    await expectForbidden(page, "/users");
    await expectAllowed(page, "/inventory/adjust", /Ajuste de Inventario/i);
    await expectAllowed(page, "/inventory/transfer", /Transferencia Interna/i);
    await expectAllowed(page, "/inventory/pick", /Picking/i);
    await expectAllowed(page, "/audit", /Auditoria/i);
  });

  test("WAREHOUSE_OPERATOR no accede a auditoria pero si a operaciones fisicas", async ({
    page,
  }) => {
    await loginAs(page, "WAREHOUSE_OPERATOR");
    await expectForbidden(page, "/users");
    await expectAllowed(page, "/inventory/adjust", /Ajuste de Inventario/i);
    await expectAllowed(page, "/inventory/transfer", /Transferencia Interna/i);
    await expectAllowed(page, "/inventory/pick", /Picking/i);
    await expectForbidden(page, "/audit");
    await expectAllowed(page, "/purchasing/orders", /Órdenes de Compra/i);
    await expect(page.getByRole("link", { name: /\+ Nueva OC/i })).toHaveCount(
      0,
    );
    await expect(page.getByRole("link", { name: /Ver detalle/i })).toHaveCount(
      0,
    );
  });

  test("SALES_EXECUTIVE no accede a ajustes, transferencias, picking ni auditoria", async ({
    page,
  }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await expectForbidden(page, "/users");
    await expectForbidden(page, "/inventory/adjust");
    await expectForbidden(page, "/inventory/transfer");
    await expectForbidden(page, "/inventory/pick");
    await expectForbidden(page, "/audit");
  });

  test("KAN-55/KAN-63/KAN-81 SALES_EXECUTIVE opera el flujo nuevo de pedidos", async ({
    page,
  }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await expectAllowed(page, "/production/requests", /Pedidos comerciales/i);
    await expectAllowed(
      page,
      "/production/requests/new",
      /Nuevo pedido comercial/i,
    );
    await expectAllowed(page, "/catalog", /Cat[aá]logo/i);
    await expectAllowed(
      page,
      "/production/availability",
      /Disponibilidad para pedidos/i,
    );
    await expectAllowed(
      page,
      "/production/equivalences",
      /Equivalencias para pedidos/i,
    );
    await page.goto("/production/requests");
    await expect(
      page.getByTestId("desktop-main-nav").getByRole("link", { name: /^Pedidos$/i }),
    ).toBeVisible();
    await expect(
      page.getByTestId("desktop-main-nav").getByRole("link", { name: /Clientes/i }),
    ).toBeVisible();
    await expect(
      page.getByTestId("desktop-main-nav").getByRole("link", { name: /Cat[aá]logo/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^Disponibilidad\s/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^Equivalencias\s/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^Nuevo pedido\s/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Inventario/i })).toHaveCount(
      0,
    );
    await expect(page.getByRole("link", { name: /Almacenes/i })).toHaveCount(0);
  });

  test("rutas legacy de sales redirigen al flujo nuevo", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await expectRedirectedAllowed(
      page,
      "/sales",
      /\/production\/requests(?:\?.*)?$/,
      /Pedidos comerciales/i,
    );
    await expectRedirectedAllowed(
      page,
      "/sales/orders",
      /\/production\/requests(?:\?.*)?$/,
      /Pedidos comerciales/i,
    );
    await expectRedirectedAllowed(
      page,
      "/sales/orders/new",
      /\/production\/requests\/new(?:\?.*)?$/,
      /Nuevo pedido comercial/i,
    );
  });
});
