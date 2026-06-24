import { expect, type Page } from "@playwright/test";

export const USERS = {
  SYSTEM_ADMIN: { email: "admin@scmayher.com", password: "Admin123*" },
  MANAGER: { email: "manager@scmayher.com", password: "Manager123*" },
  WAREHOUSE_OPERATOR: { email: "operator@scmayher.com", password: "Operator123*" },
  SALES_EXECUTIVE: { email: "sales@scmayher.com", password: "Sales123*" },
} as const;

export type RoleKey = keyof typeof USERS;

export const EXPECTED_HOME: Record<RoleKey, string> = {
  SYSTEM_ADMIN: "/home/admin",
  MANAGER: "/home/manager",
  WAREHOUSE_OPERATOR: "/home/warehouse",
  SALES_EXECUTIVE: "/home/sales",
};

export const EXPECTED_USER: Record<RoleKey, { name: string; email: string; navItems: number }> = {
  SYSTEM_ADMIN: { name: "Admin Principal", email: "admin@scmayher.com", navItems: 8 },
  MANAGER: { name: "Manager WMS", email: "manager@scmayher.com", navItems: 7 },
  WAREHOUSE_OPERATOR: { name: "Operador Almacen", email: "operator@scmayher.com", navItems: 5 },
  SALES_EXECUTIVE: { name: "Ejecutivo Ventas", email: "sales@scmayher.com", navItems: 4 },
};

export function buildUrlExpectation(path: string) {
  const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(path.includes("?") ? `${escapedPath}$` : `${escapedPath}(?:\\?.*)?$`);
}

export async function loginAs(
  page: Page,
  role: RoleKey,
  callbackUrl = "/",
  expectedUrl = EXPECTED_HOME[role],
) {
  const user = USERS[role];
  // Warm auth endpoints before the first browser login on a fresh dev server.
  // This avoids flaky first-request failures while webpack compiles auth routes.
  await page.request.get("/api/auth/session");
  await page.request.get("/api/auth/csrf");
  await page.goto(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  if (await page.getByLabel("Email").isVisible()) {
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Contrasena").fill(user.password);
    await page.getByRole("button", { name: "Iniciar sesion" }).click();
  }
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page).toHaveURL(buildUrlExpectation(expectedUrl));

  const expectedUser = EXPECTED_USER[role];
  await expect(page.getByRole("banner")).toContainText(expectedUser.name);
  await expect(page.getByRole("banner")).toContainText(expectedUser.email);
  await expect(page.getByRole("banner")).not.toContainText("Usuario");
  await page.waitForLoadState("networkidle");
    // Count nav links using data-testid to avoid desktop/mobile duplication
      // Count nav links; on mobile, open mobile nav first if needed
      const viewport = page.viewportSize();
      if (viewport && viewport.width < 768) {
        // Mobile viewport - open mobile nav drawer
        await page.getByLabel("Abrir navegacion").click();
        await expect(page.locator('[data-testid="mobile-main-nav"] a')).toHaveCount(expectedUser.navItems);
        const closeNavButton = page.getByLabel("Cerrar navegacion");
        await closeNavButton.click();
        await expect(closeNavButton).toBeHidden();
      } else {
        await expect(page.locator('[data-testid="desktop-main-nav"] a')).toHaveCount(expectedUser.navItems);
      }
}

export async function expectAllowed(
  page: Page,
  route: string,
  expectedHeading: RegExp
) {
  await page.goto(route);
  await expect(page).toHaveURL(new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await expect(page.getByRole("heading", { level: 1, name: expectedHeading })).toBeVisible();
}

export async function expectRedirectedAllowed(
  page: Page,
  route: string,
  expectedUrl: RegExp,
  expectedHeading: RegExp,
) {
  await page.goto(route);
  await expect(page).toHaveURL(expectedUrl);
  await expect(page.getByRole("heading", { level: 1, name: expectedHeading })).toBeVisible();
}

export async function expectForbidden(
  page: Page,
  route: string
) {
  await page.goto(route);
  await expect(page).toHaveURL(/\/forbidden/);
  await expect(page.getByText("Acceso denegado")).toBeVisible();
}
