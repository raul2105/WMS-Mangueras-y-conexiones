import { expect, test } from "@playwright/test";
import { EXPECTED_HOME, USERS, buildUrlExpectation, loginAs } from "./lib/auth.helpers";

async function warmAuth(page: import("@playwright/test").Page) {
  await page.request.get("/api/auth/session");
  await page.request.get("/api/auth/csrf");
}

async function submitLogin(page: import("@playwright/test").Page, role: keyof typeof USERS) {
  const user = USERS[role];
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Contrasena").fill(user.password);
  await page.getByRole("button", { name: "Iniciar sesion" }).click();
}

test.describe("login callback preservation", () => {
  test("unauthenticated protected route redirects to login with callback and returns after login", async ({ page }) => {
    await warmAuth(page);
    await page.goto("/production/requests?queue=assembly_blocked");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fproduction%2Frequests%3Fqueue%3Dassembly_blocked$/);

    await submitLogin(page, "MANAGER");

    await expect(page).toHaveURL(buildUrlExpectation("/production/requests?queue=assembly_blocked"));
    await expect(page.getByRole("heading", { level: 1, name: /Pedidos y surtidos/i })).toBeVisible();
  });

  test("unsafe external callback falls back to role home", async ({ page }) => {
    await warmAuth(page);
    await page.goto("/login?callbackUrl=https%3A%2F%2Fevil.example%2Fsteal");
    await submitLogin(page, "SALES_EXECUTIVE");

    await expect(page).toHaveURL(buildUrlExpectation(EXPECTED_HOME.SALES_EXECUTIVE));
    await expect(page.getByRole("banner")).toContainText("Ejecutivo Ventas");
  });

  test("unauthorized callback falls back to role home", async ({ page }) => {
    await warmAuth(page);
    await page.goto("/login?callbackUrl=%2Fproduction%2Ffulfillment%3Fblocked%3Dtrue");
    await submitLogin(page, "SALES_EXECUTIVE");

    await expect(page).toHaveURL(buildUrlExpectation(EXPECTED_HOME.SALES_EXECUTIVE));
    await expect(page.getByRole("banner")).toContainText("Ejecutivo Ventas");
  });

  test("direct login without callback still lands on role home", async ({ page }) => {
    await loginAs(page, "WAREHOUSE_OPERATOR");
    await expect(page).toHaveURL(buildUrlExpectation(EXPECTED_HOME.WAREHOUSE_OPERATOR));
  });
});
