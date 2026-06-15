import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { loginAs } from "./lib/auth.helpers";

const prisma = new PrismaClient();

const FIXTURE = {
  warehouseCode: "E2E-HANDOFF-WH",
  warehouseName: "Almacén Handoff E2E",
  locationCode: "E2E-HANDOFF-LOC-01",
  baseSku: "E2E-HANDOFF-BASE-SKU",
  baseReference: "E2E-HANDOFF-BASE-REF",
  baseName: "Manguera Handoff Base",
  equivalentSku: "E2E-HANDOFF-EQUIV-SKU",
  equivalentReference: "E2E-HANDOFF-EQUIV-REF",
  equivalentName: "Manguera Handoff Alterna",
};

async function cleanupFixtures() {
  const [products, warehouses, locations] = await Promise.all([
    prisma.product.findMany({
      where: {
        sku: {
          in: [FIXTURE.baseSku, FIXTURE.equivalentSku],
        },
      },
      select: { id: true },
    }),
    prisma.warehouse.findMany({
      where: { code: FIXTURE.warehouseCode },
      select: { id: true },
    }),
    prisma.location.findMany({
      where: { code: FIXTURE.locationCode },
      select: { id: true },
    }),
  ]);

  const productIds = products.map((product) => product.id);
  const warehouseIds = warehouses.map((warehouse) => warehouse.id);
  const locationIds = locations.map((location) => location.id);

  if (productIds.length > 0) {
    await prisma.productEquivalence.deleteMany({
      where: {
        OR: [
          { productId: { in: productIds } },
          { equivProductId: { in: productIds } },
        ],
      },
    });
    await prisma.inventory.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: productIds } },
    });
  }

  if (locationIds.length > 0) {
    await prisma.location.deleteMany({
      where: { id: { in: locationIds } },
    });
  }

  if (warehouseIds.length > 0) {
    await prisma.warehouse.deleteMany({
      where: { id: { in: warehouseIds } },
    });
  }
}

async function seedFixtures() {
  await cleanupFixtures();

  const warehouse = await prisma.warehouse.create({
    data: {
      code: FIXTURE.warehouseCode,
      name: FIXTURE.warehouseName,
      isActive: true,
    },
    select: { id: true },
  });

  const location = await prisma.location.create({
    data: {
      code: FIXTURE.locationCode,
      name: "Rack Handoff",
      zone: "C",
      isActive: true,
      usageType: "STORAGE",
      warehouseId: warehouse.id,
    },
    select: { id: true },
  });

  const baseProduct = await prisma.product.create({
    data: {
      sku: FIXTURE.baseSku,
      referenceCode: FIXTURE.baseReference,
      name: FIXTURE.baseName,
      type: "HOSE",
      brand: "SCMayher",
      subcategory: "Comercial",
    },
    select: { id: true, sku: true },
  });

  const equivalentProduct = await prisma.product.create({
    data: {
      sku: FIXTURE.equivalentSku,
      referenceCode: FIXTURE.equivalentReference,
      name: FIXTURE.equivalentName,
      type: "HOSE",
      brand: "SCMayher",
      subcategory: "Comercial",
    },
    select: { id: true, sku: true },
  });

  await prisma.inventory.createMany({
    data: [
      {
        productId: baseProduct.id,
        locationId: location.id,
        quantity: 14,
        reserved: 1,
        available: 13,
      },
      {
        productId: equivalentProduct.id,
        locationId: location.id,
        quantity: 8,
        reserved: 0,
        available: 8,
      },
    ],
  });

  await prisma.productEquivalence.create({
    data: {
      productId: baseProduct.id,
      equivProductId: equivalentProduct.id,
      basisNorm: "DN16",
      sourceSheet: "E2E",
      notes: "Fixture comercial",
      active: true,
    },
  });

  return {
    baseProductId: baseProduct.id,
    baseSku: baseProduct.sku,
    equivalentProductId: equivalentProduct.id,
    equivalentSku: equivalentProduct.sku,
  };
}

