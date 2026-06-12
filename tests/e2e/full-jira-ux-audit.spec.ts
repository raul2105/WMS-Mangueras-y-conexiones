import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { updatePurchaseOrderStatusWithDocument } from "@/lib/purchasing/purchase-order-document-service";
import { loginAs } from "./lib/auth.helpers";

const prisma = new PrismaClient();
const unique = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

let draftOrderId = "";
let confirmedOrderId = "";
let overdueOrderId = "";
let partialOrderId = "";
let receivedOrderId = "";

function makeExpectedDate(daysFromToday: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + daysFromToday);
  return date;
}

async function cleanupFixtures() {
  const orderIds = [
    draftOrderId,
    confirmedOrderId,
    overdueOrderId,
    partialOrderId,
    receivedOrderId,
  ].filter(Boolean);
  if (orderIds.length === 0) return;

  await prisma.purchaseOrderDocument.deleteMany({
    where: { purchaseOrderId: { in: orderIds } },
  });
  await prisma.purchaseOrderLine.deleteMany({
    where: { purchaseOrderId: { in: orderIds } },
  });
  await prisma.purchaseOrder.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.supplier.deleteMany({
    where: { code: { startsWith: "E2E-JIRA-SUP-" } },
  });
  await prisma.product.deleteMany({
    where: { sku: { startsWith: "E2E-JIRA-SKU-" } },
  });
}

