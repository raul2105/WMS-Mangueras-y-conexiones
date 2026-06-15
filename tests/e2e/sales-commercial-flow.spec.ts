import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { createSalesRequestDraftHeader } from "@/lib/sales/request-service";
import { loginAs } from "./lib/auth.helpers";

const prisma = new PrismaClient();
let createdSalesOrderId = "";
let createdWarehouseId = "";

test.describe("sales commercial flow", () => {
  test.beforeAll(async () => {
    const manager = await prisma.user.findUnique({
      where: { email: "manager@scmayher.com" },
      select: { id: true },
    });
    if (!manager) {
      throw new Error("Missing manager fixture for sales commercial flow");
    }

    let warehouse = await prisma.warehouse.findFirst({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true },
    });
    if (!warehouse) {
      const createdWarehouse = await prisma.warehouse.create({
        data: {
          code: `E2E-SALES-WH-${Date.now()}`,
          name: "Almacén ventas E2E",
          address: "Fixture",
          isActive: true,
        },
        select: { id: true },
      });
      warehouse = createdWarehouse;
      createdWarehouseId = createdWarehouse.id;
    }

    const createdOrder = await createSalesRequestDraftHeader(prisma, {
      customerName: "Cliente comercial E2E",
      warehouseId: warehouse.id,
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      notes: "Fixture sales commercial flow",
      requestedByUserId: manager.id,
      requestedByRoles: ["MANAGER"],
    });
    createdSalesOrderId = createdOrder.id;
  });

  test.afterAll(async () => {
    if (createdSalesOrderId) {
      await prisma.salesInternalOrder.deleteMany({
        where: { id: createdSalesOrderId },
      });
    }
    if (createdWarehouseId) {
      await prisma.warehouse.deleteMany({ where: { id: createdWarehouseId } });
    }
    await prisma.$disconnect();
  });

  test("sales executive lands on a commercial queue with shortcuts and no forbidden actions", async ({
    page,
  }) => {
    const consoleMessages: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "warning" || message.type() === "error") {
        consoleMessages.push(message.text());
      }
    });

    await loginAs(page, "SALES_EXECUTIVE", "/production/requests");
    await page.goto("/production/requests");

    await expect(
      page.getByRole("heading", { name: /Pedidos comerciales/i }),
    ).toBeVisible();
    await expect(
      page.getByTestId("requests-quick-filters").getByRole("link", {
        name: /^Mis pedidos$/,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Disponibles para asignarme", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Siguiente acción/i).first()).toBeVisible();
    await expect(page.getByTestId("requests-quick-filters")).toBeVisible();
    await expect(
      page.getByTestId("requests-quick-filters").getByRole("link", {
        name: /^Todos$/,
      }),
    ).toBeVisible();
    await expect(
      page.getByTestId("requests-quick-filters").getByRole("link", {
        name: /^Urgentes$/,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^Vencen hoy$/i }),
    ).toHaveCount(1);
    await expect(page.getByText("Más filtros", { exact: true })).toBeVisible();
    await expect(page.getByTestId("requests-customer-filter")).toBeHidden();
    await page.locator('[data-testid="requests-more-filters"] summary').click();
    await expect(page.getByTestId("requests-customer-filter")).toBeVisible();
    await expect(page.getByTestId("desktop-main-nav").getByRole("link", { name: /^Pedidos$/i })).toBeVisible();
    await expect(page.getByTestId("desktop-main-nav").getByRole("link", { name: /Clientes/i })).toBeVisible();
    await expect(page.getByTestId("desktop-main-nav").getByRole("link", { name: /Cat[aá]logo/i })).toHaveCount(0);
    await expect(page.getByTestId("desktop-main-nav").getByRole("link", { name: /Disponibilidad/i })).toHaveCount(0);
    await expect(page.getByTestId("desktop-main-nav").getByRole("link", { name: /Equivalencias/i })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /\+ Nuevo pedido/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Inventario/i })).toHaveCount(
      0,
    );
    await expect(page.getByRole("link", { name: /Almacenes/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Nueva OC/i })).toHaveCount(0);
    expect(
      consoleMessages.filter((message) =>
        /hydration|did not match/i.test(message),
      ),
    ).toEqual([]);
  });

  test("new request uses a guided customer-first capture flow", async ({
    page,
  }) => {
    await loginAs(page, "SALES_EXECUTIVE", "/production/requests/new");
    await page.goto("/production/requests/new");

    await expect(
      page.getByRole("heading", { name: /Nuevo pedido comercial/i }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /Captura comercial/i })).toBeVisible();
    await expect(page.getByLabel(/Selecciona o crea el cliente/i)).toBeVisible();
    await expect(page.getByText(/¿No encuentras al cliente\? Regístralo/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /2\. Datos del pedido/i })).toBeVisible();
    await expect(page.getByLabel(/Almacén/i)).toBeVisible();
    await expect(page.getByLabel(/Fecha compromiso/i)).toBeVisible();
    await expect(page.getByLabel(/Notas del pedido/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Crear pedido/i }),
    ).toBeVisible();
  });

  test("requests page summarizes active filters compactly and exposes advanced groups", async ({
    page,
  }) => {
    await loginAs(page, "SALES_EXECUTIVE", "/production/requests?queue=today&customer=ACME");
    await page.goto("/production/requests?queue=today&customer=ACME");

    await expect(
      page.getByRole("heading", { name: /Pedidos comerciales/i }),
    ).toBeVisible();
    await expect(page.getByTestId("requests-active-filters")).toBeVisible();
    await expect(page.getByTestId("requests-active-filters")).toContainText(
      "Filtros activos:",
    );
    await expect(page.getByTestId("requests-active-filters")).toContainText(
      "Cola: Vencen hoy",
    );
    await expect(page.getByTestId("requests-active-filters")).toContainText(
      "Cliente: ACME",
    );
    await expect(
      page.getByTestId("requests-active-filters").getByRole("link", {
        name: /Limpiar todo/i,
      }),
    ).toBeVisible();
    await page
      .getByTestId("requests-active-filters")
      .getByRole("link", { name: /Cliente: ACME/i })
      .click();
    await expect(page).toHaveURL(/\/production\/requests\?queue=today(?:&.*)?$/);
    await expect(page).not.toHaveURL(/customer=/);

    await page.locator('[data-testid="requests-more-filters"] summary').click();
    await expect(
      page.getByTestId("requests-more-filters").getByText("Cliente", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText("Filtrar por cliente", { exact: true })).toBeVisible();
    await expect(page.getByText("Estado comercial", { exact: true })).toBeVisible();
    await expect(page.getByText("Etapa", { exact: true })).toBeVisible();
    await expect(page.getByText("Riesgo / tiempo", { exact: true })).toBeVisible();
    await expect(page.getByText("Operación", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Borrador$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Captura$/i })).toBeVisible();
  });

  test("mobile queue remains card-first and readable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "SALES_EXECUTIVE", "/production/requests");
    await page.goto("/production/requests");

    await expect(
      page.getByRole("heading", { name: /Pedidos comerciales/i }),
    ).toBeVisible();
    await expect(page.getByText(/Siguiente acción/i).first()).toBeVisible();
    await expect(
      page.getByTestId("requests-quick-filters").getByRole("link", {
        name: /^Mis pedidos$/,
      }),
    ).toBeVisible();
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(410);
  });

  test("manager can still supervise the queue and legacy sales wrappers resolve cleanly", async ({
    page,
  }) => {
    await loginAs(page, "MANAGER", "/production/requests");
    await page.goto("/production/requests");

    await expect(
      page.getByRole("heading", { name: /Pedidos comerciales/i }),
    ).toBeVisible();
    await expect(
      page.locator("summary").filter({ hasText: /Vista administrativa/i }),
    ).toBeVisible();

    await page.goto("/sales");
    await expect(page).toHaveURL(/\/production\/requests(?:\?.*)?$/);
    await expect(
      page.getByRole("heading", { name: /Pedidos comerciales/i }),
    ).toBeVisible();

    await page.goto("/sales/orders");
    await expect(page).toHaveURL(/\/production\/requests(?:\?.*)?$/);
    await expect(
      page.getByRole("heading", { name: /Pedidos comerciales/i }),
    ).toBeVisible();

    await page.goto("/sales/orders/new");
    await expect(page).toHaveURL(/\/production\/requests\/new(?:\?.*)?$/);
    await expect(
      page.getByRole("heading", { name: /Nuevo pedido comercial/i }),
    ).toBeVisible();
  });
});
