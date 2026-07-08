import { expect, test } from "@playwright/test";
import { loginAs } from "./lib/auth.helpers";

test.describe("KAN-129: Guided Nuevo Pedido Summary and Progress", () => {
  test("SALES_EXECUTIVE can open /production/requests/new from /sales Nuevo pedido", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/sales");
    
    const nuevoPedidoLink = page.getByRole("link", { name: /Nuevo pedido/i });
    await expect(nuevoPedidoLink).toBeVisible();
    await nuevoPedidoLink.click();
    
    await expect(page).toHaveURL(/\/production\/requests\/new/);
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
  });

  test("guided progress labels are visible (Cliente, Productos, Disponibilidad, Compromiso, Confirmación)", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/production/requests/new");
    
    // Check progress steps are visible (Progress steps in OrderSummary)
    await expect(page.getByText("Cliente")).toBeVisible();
    await expect(page.getByText("Productos")).toBeVisible();
    await expect(page.getByText("Disponibilidad")).toBeVisible();
    await expect(page.getByText("Compromiso")).toBeVisible();
    await expect(page.getByText("Confirmación")).toBeVisible();
  });

  test("empty/new order shows first missing action clearly", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/production/requests/new");
    
    // Check that readiness state shows "Pendiente de captura" or similar
    await expect(page.getByText(/Pendiente|pendiente/i)).toBeVisible();
    
    // Check that missing required fields are indicated
    await expect(page.getByText(/Cliente pendiente/i)).toBeVisible();
    await expect(page.getByText(/Almac.n pendiente/i)).toBeVisible();
    await expect(page.getByText(/Fecha pendiente/i)).toBeVisible();
  });

  test("persistent summary shows pending customer, product, warehouse/date states", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/production/requests/new");
    
    // Check persistent summary sidebar is visible
    await expect(page.getByText("Resumen del pedido")).toBeVisible();
    
    // Check pending states
    await expect(page.getByText("Cliente pendiente")).toBeVisible();
    await expect(page.getByText("Almacén pendiente")).toBeVisible();
    await expect(page.getByText("Fecha pendiente")).toBeVisible();
    await expect(page.getByText("Sin líneas seleccionadas")).toBeVisible();
  });

  test("MANAGER can access the flow", async ({ page }) => {
    await loginAs(page, "MANAGER");
    await page.goto("/production/requests/new");
    
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await expect(page.getByText("Resumen del pedido")).toBeVisible();
  });

  test("SYSTEM_ADMIN can access the flow", async ({ page }) => {
    await loginAs(page, "SYSTEM_ADMIN");
    await page.goto("/production/requests/new");
    
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await expect(page.getByText("Resumen del pedido")).toBeVisible();
  });

  test("warehouse-only actions are not exposed in the sales order builder", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/production/requests/new");
    
    // Should not have warehouse operator actions like "Iniciar surtido", "Marcar entregado", etc.
    await expect(page.getByRole("button", { name: /Iniciar surtido/i })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /Marcar entregado/i })).not.toBeVisible();
    await expect(page.getByRole("link", { name: /Surtido/i })).not.toBeVisible();
  });

  test("create/confirm action is blocked until required fields are complete", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/production/requests/new");
    
    // Check submit button is disabled initially
    const submitButton = page.getByRole("button", { name: /Crear pedido|Completa/i });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeDisabled();
    
    // Fill required fields but not all
    const warehouseSelect = page.getByLabel("Almacén");
    await warehouseSelect.selectOption({ index: 1 });
    
    const dueDateInput = page.getByLabel("Fecha compromiso");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dueDateStr = tomorrow.toISOString().split('T')[0];
    await dueDateInput.fill(dueDateStr);
    
    // Still missing customer - button should be disabled
    await expect(submitButton).toBeDisabled();
  });

  test("mobile layout does not overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/production/requests/new");
    
    // Check page is rendered without horizontal scroll
    const body = page.locator("body");
    const bodyWidth = await body.evaluate(el => el.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(390);
    
    // Check summary is collapsible on mobile
    await expect(page.getByText("Resumen del pedido")).toBeVisible();
  });
});