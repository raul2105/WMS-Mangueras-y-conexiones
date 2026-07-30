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

  test("sales sees a fresh promise and warehouse sees the preserved handoff", async ({ page }) => {
    if (!productSku || !warehouseCode || !orderCode) {
      throw new Error("Missing KAN-128 AWS read-only test identifiers.");
    }

    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto(`/production/availability?q=${encodeURIComponent(productSku)}&sku=${encodeURIComponent(productSku)}&source=catalog`);

    await expect(page.getByRole("heading", { name: /Disponibilidad comercial/i })).toBeVisible();
    const createOrder = page.getByRole("link", { name: new RegExp(`Crear pedido.*${warehouseCode}`, "i") });
    await expect(createOrder).toBeVisible();
    await createOrder.click();

    await expect(page).toHaveURL(/\/production\/requests\/new/);
    await expect(page.getByTestId("commercial-promise-section")).toBeVisible();
    await expect(page.getByTestId("commercial-promise-status")).toHaveText("Promesa segura");

    await page.goto("/logout");
    await loginAs(page, "WAREHOUSE_OPERATOR");
    await page.goto("/production/requests?queue=unreleased");

    await expect(page.getByRole("link", { name: orderCode, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Operar surtido" })).toBeVisible();
  });
});
