import { expect, test } from "@playwright/test";

const USERS = {
  SYSTEM_ADMIN: { email: "admin@scmayher.com", password: "Admin123*" },
  MANAGER: { email: "manager@scmayher.com", password: "Manager123*" },
  WAREHOUSE_OPERATOR: { email: "operator@scmayher.com", password: "Operator123*" },
  SALES_EXECUTIVE: { email: "sales@scmayher.com", password: "Sales123*" },
} as const;

type RoleKey = keyof typeof USERS;
const EXPECTED_HOME: Record<RoleKey, string> = {
  SYSTEM_ADMIN: "/",
  MANAGER: "/",
  WAREHOUSE_OPERATOR: "/inventory",
  SALES_EXECUTIVE: "/production/requests",
};

const EXPECTED_USER: Record<RoleKey, { name: string; email: string; navItems: number }> = {
  SYSTEM_ADMIN: { name: "Admin Principal", email: "admin@scmayher.com", navItems: 8 },
  MANAGER: { name: "Manager WMS", email: "manager@scmayher.com", navItems: 7 },
  WAREHOUSE_OPERATOR: { name: "Operador Almacen", email: "operator@scmayher.com", navItems: 4 },
  SALES_EXECUTIVE: { name: "Ejecutivo Ventas", email: "sales@scmayher.com", navItems: 3 },
};

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
  await expect(page).toHaveURL(new RegExp(`${EXPECTED_HOME[role]}(?:\\?.*)?$`));

  const expectedUser = EXPECTED_USER[role];
  await expect(page.getByRole("banner")).toContainText(expectedUser.name);
  await expect(page.getByRole("banner")).toContainText(expectedUser.email);
  await expect(page.getByRole("banner")).not.toContainText("Usuario");
  await expect(page.locator('nav[aria-label="Navegacion principal"] a')).toHaveCount(expectedUser.navItems);
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

async function expectRedirectedAllowed(
  page: import("@playwright/test").Page,
  route: string,
  expectedUrl: RegExp,
  expectedHeading: RegExp,
) {
  await page.goto(route);
  await expect(page).toHaveURL(expectedUrl);
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
  test("login no muestra shell de la app", async ({ page }) => {
    await page.goto("/login?callbackUrl=%2F");
    await expect(page.locator('nav[aria-label="Navegacion principal"]')).toHaveCount(0);
    await expect(page.getByLabel("Abrir navegacion")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Acceso WMS" })).toBeVisible();
  });

  test("SYSTEM_ADMIN puede acceder a rutas criticas", async ({ page }) => {
    await loginAs(page, "SYSTEM_ADMIN");
    await expectAllowed(page, "/users", /Usuarios/i);
    await expectAllowed(page, "/inventory/adjust", /Ajuste de Inventario/i);
    await expectAllowed(page, "/inventory/transfer", /Transferencia Interna/i);
    await expectAllowed(page, "/inventory/pick", /Picking/i);
    await expectAllowed(page, "/audit", /Auditoria/i);
  });

  test("MANAGER puede acceder a inventario critico y auditoria", async ({ page }) => {
    await loginAs(page, "MANAGER");
    await expectForbidden(page, "/users");
    await expectAllowed(page, "/inventory/adjust", /Ajuste de Inventario/i);
    await expectAllowed(page, "/inventory/transfer", /Transferencia Interna/i);
    await expectAllowed(page, "/inventory/pick", /Picking/i);
    await expectAllowed(page, "/audit", /Auditoria/i);
  });

  test("WAREHOUSE_OPERATOR no accede a auditoria pero si a operaciones fisicas", async ({ page }) => {
    await loginAs(page, "WAREHOUSE_OPERATOR");
    await expectForbidden(page, "/users");
    await expectAllowed(page, "/inventory/adjust", /Ajuste de Inventario/i);
    await expectAllowed(page, "/inventory/transfer", /Transferencia Interna/i);
    await expectAllowed(page, "/inventory/pick", /Picking/i);
    await expectForbidden(page, "/audit");
  });

  test("SALES_EXECUTIVE no accede a ajustes, transferencias, picking ni auditoria", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await expectForbidden(page, "/users");
    await expectForbidden(page, "/inventory/adjust");
    await expectForbidden(page, "/inventory/transfer");
    await expectForbidden(page, "/inventory/pick");
    await expectForbidden(page, "/audit");
  });

  test("SALES_EXECUTIVE opera el flujo nuevo de pedidos dentro de ensamble", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await expectAllowed(page, "/production/requests", /Pedidos de surtido/i);
    await expectAllowed(page, "/production/requests/new", /Nuevo pedido de surtido/i);
    await expectAllowed(page, "/production/availability", /Disponibilidad para pedidos/i);
    await expectAllowed(page, "/production/equivalences", /Equivalencias para pedidos/i);
  });

  test("rutas legacy de sales redirigen al flujo nuevo", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await expectRedirectedAllowed(page, "/sales", /\/production\/requests(?:\?.*)?$/, /Pedidos de surtido/i);
    await expectRedirectedAllowed(page, "/sales/orders", /\/production\/requests(?:\?.*)?$/, /Pedidos de surtido/i);
    await expectRedirectedAllowed(page, "/sales/orders/new", /\/production\/requests\/new(?:\?.*)?$/, /Nuevo pedido de surtido/i);
  });
});
