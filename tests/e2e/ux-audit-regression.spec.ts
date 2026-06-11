import { test, expect } from "@playwright/test";
import { loginAs } from "./lib/auth.helpers";

test.describe("KAN-55/KAN-63/KAN-87 regression coverage", () => {
  test("KAN-55 production cockpit keeps operational buckets visible", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE", "/production/requests");
    await page.goto("/production/requests");

    await expect(page.getByRole("heading", { name: /Warehouse Execution Cockpit/i })).toBeVisible();
    await expect(page.getByText("Mis pedidos", { exact: true })).toBeVisible();
    await expect(page.getByText("Disponibles para asignarme", { exact: true })).toBeVisible();
    await expect(page.locator('a[href*="queue=overdue"]')).toBeVisible();
    await expect(page.locator('a[href*="queue=today"]')).toBeVisible();
    await expect(page.locator('a[href*="queue=assembly_blocked"]')).toBeVisible();
  });

  test("KAN-87 purchasing list preserves Jira presets and read-only behavior", async ({ page }) => {
    await loginAs(page, "WAREHOUSE_OPERATOR", "/purchasing/orders");
    await page.goto("/purchasing/orders");

    await expect(page.getByRole("heading", { name: /Órdenes de Compra/i })).toBeVisible();
    await expect(page.getByText(/Vista de solo lectura para tu rol/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Todas/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Borrador/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Confirmadas/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Por recibir hoy/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /\+ Nueva OC/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Ver detalle/i })).toHaveCount(0);
  });

  test("KAN-87 purchasing list exposes manager actions when allowed", async ({ page }) => {
    await loginAs(page, "MANAGER", "/purchasing/orders");
    await page.goto("/purchasing/orders");

    await expect(page.getByRole("heading", { name: /Órdenes de Compra/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /\+ Nueva OC/i })).toBeVisible();
  });
});
