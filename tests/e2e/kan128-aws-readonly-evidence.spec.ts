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
      const createOrder = salesPage.getByRole("link", { name: new RegExp(`Crear pedido.*${warehouseCode}`, "i") });
      await expect(createOrder).toBeVisible();
      await createOrder.click();

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
      await warehousePage.goto("/production/requests?queue=unreleased");

      await expect(warehousePage.getByRole("link", { name: orderCode, exact: true })).toBeVisible();
      await expect(warehousePage.getByRole("link", { name: "Operar surtido" })).toBeVisible();
    } finally {
      await warehouseContext.close();
    }
  });
});
