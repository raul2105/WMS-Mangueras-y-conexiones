import { test, expect } from "@playwright/test";
import { loginAs, type RoleKey } from "./lib/auth.helpers";

const MOBILE_ROUTES = [
  { path: "/", role: "SYSTEM_ADMIN" as RoleKey, heading: /Dashboard/i },
  { path: "/production/requests", role: "SALES_EXECUTIVE" as RoleKey, heading: /Warehouse Execution Cockpit/i },
  { path: "/purchasing/orders", role: "MANAGER" as RoleKey, heading: /Órdenes de Compra/i },
  { path: "/purchasing/orders", role: "WAREHOUSE_OPERATOR" as RoleKey, heading: /Órdenes de Compra/i },
  { path: "/inventory", role: "WAREHOUSE_OPERATOR" as RoleKey, heading: /Inventario/i },
  { path: "/login", role: null, heading: /Acceso WMS/i },
] as const;

for (const { path, role, heading } of MOBILE_ROUTES) {
  if (role) {
    test.describe(`Mobile: ${path} (authenticated as ${role})`, () => {
      test(`carga correctamente en móvil`, async ({ page }) => {
        const callbackUrl = path;
        await loginAs(page, role, callbackUrl);
        await page.goto(path);
        await expect(page.getByRole("heading", { name: heading })).toBeVisible();
        if (path === "/purchasing/orders" && role === "WAREHOUSE_OPERATOR") {
          await expect(page.getByRole("link", { name: /\+ Nueva OC/i })).toHaveCount(0);
          await expect(page.getByRole("link", { name: /Por recibir hoy/i })).toBeVisible();
        }
        if (path === "/purchasing/orders" && role === "MANAGER") {
          await expect(page.getByRole("link", { name: /Por recibir hoy/i })).toBeVisible();
        }
        const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
        const viewportWidth = page.viewportSize()?.width ?? 390;
        expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 20);
      });
    });
  } else {
    test.describe(`Mobile: ${path} (public)`, () => {
      test(`carga correctamente en móvil`, async ({ page }) => {
        await page.goto(path, { waitUntil: "commit" });
        await expect(page).toHaveURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        await expect(page.getByRole("heading", { name: heading })).toBeVisible();
        const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
        const viewportWidth = page.viewportSize()?.width ?? 390;
        expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 20);
      });
    });
  }
}
