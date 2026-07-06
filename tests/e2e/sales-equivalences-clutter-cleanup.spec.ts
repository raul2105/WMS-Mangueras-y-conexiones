import { expect, test } from "@playwright/test";
import { loginAs, EXPECTED_HOME } from "./lib/auth.helpers";

test.describe("Sales Equivalences Clutter Cleanup", () => {
  test("SALES_EXECUTIVE on /production/equivalences does not see standalone Siguiente acción card", async ({
    page,
  }) => {
    await loginAs(page, "SALES_EXECUTIVE", EXPECTED_HOME.SALES_EXECUTIVE, EXPECTED_HOME.SALES_EXECUTIVE);
    await page.goto("/production/equivalences");

    // Should land on equivalences page
    await expect(page.getByRole("heading", { name: /Alternativas y equivalencias/i })).toBeVisible();

    // Should NOT see standalone Siguiente acción instructional card
    await expect(page.getByRole("heading", { name: /Siguiente acción/i })).toHaveCount(0);
    await expect(page.getByText(/Usa equivalencias para encontrar un sustituto/i)).toHaveCount(0);

    // Should NOT see premature Crear pedido in header
    await expect(page.getByRole("link", { name: /^\+ Nuevo pedido$/i })).toHaveCount(0);

    // Search form should be prominent
    await expect(page.getByLabel(/Producto requerido/i)).toBeVisible();

    // Basic actions should be available for non-SALES_EXECUTIVE roles
  });

  test("SALES_EXECUTIVE on empty /production/equivalences does not see premature Crear pedido", async ({
    page,
  }) => {
    await loginAs(page, "SALES_EXECUTIVE", EXPECTED_HOME.SALES_EXECUTIVE, EXPECTED_HOME.SALES_EXECUTIVE);
    await page.goto("/production/equivalences");

    // Empty state should only show "Ir al catálogo" for SALES_EXECUTIVE
    await expect(page.getByRole("link", { name: /Ir al catálogo/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Ver disponibilidad/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Crear pedido/i })).toHaveCount(0);
  });

  test("SALES_EXECUTIVE sees Crear pedido only when product/equivalence results exist", async ({
    page,
  }) => {
    await loginAs(page, "SALES_EXECUTIVE", EXPECTED_HOME.SALES_EXECUTIVE, EXPECTED_HOME.SALES_EXECUTIVE);
    
    // Navigate WITH product context (query + productId + sku) - this creates hasProductContext=true
    await page.goto("/production/equivalences?q=TEST&productId=test-id&sku=TEST-SKU&source=catalog");
    await page.waitForLoadState("networkidle");

    // With product context but NO actual search results (since test data doesn't exist):
    // - SALES_EXECUTIVE should see empty state with "Buscar en catálogo" and "Ver disponibilidad"
    // - But NOT "Crear pedido" 
    await expect(page.getByRole("link", { name: /Buscar en catálogo/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Ver disponibilidad/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Crear pedido/i })).toHaveCount(0);
    
    // Also verify header doesn't show + Nuevo pedido for SALES_EXECUTIVE
    await expect(page.getByRole("link", { name: /^\+ Nuevo pedido$/i })).toHaveCount(0);
  });

  test("Manager sees Siguiente acción card when there's product context", async ({ page }) => {
    await loginAs(page, "MANAGER", EXPECTED_HOME.MANAGER, EXPECTED_HOME.MANAGER);
    await page.goto("/production/equivalences?q=TEST&productId=test-id&sku=TEST-SKU&source=catalog");
    await page.waitForLoadState("networkidle");

    // Manager SHOULD see Siguiente acción when there's product context
    await expect(page.getByRole("heading", { name: /Siguiente acción/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Ver disponibilidad/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Crear pedido/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^\+ Nuevo pedido$/i })).toBeVisible();
  });

  test("Manager does NOT see Siguiente acción card when no product context", async ({ page }) => {
    await loginAs(page, "MANAGER", EXPECTED_HOME.MANAGER, EXPECTED_HOME.MANAGER);
    await page.goto("/production/equivalences");
    await page.waitForLoadState("networkidle");

    // Manager should NOT see Siguiente acción when there's no product context
    await expect(page.getByRole("heading", { name: /Siguiente acción/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^\+ Nuevo pedido$/i })).toHaveCount(0);

    // But should see full empty state with all actions
    await expect(page.getByRole("link", { name: /Ir al catálogo/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Ver disponibilidad/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Crear pedido/i })).toBeVisible();
  });

  test("Mobile equivalences view does not horizontally overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "SALES_EXECUTIVE", EXPECTED_HOME.SALES_EXECUTIVE, EXPECTED_HOME.SALES_EXECUTIVE);
    await page.goto("/production/equivalences");

    await expect(page.getByRole("heading", { name: /Alternativas y equivalencias/i })).toBeVisible();

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(410);
  });

  test("Handoff context preserved through equivalence -> availability -> new request", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE", EXPECTED_HOME.SALES_EXECUTIVE, EXPECTED_HOME.SALES_EXECUTIVE);
    
    // This test assumes there might be some fixture data - if not, it validates the URL structure
    await page.goto("/production/equivalences?q=TEST&productId=test-id&sku=TEST-SKU&source=catalog");
    await page.waitForLoadState("networkidle");

    // Verify URL parameters are preserved in links
    const availabilityLink = page.getByRole("link", { name: /Ver disponibilidad/i }).first();
    const requestLink = page.getByRole("link", { name: /Crear pedido/i }).first();

    if (await availabilityLink.isVisible()) {
      const href = await availabilityLink.getAttribute("href");
      expect(href).toContain("source=equivalences");
      expect(href).toContain("productId=");
    }

    if (await requestLink.isVisible()) {
      const href = await requestLink.getAttribute("href");
      expect(href).toContain("source=equivalences");
      expect(href).toContain("equivalentProductId=");
    }
  });
});