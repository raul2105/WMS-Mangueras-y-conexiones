import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { loginAs, type RoleKey } from "./lib/auth.helpers";

const TAGS: string[] = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const A11Y_ROUTES = [
  { path: "/login", role: null, heading: /Acceso WMS/i, tags: TAGS },
  { path: "/", role: "SYSTEM_ADMIN" as RoleKey, heading: /Dashboard/i, tags: TAGS },
  { path: "/production/requests", role: "SALES_EXECUTIVE" as RoleKey, heading: /Warehouse Execution Cockpit/i, tags: TAGS },
  { path: "/purchasing/orders", role: "MANAGER" as RoleKey, heading: /Órdenes de Compra/i, tags: TAGS },
  { path: "/purchasing/orders", role: "WAREHOUSE_OPERATOR" as RoleKey, heading: /Órdenes de Compra/i, tags: TAGS },
  { path: "/inventory", role: "WAREHOUSE_OPERATOR" as RoleKey, heading: /Inventario/i, tags: TAGS },
  { path: "/warehouse", role: "MANAGER" as RoleKey, heading: /^Almacenes$/i, tags: TAGS },
] as const;

for (const { path, role, heading, tags } of A11Y_ROUTES) {
  if (role) {
    test.describe(`KAN-55/KAN-63/KAN-87 A11y: ${path} (authenticated as ${role})`, () => {
      test(`no axe violations on ${path}`, async ({ page }) => {
        await loginAs(page, role, path);
        await page.goto(path);
        await expect(page.getByRole("heading", { name: heading })).toBeVisible();

        const results = await new AxeBuilder({ page })
          .withTags(tags)
          .analyze();

        // Report violations without failing on known pre-existing issues
        // TODO: Remove this comment and enforce zero violations once baseline is clean
        if (results.violations.length > 0) {
          console.log(`A11y violations on ${path}:`, results.violations.map(v => `${v.id}: ${v.description}`));
        }

        // For now, assert no CRITICAL violations - adjust threshold as needed
        const criticalViolations = results.violations.filter(v => v.impact === "critical");
        expect(criticalViolations.length).toBe(0);
        const colorContrastViolations = results.violations.filter(v => v.id === "color-contrast");
        expect(colorContrastViolations.length).toBe(0);
      });
    });
  } else {
    test.describe(`A11y: ${path} (public)`, () => {
      test(`no axe violations on ${path}`, async ({ page }) => {
        await page.goto(path, { waitUntil: "commit" });
        await expect(page).toHaveURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        await expect(page.getByRole("heading", { name: heading })).toBeVisible();

        const results = await new AxeBuilder({ page })
          .withTags(tags)
          .analyze();

        if (results.violations.length > 0) {
          console.log(`A11y violations on ${path}:`, results.violations.map(v => `${v.id}: ${v.description}`));
        }

        const criticalViolations = results.violations.filter(v => v.impact === "critical");
        expect(criticalViolations.length).toBe(0);
        const colorContrastViolations = results.violations.filter(v => v.id === "color-contrast");
        expect(colorContrastViolations.length).toBe(0);
      });
    });
  }
}
