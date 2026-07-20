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

  test("guided progress labels are visible (Cliente, Producto, Entrega)", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/production/requests/new");
    
    await expect(page.getByTestId("sales-order-stepper")).toBeVisible();
    await expect(page.getByTestId("sales-order-step-customer")).toBeVisible();
    await expect(page.getByTestId("sales-order-step-product")).toBeVisible();
    await expect(page.getByTestId("sales-order-step-delivery")).toBeVisible();
    
    // Verify labels
    await expect(page.getByTestId("sales-order-step-customer")).toHaveText(/Cliente/);
    await expect(page.getByTestId("sales-order-step-product")).toHaveText(/Producto/);
    await expect(page.getByTestId("sales-order-step-delivery")).toHaveText(/Entrega/);
  });

  test("empty/new order shows first missing action clearly", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/production/requests/new");
    
    await expect(page.getByRole("heading", { name: /¿Quién es el cliente\?/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continuar a producto/i })).toBeDisabled();
    await expect(page.getByTestId("sales-order-step-product")).toBeDisabled();
    await expect(page.getByTestId("sales-order-step-delivery")).toBeDisabled();
  });

  test("guided capture shows only the current task", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/production/requests/new");
    
    await expect(page.getByTestId("sales-order-stepper")).toBeVisible();
    await expect(page.getByRole("heading", { name: /¿Quién es el cliente\?/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /¿Qué necesita el cliente\?/i })).not.toBeVisible();
  });

  test("MANAGER can access the flow", async ({ page }) => {
    await loginAs(page, "MANAGER");
    await page.goto("/production/requests/new");
    
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await expect(page.getByTestId("sales-order-stepper")).toBeVisible();
  });

  test("SYSTEM_ADMIN can access the flow", async ({ page }) => {
    await loginAs(page, "SYSTEM_ADMIN");
    await page.goto("/production/requests/new");
    
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await expect(page.getByTestId("sales-order-stepper")).toBeVisible();
  });

  test("warehouse-only actions are not exposed in the sales order builder", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/production/requests/new");
    
    // Should not have warehouse operator actions like "Iniciar surtido", "Marcar entregado", etc.
    await expect(page.getByRole("button", { name: /Iniciar surtido/i })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /Marcar entregado/i })).not.toBeVisible();
    await expect(page.getByRole("link", { name: /Surtido/i })).not.toBeVisible();
  });

  test("guided capture blocks later steps until the customer is selected", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/production/requests/new");

    const continueToProduct = page.getByRole("button", { name: /Continuar a producto/i });
    await expect(continueToProduct).toBeVisible();
    await expect(continueToProduct).toBeDisabled();
    await expect(page.getByTestId("sales-order-step-product")).toBeDisabled();
    await expect(page.getByTestId("sales-order-step-delivery")).toBeDisabled();
  });

  test("mobile layout does not overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/production/requests/new");
    
    // Check page is rendered without horizontal scroll
    const body = page.locator("body");
    const bodyWidth = await body.evaluate(el => el.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(390);
    
    await expect(page.getByTestId("sales-order-stepper")).toBeVisible();
  });
});
