import { test, expect } from "@playwright/test";
import { loginAs, type RoleKey } from "./lib/auth.helpers";

const MOBILE_ROUTES = [
  { path: "/", role: "SYSTEM_ADMIN" as RoleKey, heading: /Dashboard/i },
  {
    path: "/production/requests",
    role: "SALES_EXECUTIVE" as RoleKey,
    heading: /Pedidos comerciales/i,
  },
  {
    path: "/production/requests/new",
    role: "SALES_EXECUTIVE" as RoleKey,
    heading: /Nuevo pedido comercial/i,
  },
  {
    path: "/purchasing/orders",
    role: "MANAGER" as RoleKey,
    heading: /^Órdenes de compra$/i,
  },
  {
    path: "/purchasing/orders",
    role: "WAREHOUSE_OPERATOR" as RoleKey,
    heading: /^Órdenes de compra$/i,
  },
  {
    path: "/inventory",
    role: "WAREHOUSE_OPERATOR" as RoleKey,
    heading: /Inventario/i,
  },
  { path: "/login", role: null, heading: /Acceso WMS/i },
] as const;

for (const { path, role, heading } of MOBILE_ROUTES) {
  if (role) {
    test.describe(`Mobile: ${path} (authenticated as ${role})`, () => {
      test(`carga correctamente en móvil`, async ({ page }) => {
        const callbackUrl = path;
        await loginAs(page, role, callbackUrl);
        await page.goto(path);
        await expect(
          page.getByRole("heading", { name: heading }),
        ).toBeVisible();
        if (path === "/production/requests" && role === "SALES_EXECUTIVE") {
          await expect(page.getByTestId("requests-quick-filters")).toBeVisible();
          await expect(
            page.getByTestId("requests-quick-filters").getByRole("link", {
              name: /^Mis pedidos$/,
            }),
          ).toBeVisible();
          await expect(page.getByText("Más filtros", { exact: true })).toBeVisible();
          await expect(page.getByTestId("requests-customer-filter")).toBeHidden();
          await page.locator('[data-testid="requests-more-filters"] summary').click();
          await expect(page.getByTestId("requests-customer-filter")).toBeVisible();
          await expect(page.getByTestId("request-card").first()).toBeVisible();
          await expect(
            page.getByTestId("request-card").first().getByText(
              "Ver seguimiento operativo",
              { exact: true },
            ),
          ).toBeVisible();
          await expect(page.getByText("Vista administrativa", { exact: true })).toHaveCount(0);
          const quickFiltersHeight = await page
            .getByTestId("requests-quick-filters")
            .boundingBox();
          expect(quickFiltersHeight?.height ?? 0).toBeLessThan(120);
          const firstCardHeight = await page
            .getByTestId("request-card")
            .first()
            .boundingBox();
          expect(firstCardHeight?.height ?? 0).toBeLessThan(520);
        }
        if (path === "/production/requests/new" && role === "SALES_EXECUTIVE") {
          await expect(page.getByRole("heading", { name: /Captura comercial/i })).toBeVisible();
          await expect(page.getByLabel(/Selecciona o crea el cliente/i)).toBeVisible();
        }
        if (path === "/purchasing/orders" && role === "WAREHOUSE_OPERATOR") {
          await expect(
            page.getByRole("link", { name: /\+ Nueva OC/i }),
          ).toHaveCount(0);
          await expect(
            page.getByRole("link", { name: /Por recibir hoy/i }),
          ).toBeVisible();
        }
        if (path === "/purchasing/orders" && role === "MANAGER") {
          await expect(
            page.getByRole("link", { name: /Por recibir hoy/i }),
          ).toBeVisible();
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
        await expect(page).toHaveURL(
          new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        );
        await expect(
          page.getByRole("heading", { name: heading }),
        ).toBeVisible();
        const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
        const viewportWidth = page.viewportSize()?.width ?? 390;
        expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 20);
      });
    });
  }
}
