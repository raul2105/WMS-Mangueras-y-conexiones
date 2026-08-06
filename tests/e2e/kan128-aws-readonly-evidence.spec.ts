import { expect, test } from "@playwright/test";
import { loginAs } from "./lib/auth.helpers";

const enabled = process.env.WMS_AWS_READONLY_E2E === "1";
const productSku = process.env.WMS_KAN128_PRODUCT_SKU;
const warehouseCode = process.env.WMS_KAN128_WAREHOUSE_CODE;
const orderCode = process.env.WMS_KAN128_ORDER_CODE;

test.describe("KAN-128: AWS read-only operational evidence", () => {
  test.skip(
    !enabled,
    "Set WMS_AWS_READONLY_E2E=1 plus WMS_KAN128_PRODUCT_SKU, WMS_KAN128_WAREHOUSE_CODE and WMS_KAN128_ORDER_CODE to run this read-only AWS gate.",
  );

  test("sales sees a fresh promise and warehouse sees the preserved handoff", async ({ browser }) => {
    if (!productSku || !warehouseCode || !orderCode) {
      throw new Error("Missing KAN-128 AWS read-only test identifiers.");
    }

    const salesContext = await browser.newContext();
    const salesPage = await salesContext.newPage();
    try {
      await loginAs(salesPage, "SALES_EXECUTIVE");
      await salesPage.goto(`/production/availability?q=${encodeURIComponent(productSku)}&sku=${encodeURIComponent(productSku)}&source=catalog`);

      await expect(salesPage.getByRole("heading", { name: /Disponibilidad comercial/i })).toBeVisible();
      const warehousePicker = salesPage.locator("details").filter({ hasText: "Elegir almacén" }).first();
      if (await warehousePicker.count() > 0) {
        const stablePicker = salesPage.locator('[data-testid="choose-warehouse"]:visible').first();
        if (await stablePicker.count() > 0) {
          await stablePicker.click();
        } else {
          await salesPage.locator("summary:visible", { hasText: "Elegir almacén" }).first().click();
        }
      } else {
        const legacyPicker = salesPage.getByRole("button", { name: "Elegir almacén", exact: true });
        if (await legacyPicker.count() > 0) {
          await legacyPicker.click();
        } else {
          await salesPage.getByRole("link", { name: "Crear pedido", exact: true }).click();
        }
      }
      const warehouseOption = salesPage.locator(`[data-testid="commercial-order-warehouse-${warehouseCode}"]:visible`).first();
      const fallbackWarehouseOption = salesPage.locator("a:visible").filter({ hasText: warehouseCode }).last();
      if (await warehouseOption.count() > 0) {
        await warehouseOption.click();
      } else if (await fallbackWarehouseOption.count() > 0) {
        await fallbackWarehouseOption.click();
      }

      await expect(salesPage).toHaveURL(/\/production\/requests\/new/);
      await expect(salesPage.getByTestId("commercial-promise-section")).toBeVisible();
      await expect(salesPage.getByTestId("commercial-promise-status")).toHaveText("Promesa segura");
    } finally {
      await salesContext.close();
    }

    const warehouseContext = await browser.newContext();
    const warehousePage = await warehouseContext.newPage();
    try {
      await loginAs(warehousePage, "WAREHOUSE_OPERATOR");
      await warehousePage.goto("/production/requests?stage=en_surtido");

      await expect(warehousePage.getByRole("link", { name: orderCode, exact: true })).toBeVisible();
      const orderCard = warehousePage.getByTestId("request-card").filter({ hasText: orderCode }).first();
      await expect(orderCard).toContainText("Operador Almacen");
    } finally {
      await warehouseContext.close();
    }
  });
});
