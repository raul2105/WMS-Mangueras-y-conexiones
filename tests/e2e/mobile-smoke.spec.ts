import { test, expect } from "@playwright/test";
import { loginAs, type RoleKey } from "./lib/auth.helpers";

const MOBILE_ROUTES = [
  { path: "/", role: "SYSTEM_ADMIN" as RoleKey, heading: /Inicio Administraci[oó]n/i },
  {
    path: "/production/requests",
    role: "SALES_EXECUTIVE" as RoleKey,
    heading: /Pedidos y surtidos/i,
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
    heading: /^Trabajo de recepción$/i,
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
      test(`carga correctamente en móvil`, async ({ page }, testInfo) => {
        test.skip(!testInfo.project.name.startsWith("mobile"), "Este smoke solo valida proyectos móviles.");
        const expectedUrl = path === "/" ? undefined : path;
        await loginAs(page, role, path, expectedUrl);
        const routePage = page;
        await expect(routePage.getByRole("heading", { name: heading })).toBeVisible();
        if (path === "/production/requests" && role === "SALES_EXECUTIVE") {
          await expect(routePage.getByTestId("requests-quick-filters")).toBeVisible();
          await expect(
            routePage.getByTestId("requests-quick-filters").getByRole("link", {
              name: /^Para actuar$/,
            }),
          ).toBeVisible();
          await expect(routePage.getByText("Más filtros", { exact: true })).toBeVisible();
          await expect(routePage.getByTestId("requests-customer-filter")).toBeHidden();
          await routePage.locator('[data-testid="requests-more-filters"] summary').click();
          await expect(routePage.getByTestId("requests-customer-filter")).toBeVisible();
          const requestCards = routePage.getByTestId("request-card");
          if ((await requestCards.count()) > 0) {
            await expect(requestCards.first()).toBeVisible();
            await expect(
              requestCards.first().getByText(
                "Ver seguimiento operativo",
                { exact: true },
              ),
            ).toBeVisible();
            const firstCardHeight = await requestCards.first().boundingBox();
            expect(firstCardHeight?.height ?? 0).toBeLessThan(520);
          } else {
            await expect(routePage.getByText(/No hay pedidos/i).first()).toBeVisible();
          }
          await expect(routePage.getByText("Vista administrativa", { exact: true })).toHaveCount(0);
          const quickFiltersHeight = await routePage
            .getByTestId("requests-quick-filters")
            .boundingBox();
          expect(quickFiltersHeight?.height ?? 0).toBeLessThan(120);
        }
        if (path === "/production/requests/new" && role === "SALES_EXECUTIVE") {
          await expect(routePage.getByLabel(/Selecciona o crea el cliente/i)).toBeVisible();
        }
        if (path === "/purchasing/orders" && role === "WAREHOUSE_OPERATOR") {
          await expect(
            routePage.getByRole("link", { name: /\+ Nueva OC/i }),
          ).toHaveCount(0);
          await expect(
            routePage.getByRole("link", { name: /Por recibir hoy/i }),
          ).toBeVisible();
          const receiveLinks = routePage.getByRole("link", { name: /Recibir mercancía/i });
          if ((await receiveLinks.count()) > 0) {
            await expect(receiveLinks.first()).toBeVisible();
          } else {
            await expect(routePage.getByText(/No hay trabajo en esta bandeja/i).first()).toBeVisible();
          }
        }
        if (path === "/purchasing/orders" && role === "MANAGER") {
          await expect(
            routePage.getByRole("link", { name: /Por enviar o recibir/i }),
          ).toBeVisible();
        }
        const bodyWidth = await routePage.evaluate(() => document.body.scrollWidth);
        const viewportWidth = routePage.viewportSize()?.width ?? 390;
        expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 20);
      });
    });
  } else {
    test.describe(`Mobile: ${path} (public)`, () => {
      test(`carga correctamente en móvil`, async ({ page }, testInfo) => {
        test.skip(!testInfo.project.name.startsWith("mobile"), "Este smoke solo valida proyectos móviles.");
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
