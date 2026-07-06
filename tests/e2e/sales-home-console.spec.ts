import { expect, test } from "@playwright/test";
import {
  loginAs,
  buildUrlExpectation,
} from "./lib/auth.helpers";

test.describe("Sales Home Console (KAN-126)", () => {
  test.beforeEach(async ({ page }) => {
    // Login as SALES_EXECUTIVE and navigate to /sales
    // The /sales page is now the dedicated sales console, not a redirect
    await loginAs(page, "SALES_EXECUTIVE", "/sales", "/sales");
    await expect(page).toHaveURL(buildUrlExpectation("/sales"));
  });

  test("SALES_EXECUTIVE can open /sales and it does not redirect to /production/requests", async ({ page }) => {
    await page.goto("/sales");
    await expect(page).toHaveURL(buildUrlExpectation("/sales"));
    // Should NOT redirect to production/requests
    await expect(page).not.toHaveURL(/\/production\/requests/);
  });

  test("Page shows 'Ventas' heading", async ({ page }) => {
    await page.goto("/sales");
    await expect(page.getByRole("heading", { name: "Ventas" })).toBeVisible();
  });

  test("Page shows primary 'Nuevo pedido' CTA", async ({ page }) => {
    await page.goto("/sales");
    await expect(page.getByRole("link", { name: /Nuevo pedido/i })).toBeVisible();
  });

  test("Page shows quick action links", async ({ page }) => {
    await page.goto("/sales");

    // Quick actions - check they exist on the page
    await expect(page.getByRole("link", { name: /Buscar producto/i })).toHaveAttribute("href", "/catalog");
    await expect(page.getByRole("link", { name: /Ver disponibilidad/i })).toHaveAttribute("href", "/production/availability");
    await expect(page.getByRole("link", { name: /Revisar equivalencias/i })).toHaveAttribute("href", "/production/equivalences");
    await expect(page.getByRole("link", { name: /^Clientes$/i })).toHaveAttribute("href", "/sales/customers");
  });

  test("Page shows 'Mi trabajo activo' section with commercial stage labels", async ({ page }) => {
    await page.goto("/sales");

    // Check for commercial stage labels (the cards in "Mi trabajo activo" section)
    // Just verify the stage names are visible - use first() to avoid duplicate text issues
    await expect(page.getByText("En captura").first()).toBeVisible();
    await expect(page.getByText("Por asignar").first()).toBeVisible();
    await expect(page.getByText("En surtido").first()).toBeVisible();
    await expect(page.getByText("Listos para entregar").first()).toBeVisible();
    await expect(page.getByText("Entregados").first()).toBeVisible();
  });

  test("Page does not expose warehouse-only primary actions", async ({ page }) => {
    await page.goto("/sales");

    // Should not have warehouse/operator-specific actions as primary
    await expect(page.getByText(/Cockpit de ejecuci[oó]n/i)).not.toBeVisible();
    await expect(page.getByText(/Vista administrativa/i)).not.toBeVisible();
    await expect(page.getByRole("heading", { name: /Producci[oó]n/i })).not.toBeVisible();
  });

  test("Mobile layout does not horizontally overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/sales");

    // Check body doesn't overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    await expect(bodyWidth).toBeLessThanOrEqual(375);

    // Check main content doesn't overflow
    const mainWidth = await page.evaluate(() => {
      const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
      return main.scrollWidth;
    });
    await expect(mainWidth).toBeLessThanOrEqual(375);
  });

  test("Empty state shown when no recent orders", async ({ page }) => {
    await page.goto("/sales");

    // Check if empty state is visible (when no orders exist)
    if (await page.getByText("No hay pedidos recientes").isVisible()) {
      await expect(page.getByText("No hay pedidos recientes")).toBeVisible();
      await expect(page.getByRole("link", { name: /Nuevo pedido/i })).toBeVisible();
      await expect(page.getByRole("link", { name: /Buscar producto/i })).toBeVisible();
    }
  });
});

// Additional test for other roles that should have access
test.describe("Sales Home Console - Role Access", () => {
  test("MANAGER can access /sales", async ({ page }) => {
    await loginAs(page, "MANAGER", "/sales", "/sales");
    await expect(page).toHaveURL(buildUrlExpectation("/sales"));
    await expect(page.getByRole("heading", { name: "Ventas" })).toBeVisible();
  });

  test("SYSTEM_ADMIN can access /sales", async ({ page }) => {
    await loginAs(page, "SYSTEM_ADMIN", "/sales", "/sales");
    await expect(page).toHaveURL(buildUrlExpectation("/sales"));
    await expect(page.getByRole("heading", { name: "Ventas" })).toBeVisible();
  });
});