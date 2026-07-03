import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { loginAs } from "./lib/auth.helpers";

const prisma = new PrismaClient();

const FIXTURE = {
  warehouseCode: "E2E-COMM-WH",
  warehouseName: "Almacén Comercial E2E",
  locationCode: "E2E-COMM-LOC-01",
  baseSku: "E2E-COMM-BASE-SKU",
  baseReference: "E2E-COMM-BASE-REF",
  baseName: "Manguera Comercial Base",
  equivalentSku: "E2E-COMM-EQUIV-SKU",
  equivalentReference: "E2E-COMM-EQUIV-REF",
  equivalentName: "Manguera Comercial Alterna",
};

async function cleanupCommercialToolkitFixtures() {
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
      where: {
        code: FIXTURE.warehouseCode,
      },
      select: { id: true },
    }),
    prisma.location.findMany({
      where: {
        code: FIXTURE.locationCode,
      },
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

async function seedCommercialToolkitFixtures() {
  await cleanupCommercialToolkitFixtures();

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
      name: "Rack Comercial",
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
        quantity: 12,
        reserved: 2,
        available: 10,
      },
      {
        productId: equivalentProduct.id,
        locationId: location.id,
        quantity: 6,
        reserved: 0,
        available: 6,
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
  };
}

test.describe.serial("commercial toolkit flow", () => {
  let fixture: Awaited<ReturnType<typeof seedCommercialToolkitFixtures>>;

  test.beforeAll(async () => {
    fixture = await seedCommercialToolkitFixtures();
  });

  test.afterAll(async () => {
    await cleanupCommercialToolkitFixtures();
    await prisma.$disconnect();
  });

  test("SALES_EXECUTIVE can move through catalog, availability, equivalences and new request", async ({
    page,
  }) => {
    await loginAs(page, "SALES_EXECUTIVE", `/catalog?q=${fixture.baseSku}`);
    await page.goto(`/catalog?q=${fixture.baseSku}`);

    await expect(
      page.getByRole("heading", { name: /Catálogo comercial/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/Buscar producto/i)).toBeVisible();
    await expect(page.getByText("Filtros avanzados", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Ver disponibilidad/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Revisar equivalencias/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Crear pedido/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Ver detalle/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Importar CSV/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Nuevo artículo/i })).toHaveCount(0);

    await page.goto(`/catalog/${fixture.baseProductId}`);
    await expect(
      page.getByRole("heading", { name: new RegExp(FIXTURE.baseName, "i") }),
    ).toBeVisible();
    await expect(page.getByText("Decisión comercial", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Ver disponibilidad/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Revisar equivalencias/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Crear pedido/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Editar/i })).toHaveCount(0);

    await page.goto(`/catalog?q=${fixture.baseSku}`);

    await page.getByRole("link", { name: /Crear pedido/i }).first().click();
    await expect(page).toHaveURL(/\/production\/requests\/new(?:\?.*)?$/);
    await expect(
      page.getByRole("heading", { name: /Nuevo pedido comercial/i }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /Captura comercial/i })).toBeVisible();
    await expect(page.getByLabel(/Selecciona o crea el cliente/i)).toBeVisible();
    const supportSummary = page.locator("summary").filter({ hasText: /Herramientas de apoyo/i });
    await expect(supportSummary).toBeVisible();
    await supportSummary.click();
    await expect(page.getByRole("link", { name: /Buscar en catálogo/i })).toBeVisible();
    await page.getByRole("link", { name: /Quitar selección/i }).first().click();
    await expect(page).toHaveURL(/\/production\/requests\/new(?:\?.*)?$/);
    await page.waitForLoadState("networkidle");

    const viewportWidth = page.viewportSize()?.width ?? 0;
    if (viewportWidth >= 768) {
      await page.goto(`/catalog?q=${fixture.baseSku}`);
      await page.getByRole("link", { name: /Ver detalle/i }).first().click();
      await expect(page).toHaveURL(/\/catalog\/.+$/);
      await expect(
        page.getByRole("heading", { name: new RegExp(FIXTURE.baseName, "i") }),
      ).toBeVisible();
      await page.getByRole("link", { name: /Ver disponibilidad/i }).first().click();
      await expect(page).toHaveURL(/\/production\/availability(?:\?.*)?$/);
      await expect(
        page.getByRole("heading", { name: /Disponibilidad comercial/i }),
      ).toBeVisible();
      await expect(page.getByLabel(/Producto requerido/i)).toHaveValue(fixture.baseSku);
      await expect(page.getByRole("columnheader", { name: /Disponible para vender/i })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: /Estado comercial/i })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: /^Acción$/i })).toBeVisible();
      await expect(page.getByText("Siguiente acción", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("columnheader", { name: /^Total$/i })).toHaveCount(0);
      await expect(page.getByRole("columnheader", { name: /^Reservado$/i })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /Revisar equivalencias/i }).first()).toBeVisible();

      await page.getByRole("link", { name: /Revisar equivalencias/i }).first().click();
      await expect(page).toHaveURL(/\/production\/equivalences(?:\?.*)?$/);
      await expect(
        page.getByRole("heading", { name: /Alternativas y equivalencias/i }),
      ).toBeVisible();
      await expect(page.getByLabel(/Producto requerido/i)).toHaveValue(fixture.baseSku);
      await expect(page.getByRole("link", { name: /Crear pedido/i }).first()).toBeVisible();

      await page.getByRole("link", { name: /Crear pedido/i }).first().click();
      await expect(page).toHaveURL(/\/production\/requests\/new(?:\?.*)?$/);
      await expect(
        page.getByRole("heading", { name: /Nuevo pedido comercial/i }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: /Captura comercial/i })).toBeVisible();
      await expect(page.getByText("Producto de referencia", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: /Línea sugerida/i })).toBeVisible();
    }
  });

  test("MANAGER can still access the commercial toolkit", async ({ page }) => {
    await loginAs(page, "MANAGER", "/catalog");

    await page.goto("/catalog");
    await expect(
      page.getByRole("heading", { name: /Catálogo comercial/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Crear pedido/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Ver disponibilidad/i })).toHaveCount(0);

    await page.goto("/production/availability");
    await expect(
      page.getByRole("heading", { name: /Disponibilidad comercial/i }),
    ).toBeVisible();

    await page.goto("/production/equivalences");
    await expect(
      page.getByRole("heading", { name: /Alternativas y equivalencias/i }),
    ).toBeVisible();

    await page.goto("/production/requests/new");
    await expect(
      page.getByRole("heading", { name: /Nuevo pedido comercial/i }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /Captura comercial/i })).toBeVisible();
  });

  test("mobile layout remains usable for the commercial toolkit", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "SALES_EXECUTIVE", `/catalog?q=${fixture.baseSku}`);
    await page.goto(`/catalog?q=${fixture.baseSku}`);

    await expect(
      page.getByRole("heading", { name: /Catálogo comercial/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Crear pedido/i }).first()).toBeVisible();

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(410);
  });
});
