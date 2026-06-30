import { expect, test } from "@playwright/test";
import { EXPECTED_HOME, USERS } from "./lib/auth.helpers";

test("login submits with a single Enter from the password field", async ({ page }) => {
  await page.request.get("/api/auth/session");
  await page.request.get("/api/auth/csrf");
  await page.goto("/login?callbackUrl=%2Fhome%2Fsales");

  await page.getByLabel("Email").fill(USERS.SALES_EXECUTIVE.email);
  await page.getByLabel("Contrasena").fill(USERS.SALES_EXECUTIVE.password);
  await page.getByLabel("Contrasena").press("Enter");

  await expect(page).not.toHaveURL(/\/login/);
  await expect(page).toHaveURL(buildExpectedUrl());
  await expect(page.getByRole("banner")).toContainText("Ejecutivo Ventas");
});

function buildExpectedUrl() {
  const escaped = EXPECTED_HOME.SALES_EXECUTIVE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}(?:\\?.*)?$`);
}
