import { test } from "@playwright/test";
import {
  buildUrlExpectation,
  expectAllowed,
  expectRedirectedAllowed,
  loginAs,
} from "./lib/auth.helpers";

test.describe("role dashboard audit fixes", () => {
  test("SYSTEM_ADMIN can open labels landing page", async ({ page }) => {
    await loginAs(page, "SYSTEM_ADMIN");
    await expectAllowed(page, "/labels", /Etiquetas/i);
  });

  test("MANAGER legacy blocked fulfillment route resolves to the canonical blocked queue", async ({ page }) => {
    await loginAs(page, "MANAGER");
    await expectRedirectedAllowed(
      page,
      "/production/fulfillment?blocked=true",
      buildUrlExpectation("/production/requests?queue=assembly_blocked"),
      /Pedidos|Órdenes/i,
    );
  });

  test("WAREHOUSE_OPERATOR legacy active fulfillment route resolves to open assemblies", async ({ page }) => {
    await loginAs(page, "WAREHOUSE_OPERATOR");
    await expectRedirectedAllowed(
      page,
      "/production/fulfillment?status=active",
      buildUrlExpectation("/production?ops=assembly_open"),
      /Producción|Produccion/i,
    );
  });
});
