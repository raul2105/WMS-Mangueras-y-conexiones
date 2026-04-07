import { expect, test } from "@playwright/test";

const USERS = {
  SYSTEM_ADMIN: { email: "admin@scmayer.local", password: "Admin123*" },
  MANAGER: { email: "manager@scmayer.local", password: "Manager123*" },
  WAREHOUSE_OPERATOR: { email: "operator@scmayer.local", password: "Operator123*" },
  SALES_EXECUTIVE: { email: "sales@scmayer.local", password: "Sales123*" },
} as const;

type RoleKey = keyof typeof USERS;

async function loginAs(
  page: import("@playwright/test").Page,
  role: RoleKey,
  callbackUrl = "/"
) {
  const user = USERS[role];
  await page.goto(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  if (await page.getByLabel("Email").isVisible()) {
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Contrasena").fill(user.password);
    await page.getByRole("button", { name: "Iniciar sesion" }).click();
  }
  await expect(page).not.toHaveURL(/\/login/);
}

async function expectAllowed(
  page: import("@playwright/test").Page,
  route: string,
  expectedHeading: RegExp
) {
  await page.goto(route);
  await expect(page).toHaveURL(new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await expect(page.getByRole("heading", { name: expectedHeading })).toBeVisible();
}

async function expectForbidden(
  page: import("@playwright/test").Page,
  route: string
) {
  await page.goto(route);
  await expect(page).toHaveURL(/\/forbidden/);
  await expect(page.getByText("Acceso denegado")).toBeVisible();
}

test.describe("RBAC en navegador por rol", () => {
  test("SYSTEM_ADMIN puede acceder a rutas criticas", async ({ page }) => {
    await loginAs(page, "SYSTEM_ADMIN");
    await expectAllowed(page, "/inventory/adjust", /Ajuste de Inventario/i);
    await expectAllowed(page, "/inventory/transfer", /Transferencia Interna/i);
    await expectAllowed(page, "/inventory/pick", /Picking/i);
    await expectAllowed(page, "/audit", /Auditoria/i);
  });

  test("MANAGER puede acceder a inventario critico y auditoria", async ({ page }) => {
    await loginAs(page, "MANAGER");
    await expectAllowed(page, "/inventory/adjust", /Ajuste de Inventario/i);
    await expectAllowed(page, "/inventory/transfer", /Transferencia Interna/i);
    await expectAllowed(page, "/inventory/pick", /Picking/i);
    await expectAllowed(page, "/audit", /Auditoria/i);
  });

  test("WAREHOUSE_OPERATOR no accede a auditoria pero si a operaciones fisicas", async ({ page }) => {
    await loginAs(page, "WAREHOUSE_OPERATOR");
    await expectAllowed(page, "/inventory/adjust", /Ajuste de Inventario/i);
    await expectAllowed(page, "/inventory/transfer", /Transferencia Interna/i);
    await expectAllowed(page, "/inventory/pick", /Picking/i);
    await expectForbidden(page, "/audit");
  });

  test("SALES_EXECUTIVE no accede a ajustes, transferencias, picking ni auditoria", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await expectForbidden(page, "/inventory/adjust");
    await expectForbidden(page, "/inventory/transfer");
    await expectForbidden(page, "/inventory/pick");
    await expectForbidden(page, "/audit");
  });

  test("SALES_EXECUTIVE puede operar flujo comercial", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await expectAllowed(page, "/sales", /Comercial/i);
    await expectAllowed(page, "/sales/orders", /Pedidos internos/i);
    await expectAllowed(page, "/sales/orders/new", /Nuevo pedido interno/i);
  });
});