test.describe.serial("product aware handoff", () => {
  let fixture: Awaited<ReturnType<typeof seedFixtures>>;

  test.beforeAll(async () => {
    fixture = await seedFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("catalog detail hands off product context into new request", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE", `/catalog/${fixture.baseProductId}`);
    await page.goto(`/catalog/${fixture.baseProductId}`);

    await expect(page.getByRole("heading", { name: new RegExp(FIXTURE.baseName, "i") })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(`Crear pedido con ${FIXTURE.baseName}`, "i") })).toBeVisible();

    await page.getByRole("link", { name: new RegExp(`Crear pedido con ${FIXTURE.baseName}`, "i") }).click();
    await expect(page).toHaveURL(/\/production\/requests\/new\?.*productId=/);
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Captura comercial/i })).toBeVisible();
    await expect(page.getByText("Producto de referencia", { exact: true })).toBeVisible();
    await expect(page.getByText(FIXTURE.baseSku).first()).toBeVisible();
    await expect(page.getByText("Siguiente acción", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Continuar con este producto/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Cambiar producto/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Quitar selección/i }).first()).toBeVisible();
    const supportSummary = page.locator("summary").filter({ hasText: /Herramientas de apoyo/i });
    await expect(supportSummary).toBeVisible();
    await supportSummary.click();
    await expect(page.getByRole("link", { name: /Buscar en catálogo/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Ver disponibilidad/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Revisar equivalencias/i }).first()).toBeVisible();
    await expect(page.getByLabel(/Selecciona o crea el cliente/i)).toBeVisible();

    await page.getByRole("link", { name: /Quitar selección/i }).first().click();
    await expect(page).toHaveURL(/\/production\/requests\/new(?:\?.*)?$/);
    await expect(page.getByText("Contexto comercial", { exact: true })).toHaveCount(0);
  });

  test("availability and equivalences preserve context into request creation", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE", `/production/availability?q=${fixture.baseSku}&productId=${fixture.baseProductId}&sku=${fixture.baseSku}&source=catalog`);
    await page.goto(`/production/availability?q=${fixture.baseSku}&productId=${fixture.baseProductId}&sku=${fixture.baseSku}&source=catalog`);

    await expect(page.getByRole("heading", { name: /Disponibilidad comercial/i })).toBeVisible();
    await expect(page.getByLabel(/Producto requerido/i)).toHaveValue(fixture.baseSku);
    await expect(page.getByRole("link", { name: /Crear pedido/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Ver equivalencias/i }).first()).toBeVisible();

    await page.getByRole("link", { name: /Crear pedido/i }).first().click();
    await expect(page).toHaveURL(/\/production\/requests\/new\?.*source=availability/);
    await expect(page.getByRole("heading", { name: /Captura comercial/i })).toBeVisible();
    await expect(page.getByText(FIXTURE.baseSku).first()).toBeVisible();
    await expect(page.getByText("Producto de referencia", { exact: true })).toBeVisible();

    await page.goto(`/production/equivalences?q=${fixture.baseSku}&productId=${fixture.baseProductId}&sku=${fixture.baseSku}&source=catalog`);
    await expect(page.getByRole("heading", { name: /Alternativas y equivalencias/i })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(`Crear pedido con ${FIXTURE.equivalentName}`, "i") })).toBeVisible();

    await page.getByRole("link", { name: new RegExp(`Crear pedido con ${FIXTURE.equivalentName}`, "i") }).click();
    await expect(page).toHaveURL(/\/production\/requests\/new\?.*source=equivalences/);
    await expect(page.getByRole("heading", { name: /Captura comercial/i })).toBeVisible();
    await expect(page.getByText(/Sustituye a/i)).toBeVisible();
    await expect(page.getByText(FIXTURE.baseSku).first()).toBeVisible();
  });

  test("invalid product context is safe and manual capture still works", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE", "/production/requests/new?productId=missing-product&sku=BAD-SKU&source=catalog");
    await page.goto("/production/requests/new?productId=missing-product&sku=BAD-SKU&source=catalog");

    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await expect(page.getByText(/No encontramos el producto seleccionado/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /Captura comercial/i })).toBeVisible();
    await expect(page.getByLabel(/Selecciona o crea el cliente/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Cambiar producto/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Quitar selección/i }).first()).toBeVisible();
  });

  test("manager can use the handoff and mobile layout remains usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "MANAGER", `/catalog/${fixture.baseProductId}`);
    await page.goto(`/catalog/${fixture.baseProductId}`);

    await expect(page.getByRole("heading", { name: new RegExp(FIXTURE.baseName, "i") })).toBeVisible();
    await expect(page.getByRole("link", { name: /Crear pedido con/i }).first()).toBeVisible();

    await page.getByRole("link", { name: /Crear pedido con/i }).first().click();
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Captura comercial/i })).toBeVisible();
    await expect(page.getByText("Producto de referencia", { exact: true })).toBeVisible();
    await expect(page.getByLabel(/Selecciona o crea el cliente/i)).toBeVisible();

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(410);
  });
});
