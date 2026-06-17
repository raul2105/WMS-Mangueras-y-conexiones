import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { updatePurchaseOrderStatusWithDocument } from "@/lib/purchasing/purchase-order-document-service";
import { loginAs } from "./lib/auth.helpers";

const prisma = new PrismaClient();
const unique = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

let operatorReceiveOrderFolio = "";
let operatorReceiveOrderId = "";

async function cleanupPurchasingFixtures() {
  const orderIds = [operatorReceiveOrderId].filter(Boolean);
  if (orderIds.length === 0) return;

  await prisma.purchaseOrderDocument.deleteMany({
    where: { purchaseOrderId: { in: orderIds } },
  });
  await prisma.purchaseOrderLine.deleteMany({
    where: { purchaseOrderId: { in: orderIds } },
  });
  await prisma.purchaseOrder.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.supplier.deleteMany({
    where: { code: { startsWith: "E2E-REG-SUP-" } },
  });
  await prisma.product.deleteMany({
    where: { sku: { startsWith: "E2E-REG-SKU-" } },
  });
}

test.describe("KAN-55/KAN-63/KAN-87 regression coverage", () => {
  test.beforeAll(async () => {
    await cleanupPurchasingFixtures();

    const supplier = await prisma.supplier.create({
      data: {
        code: `E2E-REG-SUP-${unique()}`,
        name: "Proveedor Regression",
        email: "regression@example.com",
        isActive: true,
      },
      select: { id: true },
    });

    const product = await prisma.product.create({
      data: {
        sku: `E2E-REG-SKU-${unique()}`,
        name: "Producto Regression",
        type: "HOSE",
      },
      select: { id: true },
    });

    operatorReceiveOrderFolio = `E2E-REG-PO-${unique()}`;
    const order = await prisma.purchaseOrder.create({
      data: {
        folio: operatorReceiveOrderFolio,
        supplierId: supplier.id,
        status: "BORRADOR",
        notes: "Fixture operator receive regression",
        lines: {
          create: [
            {
              productId: product.id,
              qtyOrdered: 2,
              qtyReceived: 0,
              unitPrice: 100,
              currency: "MXN",
            },
          ],
        },
      },
      select: { id: true },
    });

    await updatePurchaseOrderStatusWithDocument({
      purchaseOrderId: order.id,
      newStatus: "CONFIRMADA",
      prismaClient: prisma,
    });

    operatorReceiveOrderId = order.id;
  });

  test.afterAll(async () => {
    await cleanupPurchasingFixtures();
    await prisma.$disconnect();
  });

  test("KAN-55 production cockpit keeps operational buckets visible", async ({
    page,
  }) => {
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
    await expect(page.getByTestId("requests-quick-filters")).toBeVisible();
    await expect(
      page.getByTestId("requests-quick-filters").getByRole("link", {
        name: /^Todos$/,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^Vencen hoy$/i }),
    ).toHaveCount(1);
    await expect(page.getByText("Más filtros", { exact: true })).toBeVisible();
    await expect(page.getByTestId("requests-customer-filter")).toBeHidden();
    await page.locator('[data-testid="requests-more-filters"] summary').click();
    await expect(page.getByTestId("requests-customer-filter")).toBeVisible();
    await expect(page.getByText("Riesgo / tiempo", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Vencidos$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Sin movimiento$/i })).toBeVisible();
    await expect(page.getByText("Vista administrativa", { exact: true })).toHaveCount(0);
    const requestCards = page.getByTestId("request-card");
    if (await requestCards.count()) {
      await expect(requestCards.first()).toBeVisible();
      await expect(
        requestCards.first().getByText("Ver seguimiento operativo", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        requestCards.first().getByText("Resumen operativo persistente", {
          exact: true,
        }),
      ).toBeHidden();
    } else {
      await expect(
        page.getByText("No hay pedidos para el filtro seleccionado.", {
          exact: true,
        }),
      ).toBeVisible();
    }
  });

  test("KAN-87 purchasing list preserves Jira presets and operator receive actions", async ({
    page,
  }) => {
    await loginAs(page, "WAREHOUSE_OPERATOR", "/purchasing/orders");
    await page.goto("/purchasing/orders");

    await expect(
      page.getByRole("heading", { name: /^Órdenes de compra$/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/Vista operativa para tu rol/i),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Todas/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Borrador/i })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Confirmadas/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Por recibir hoy/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /\+ Nueva OC/i })).toHaveCount(
      0,
    );
    await expect(page.getByRole("link", { name: /Ver detalle/i })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("link", { name: /Recibir mercancía/i }).first(),
    ).toBeVisible();
  });

  test("KAN-87 purchasing list exposes manager actions when allowed", async ({
    page,
  }) => {
    await loginAs(page, "MANAGER", "/purchasing/orders");
    await page.goto("/purchasing/orders");

    await expect(
      page.getByRole("heading", { name: /^Órdenes de compra$/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /\+ Nueva OC/i }),
    ).toBeVisible();
  });
});
