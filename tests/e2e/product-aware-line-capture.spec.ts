import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { loginAs } from "./lib/auth.helpers";

const prisma = new PrismaClient();

const FIXTURE = {
  warehouseCode: "E2E-LINE-WH",
  warehouseName: "Almacén Line Capture E2E",
  locationCode: "E2E-LINE-LOC-01",
  baseSku: "E2E-LINE-BASE-SKU",
  baseReference: "E2E-LINE-BASE-REF",
  baseName: "Manguera Line Capture Base",
  equivalentSku: "E2E-LINE-EQUIV-SKU",
  equivalentReference: "E2E-LINE-EQUIV-REF",
  equivalentName: "Manguera Line Capture Alterna",
  customerCode: "E2E-LINE-CUST",
  customerName: "Cliente Line Capture",
};

async function cleanupFixtures() {
  const [customers, products, warehouses, locations] = await Promise.all([
    prisma.customer.findMany({
      where: {
        OR: [
          { code: FIXTURE.customerCode },
          { name: FIXTURE.customerName },
        ],
      },
      select: { id: true },
    }),
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
      where: {
        code: {
          in: [FIXTURE.locationCode, `STAGING-${FIXTURE.warehouseCode}`],
        },
      },
      select: { id: true },
    }),
  ]);

  const customerIds = customers.map((customer) => customer.id);
  const productIds = products.map((product) => product.id);
  const warehouseIds = warehouses.map((warehouse) => warehouse.id);
  const locationIds = locations.map((location) => location.id);

  if (customerIds.length > 0) {
    await prisma.salesInternalOrder.deleteMany({
      where: { customerId: { in: customerIds } },
    });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  }

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
    select: { id: true, code: true },
  });

  const location = await prisma.location.create({
    data: {
      code: FIXTURE.locationCode,
      name: "Rack Line Capture",
      zone: "D",
      isActive: true,
      usageType: "STORAGE",
      warehouseId: warehouse.id,
    },
    select: { id: true },
  });

  await prisma.location.create({
    data: {
      code: `STAGING-${FIXTURE.warehouseCode}`,
      name: "Staging Line Capture",
      zone: "STG",
      isActive: true,
      usageType: "STAGING",
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

  const customer = await prisma.customer.create({
    data: {
      code: FIXTURE.customerCode,
      name: FIXTURE.customerName,
      isActive: true,
    },
    select: { id: true, code: true, name: true },
  });

  await prisma.inventory.createMany({
    data: [
      {
        productId: baseProduct.id,
        locationId: location.id,
        quantity: 18,
        reserved: 0,
        available: 18,
      },
      {
        productId: equivalentProduct.id,
        locationId: location.id,
        quantity: 9,
        reserved: 0,
        available: 9,
      },
    ],
  });

  await prisma.productEquivalence.create({
    data: {
      productId: baseProduct.id,
      equivProductId: equivalentProduct.id,
      basisNorm: "DN16",
      sourceSheet: "E2E",
      notes: "Fixture line capture",
      active: true,
    },
  });

  return {
    warehouseId: warehouse.id,
    warehouseCode: warehouse.code,
    baseProductId: baseProduct.id,
    baseSku: baseProduct.sku,
    customerId: customer.id,
    customerCode: customer.code,
    customerName: customer.name,
  };
}

test.describe.serial("product aware line capture", () => {
  let fixture: Awaited<ReturnType<typeof seedFixtures>>;

  test.beforeAll(async () => {
    fixture = await seedFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("catalog handoff renders an editable line draft and persists it on submit", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE", `/catalog/${fixture.baseProductId}`);
    await page.goto(`/catalog/${fixture.baseProductId}`);

    await page.getByRole("link", { name: new RegExp(`Crear pedido con ${FIXTURE.baseName}`, "i") }).click();
    await expect(page).toHaveURL(/\/production\/requests\/new\?.*productId=/);
    await expect(page.getByRole("heading", { name: /Pedido comercial/i })).toBeVisible();
    await expect(page.getByText("Línea sugerida", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Línea sugerida/i })).toBeVisible();
    await expect(page.getByLabel(/Cantidad/i)).toHaveValue("1");
    await expect(page.getByLabel(/Notas de la línea/i)).toBeVisible();
    await expect(page.locator("form").getByText(FIXTURE.baseSku).first()).toBeVisible();
    await expect(page.getByText(/Acción sugerida:/i)).toHaveCount(0);

    await page.getByLabel(/Notas de la línea/i).fill("Línea inicial persistida");

    await page.getByLabel(/Selecciona o crea el cliente/i).fill(FIXTURE.customerName);
    await expect(page.getByRole("button", { name: new RegExp(FIXTURE.customerCode, "i") })).toBeVisible();
    await page.getByRole("button", { name: new RegExp(FIXTURE.customerCode, "i") }).click();
    await expect(page.locator('input[type="hidden"][name="customerId"]')).toHaveValue(fixture.customerId);

    await page.locator('select[name="warehouseId"]').selectOption(fixture.warehouseId);
    await page.locator('input[name="dueDate"]').fill("2026-06-25");

    await page.getByRole("button", { name: /Crear pedido/i }).click();
    await expect(page).toHaveURL(/\/production\/requests\/.+\?ok=/);
    await expect(page.getByRole("heading", { name: /Productos independientes/i })).toBeVisible();
    await expect(page.getByText(FIXTURE.baseSku)).toBeVisible();
    await expect(page.getByText("Línea inicial persistida")).toBeVisible();
    await expect(page.getByText(/1\s+unidad/i)).toBeVisible();
  });

  test("manual request creation without product context still works", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE", "/production/requests/new");
    await page.goto("/production/requests/new");

    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Línea sugerida/i })).toHaveCount(0);

    await page.getByLabel(/Selecciona o crea el cliente/i).fill(FIXTURE.customerName);
    await expect(page.getByRole("button", { name: new RegExp(FIXTURE.customerCode, "i") })).toBeVisible();
    await page.getByRole("button", { name: new RegExp(FIXTURE.customerCode, "i") }).click();
    await expect(page.locator('input[type="hidden"][name="customerId"]')).toHaveValue(fixture.customerId);

    await page.locator('select[name="warehouseId"]').selectOption(fixture.warehouseId);
    await page.locator('input[name="dueDate"]').fill("2026-06-25");
    await page.getByRole("button", { name: /Crear pedido/i }).click();

    await expect(page).toHaveURL(/\/production\/requests\/.+\?ok=/);
    await expect(page.getByRole("heading", { name: /Productos independientes/i })).toBeVisible();
    await expect(page.getByText(FIXTURE.baseSku)).toHaveCount(0);
    await expect(page.getByText(/Todavia no hay productos independientes en este pedido/i)).toBeVisible();
  });

  test("invalid product context keeps manual capture available", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE", "/production/requests/new?productId=missing-product&sku=BAD-SKU&source=catalog");
    await page.goto("/production/requests/new?productId=missing-product&sku=BAD-SKU&source=catalog");

    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await expect(page.getByText(/No encontramos el producto seleccionado/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /Pedido comercial/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Línea sugerida/i })).toHaveCount(0);
    await expect(page.getByLabel(/Selecciona o crea el cliente/i)).toBeVisible();
  });
});