test.describe
  .serial("KAN-55/KAN-63/KAN-82/KAN-83/KAN-87/KAN-88/Jira UX audit", () => {
  test.beforeAll(async () => {
    await cleanupFixtures();

    const supplier = await prisma.supplier.create({
      data: {
        code: `E2E-JIRA-SUP-${unique()}`,
        name: "Proveedor Jira UX",
        email: "jira-ux@example.com",
        isActive: true,
      },
      select: { id: true },
    });

    const product = await prisma.product.create({
      data: {
        sku: `E2E-JIRA-SKU-${unique()}`,
        name: "Producto Jira UX",
        type: "HOSE",
      },
      select: { id: true },
    });

    const draftOrder = await prisma.purchaseOrder.create({
      data: {
        folio: `E2E-PO-DRAFT-${unique()}`,
        supplierId: supplier.id,
        status: "BORRADOR",
        expectedDate: makeExpectedDate(1),
        notes: "Fixture Jira UX - borrador",
        lines: {
          create: [
            {
              productId: product.id,
              qtyOrdered: 3,
              qtyReceived: 0,
              unitPrice: 100,
              currency: "MXN",
            },
          ],
        },
      },
      select: { id: true },
    });

    const confirmedDraft = await prisma.purchaseOrder.create({
      data: {
        folio: `E2E-PO-CONF-${unique()}`,
        supplierId: supplier.id,
        status: "BORRADOR",
        expectedDate: makeExpectedDate(0),
        notes: "Fixture Jira UX - confirmada",
        lines: {
          create: [
            {
              productId: product.id,
              qtyOrdered: 2,
              qtyReceived: 0,
              unitPrice: 200,
              currency: "MXN",
            },
          ],
        },
      },
      select: { id: true },
    });

    await updatePurchaseOrderStatusWithDocument({
      purchaseOrderId: confirmedDraft.id,
      newStatus: "CONFIRMADA",
      prismaClient: prisma,
    });

    const overdueOrder = await prisma.purchaseOrder.create({
      data: {
        folio: `E2E-PO-OVERDUE-${unique()}`,
        supplierId: supplier.id,
        status: "EN_TRANSITO",
        expectedDate: makeExpectedDate(-1),
        notes: "Fixture Jira UX - vencida",
        lines: {
          create: [
            {
              productId: product.id,
              qtyOrdered: 4,
              qtyReceived: 0,
              unitPrice: 150,
              currency: "MXN",
            },
          ],
        },
      },
      select: { id: true },
    });

    const partialOrder = await prisma.purchaseOrder.create({
      data: {
        folio: `E2E-PO-PARTIAL-${unique()}`,
        supplierId: supplier.id,
        status: "PARCIAL",
        expectedDate: makeExpectedDate(0),
        notes: "Fixture Jira UX - parcial",
        lines: {
          create: [
            {
              productId: product.id,
              qtyOrdered: 4,
              qtyReceived: 1,
              unitPrice: 180,
              currency: "MXN",
            },
          ],
        },
      },
      select: { id: true },
    });

    const receivedOrder = await prisma.purchaseOrder.create({
      data: {
        folio: `E2E-PO-RECV-${unique()}`,
        supplierId: supplier.id,
        status: "RECIBIDA",
        expectedDate: makeExpectedDate(-2),
        notes: "Fixture Jira UX - recibida",
        lines: {
          create: [
            {
              productId: product.id,
              qtyOrdered: 5,
              qtyReceived: 5,
              unitPrice: 120,
              currency: "MXN",
            },
          ],
        },
      },
      select: { id: true },
    });

    draftOrderId = draftOrder.id;
    confirmedOrderId = confirmedDraft.id;
    overdueOrderId = overdueOrder.id;
    partialOrderId = partialOrder.id;
    receivedOrderId = receivedOrder.id;
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("KAN-55 sales cockpit and role home remain aligned with Jira", async ({
    page,
  }) => {
    await loginAs(page, "SALES_EXECUTIVE", "/production/requests");
    await page.goto("/production/requests");

    await expect(
      page.getByRole("heading", { name: /Pedidos comerciales/i }),
    ).toBeVisible();
    await expect(
      page.getByText("Accesos comerciales", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Mis pedidos", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Disponibles para asignarme", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByTestId("desktop-main-nav").getByRole("link", { name: /Clientes/i }),
    ).toBeVisible();
    await expect(
      page.getByTestId("desktop-main-nav").getByRole("link", { name: /Cat[aá]logo/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^Disponibilidad\s/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^Equivalencias\s/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^Nuevo pedido\s/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Inventario/i })).toHaveCount(
      0,
    );
  });

  test("KAN-87 purchasing list exposes Jira presets and filters the operational queue", async ({
    page,
  }) => {
    await loginAs(page, "MANAGER", "/purchasing/orders");
    await page.goto("/purchasing/orders");

    await expect(
      page.getByRole("heading", { name: /Órdenes de compra/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Todas/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Borrador/i })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Confirmadas/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /En tránsito/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Parciales/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Recibidas/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Vencidas/i })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Por recibir hoy/i }),
    ).toBeVisible();

    await page.getByRole("link", { name: /Vencidas/i }).click();
    await expect(page).toHaveURL(/\/purchasing\/orders\?preset=vencidas/);
    await expect(
      page.getByRole("link", { name: /E2E-PO-OVERDUE-/i }).first(),
    ).toBeVisible();

    await page.getByRole("link", { name: /Por recibir hoy/i }).click();
    await expect(page).toHaveURL(
      /\/purchasing\/orders\?preset=por_recibir_hoy/,
    );
    await expect(
      page.getByRole("link", { name: /E2E-PO-CONF-/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /E2E-PO-PARTIAL-/i }).first(),
    ).toBeVisible();

    await page.getByRole("link", { name: /Borrador/i }).click();
    await expect(page).toHaveURL(/\/purchasing\/orders\?preset=borrador/);
    await expect(
      page.getByRole("link", { name: /E2E-PO-DRAFT-/i }).first(),
    ).toBeVisible();
  });

  test("KAN-88 purchase order detail shows timeline and next action workspace", async ({
    page,
  }) => {
    await loginAs(page, "MANAGER", `/purchasing/orders/${confirmedOrderId}`);
    await page.goto(`/purchasing/orders/${confirmedOrderId}`);

    await expect(
      page.getByRole("heading", { name: /Línea de tiempo operativa/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Siguiente acción/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Ver documento oficial/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Descargar PDF/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Recibir mercancía/i }),
    ).toHaveCount(2);
    await expect(page.getByText(/KAN-88/i)).toBeVisible();
  });

  test("KAN-80 warehouse execution cockpit exposes the new request capture route", async ({
    page,
  }) => {
    await loginAs(page, "SALES_EXECUTIVE", "/production/requests/new");
    await page.goto("/production/requests/new");

    await expect(
      page.getByRole("heading", { name: /Nuevo pedido comercial/i }),
    ).toBeVisible();
    await expect(page.getByText("Captura guiada", { exact: true })).toBeVisible();
    await expect(page.getByText(/Paso 1 de 3/i)).toBeVisible();
    await expect(page.getByLabel(/1\. Selecciona o crea el cliente/i)).toBeVisible();
    await expect(page.getByText(/Confirma almacén y fecha/i)).toBeVisible();
    await expect(page.getByText(/Completa el pedido/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /← Pedidos/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Crear pedido/i }),
    ).toBeVisible();
  });

  test("KAN-81 sales console keeps the commercial utility routes understandable", async ({
    page,
  }) => {
    await loginAs(page, "SALES_EXECUTIVE", "/production/availability");
    await page.goto("/production/availability");

    await expect(
      page.getByRole("heading", { name: /Disponibilidad para pedidos/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Filtrar/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Limpiar/i })).toBeVisible();

    await page.goto("/production/equivalences");
    await expect(
      page.getByRole("heading", { name: /Equivalencias para pedidos/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Buscar/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Limpiar/i })).toBeVisible();
  });

  test("KAN-82 dark/light theme toggle keeps the sales cockpit usable", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("wms-theme", "light");
    });

    await loginAs(page, "SALES_EXECUTIVE", "/production/requests");
    await page.goto("/production/requests");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const themeToggle = page
      .getByRole("banner")
      .getByRole("button", { name: /Cambiar tema/i });
    await expect(themeToggle).toBeVisible();
    await expect(
      page.getByRole("link", { name: /\+ Nuevo pedido/i }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("KAN-83 purchasing command center keeps the landing and receiving routes clear", async ({
    page,
  }) => {
    await loginAs(page, "MANAGER", "/purchasing");
    await page.goto("/purchasing");

    await expect(
      page.getByRole("heading", { name: /^Compras$/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Ver ordenes/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Nueva OC/i })).toBeVisible();

    await page.goto(`/purchasing/orders/${confirmedOrderId}/receive`);
    await expect(
      page.getByRole("heading", { name: /Recibir Mercancía/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Datos de Recepción/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Artículos Pendientes/i }),
    ).toBeVisible();
  });
});
