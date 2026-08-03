import { expect, type Page } from "@playwright/test";

const CREDENTIAL_ENV_BY_ROLE = {
  SYSTEM_ADMIN: ["WMS_E2E_SYSTEM_ADMIN_EMAIL", "WMS_E2E_SYSTEM_ADMIN_PASSWORD"],
  MANAGER: ["WMS_E2E_MANAGER_EMAIL", "WMS_E2E_MANAGER_PASSWORD"],
  WAREHOUSE_OPERATOR: ["WMS_E2E_WAREHOUSE_OPERATOR_EMAIL", "WMS_E2E_WAREHOUSE_OPERATOR_PASSWORD"],
  SALES_EXECUTIVE: ["WMS_E2E_SALES_EXECUTIVE_EMAIL", "WMS_E2E_SALES_EXECUTIVE_PASSWORD"],
} as const;

function credentialFromEnv(role: keyof typeof CREDENTIAL_ENV_BY_ROLE) {
  const [emailKey, passwordKey] = CREDENTIAL_ENV_BY_ROLE[role];
  const email = process.env[emailKey];
  const password = process.env[passwordKey];
  if (!email || !password) {
    throw new Error(
      `Missing ${emailKey}/${passwordKey}. Configure role-specific E2E credentials in the local environment or GitHub Secrets.`,
    );
  }
  return { email, password };
}

export const USERS = {
  get SYSTEM_ADMIN() { return credentialFromEnv("SYSTEM_ADMIN"); },
  get MANAGER() { return credentialFromEnv("MANAGER"); },
  get WAREHOUSE_OPERATOR() { return credentialFromEnv("WAREHOUSE_OPERATOR"); },
  get SALES_EXECUTIVE() { return credentialFromEnv("SALES_EXECUTIVE"); },
} as const;

export type RoleKey = keyof typeof USERS;

export const EXPECTED_HOME: Record<RoleKey, string> = {
  SYSTEM_ADMIN: "/home/admin",
  MANAGER: "/home/manager",
  WAREHOUSE_OPERATOR: "/home/warehouse", // Note: redirect happens from /home/warehouse
  SALES_EXECUTIVE: "/home/sales",
};

const EXPECTED_USER_META = {
  SYSTEM_ADMIN: { name: "Admin Principal", navItems: 8 },
  MANAGER: { name: "Manager WMS", navItems: 7 },
  WAREHOUSE_OPERATOR: { name: "Operador Almacen", navItems: 5 },
  SALES_EXECUTIVE: { name: "Ejecutivo Ventas", navItems: 4 },
} as const;

export const EXPECTED_USER = new Proxy({} as Record<RoleKey, { name: string; email: string; navItems: number }>, {
  get(_target, propertyKey) {
    if (typeof propertyKey !== "string" || !(propertyKey in EXPECTED_USER_META)) return undefined;
    const role = propertyKey as RoleKey;
    return { ...EXPECTED_USER_META[role], email: USERS[role].email };
  },
});

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
