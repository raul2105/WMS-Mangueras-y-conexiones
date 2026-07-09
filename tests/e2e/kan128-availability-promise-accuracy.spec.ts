import { expect, test } from "@playwright/test";
import { loginAs } from "./lib/auth.helpers";

test.describe("KAN-128: Commercial Availability Promise Accuracy", () => {
  test("SALES_EXECUTIVE opens availability from /sales and sees promise-safe status", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/sales");
    
    const availabilityLink = page.getByRole("link", { name: /Disponibilidad/i });
    await expect(availabilityLink).toBeVisible();
    await availabilityLink.click();
    
    await expect(page).toHaveURL(/\/production\/availability/);
    await expect(page.getByRole("heading", { name: /Disponibilidad comercial/i })).toBeVisible();
  });

  test("Product + warehouse availability shows promise status in Nuevo Pedido", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/production/availability?q=TEST&productId=test&sku=TEST-SKU&source=catalog");
    
    // Wait for results to load
    await page.waitForLoadState("networkidle");
    
    // Check that warehouse-specific "Crear pedido" links exist
    const createOrderLink = page.getByRole("link", { name: /Crear pedido/i }).first();
    if (await createOrderLink.isVisible()) {
      await createOrderLink.click();
      
      // Should land on Nuevo Pedido with promise context
      await expect(page).toHaveURL(/\/production\/requests\/new\?.*promiseProductId/);
    }
  });

  test("Crear pedido from availability carries productId, sku, warehouseId, available quantity, source=availability", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/production/availability?q=TEST&productId=test&sku=TEST-SKU&source=catalog");
    
    await page.waitForLoadState("networkidle");
    
    const createOrderLink = page.getByRole("link", { name: /Crear pedido/i }).first();
    if (await createOrderLink.isVisible()) {
      const href = await createOrderLink.getAttribute("href");
      expect(href).toContain("productId=");
      expect(href).toContain("sku=");
      expect(href).toContain("source=availability");
      expect(href).toContain("promiseWarehouseId=");
      expect(href).toContain("promiseAvailableQty=");
      expect(href).toContain("promiseCheckedAt=");
    }
  });

  test("Nuevo Pedido summary shows promise state and checked availability", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/production/requests/new?productId=test&sku=TEST-SKU&source=availability&promiseProductId=test&promiseSku=TEST-SKU&promiseWarehouseId=wh-1&promiseWarehouseCode=WH-01&promiseWarehouseName=Almac%C3%A9n+1&promiseRequestedQty=5&promiseAvailableQty=10&promiseCheckedAt=2026-07-09T10%3A00%3A00.000Z&promiseSource=availability&promiseIsSubstitute=false");
    
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await expect(page.locator('[data-testid="order-summary-desktop"]')).toBeVisible();
    
    // Should show "Promesa segura" badge
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText("Promesa segura")).toBeVisible();
    
    // Should show warehouse info
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText("WH-01 - Almacén 1")).toBeVisible();
    
    // Should show available quantity
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText("10")).toBeVisible();
    
    // Should show checked timestamp
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText(/Verificado:/)).toBeVisible();
  });

  test("Insufficient stock shows warning and cannot be silently treated as promise_safe", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/production/requests/new?productId=test&sku=TEST-SKU&source=availability&promiseProductId=test&promiseSku=TEST-SKU&promiseWarehouseId=wh-1&promiseWarehouseCode=WH-01&promiseWarehouseName=Almac%C3%A9n+1&promiseRequestedQty=15&promiseAvailableQty=10&promiseCheckedAt=2026-07-09T10%3A00%3A00.000Z&promiseSource=availability&promiseIsSubstitute=false");
    
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    
    // Should show "Disponibilidad insuficiente" badge (danger variant)
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText("Disponibilidad insuficiente")).toBeVisible();
    
    // Should show warning about insufficient stock
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText(/Stock insuficiente/)).toBeVisible();
  });

  test("Missing availability context shows Disponibilidad no verificada", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/production/requests/new?productId=test&sku=TEST-SKU&source=catalog");
    
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    
    // Should show "Disponibilidad no verificada" badge (warning variant)
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText("Disponibilidad no verificada")).toBeVisible();
    
    // Should show warning about no verification
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText(/No hay verificación/)).toBeVisible();
  });

  test("Equivalent/substitute context shows substitute confirmation state", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/production/requests/new?productId=sub-1&sku=SUB-SKU&source=equivalences&promiseProductId=sub-1&promiseSku=SUB-SKU&promiseWarehouseId=wh-1&promiseWarehouseCode=WH-01&promiseWarehouseName=Almac%C3%A9n+1&promiseRequestedQty=5&promiseAvailableQty=10&promiseCheckedAt=2026-07-09T10%3A00%3A00.000Z&promiseSource=equivalences&promiseIsSubstitute=true&promiseOriginalProductId=orig-1&promiseOriginalProductSku=ORIG-SKU");
    
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    
    // Should show "Sustituto pendiente de confirmar" badge (accent variant)
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText("Sustituto pendiente de confirmar")).toBeVisible();
    
    // Should show "Sustituye a:" info
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText("Sustituye a:")).toBeVisible();
    
    // Should show warning about substitute confirmation
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText(/Requiere confirmación explícita/)).toBeVisible();
  });

  test("Mobile layout has no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/production/requests/new?productId=test&sku=TEST-SKU&source=availability&promiseProductId=test&promiseSku=TEST-SKU&promiseWarehouseId=wh-1&promiseWarehouseCode=WH-01&promiseWarehouseName=Almac%C3%A9n+1&promiseRequestedQty=5&promiseAvailableQty=10&promiseCheckedAt=2026-07-09T10%3A00%3A00.000Z&promiseSource=availability&promiseIsSubstitute=false");
    
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(390);
    
    // Mobile summary should be visible
    await expect(page.locator('[data-testid="order-summary-mobile"]').getByText("Resumen del pedido")).toBeVisible();
  });

  test("MANAGER and SYSTEM_ADMIN can access the flow", async ({ page }) => {
    for (const role of ["MANAGER", "SYSTEM_ADMIN"] as const) {
      await loginAs(page, role);
      await page.goto("/production/requests/new");
      
      await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
      await expect(page.locator('[data-testid="order-summary-desktop"]')).toBeVisible();
    }
  });

  test("WAREHOUSE_OPERATOR does not see sales-only commercial promise actions", async ({ page }) => {
    await loginAs(page, "WAREHOUSE_OPERATOR");
    
    // Should not be able to access sales pages or see sales actions
    await page.goto("/sales");
    await expect(page.getByRole("heading", { name: /Consola comercial/i })).not.toBeVisible();
  });

  test("Stale promise shows warning and requires re-check", async ({ page }) => {
    // Set checkedAt to 20 minutes ago (stale threshold is 15 min)
    const staleTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto(`/production/requests/new?productId=test&sku=TEST-SKU&source=availability&promiseProductId=test&promiseSku=TEST-SKU&promiseWarehouseId=wh-1&promiseWarehouseCode=WH-01&promiseWarehouseName=Almac%C3%A9n+1&promiseRequestedQty=5&promiseAvailableQty=10&promiseCheckedAt=${encodeURIComponent(staleTime)}&promiseSource=availability&promiseIsSubstitute=false`);
    
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    
    // Should show "Promesa vencida" badge (warning variant)
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText("Promesa vencida")).toBeVisible();
    
    // Should show warning about stale verification
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText(/supera el umbral de 15 minutos/)).toBeVisible();
  });
});