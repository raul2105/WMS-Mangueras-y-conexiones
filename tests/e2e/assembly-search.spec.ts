import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FIXTURE = {
  warehouseCode: "E2E-ASM-WH",
  warehouseName: "Almacen Ensamble E2E",
  locationA: "E2E-ASM-LOC-A",
  locationB: "E2E-ASM-LOC-B",
  entrySku: "E2E-ASM-FIT-IN",
  entryName: "Conexion Entrada DN16",
  exitSku: "E2E-ASM-FIT-OUT",
  exitName: "Conexion Salida DN16",
  hoseSku: "E2E-ASM-HOSE-01",
  hoseName: "Manguera Termoplastica DN16",
};

async function cleanupAssemblyFixtures() {
  const [products, warehouses, locations] = await Promise.all([
    prisma.product.findMany({
      where: {
        sku: {
          startsWith: "E2E-ASM-",
        },
      },
      select: { id: true },
    }),
    prisma.warehouse.findMany({
      where: {
        code: {
          startsWith: "E2E-ASM-",
        },
      },
      select: { id: true },
    }),
    prisma.location.findMany({
      where: {
        code: {
          startsWith: "E2E-ASM-",
        },
      },
      select: { id: true },
    }),
  ]);

  const productIds = products.map((product) => product.id);
  const locationIds = locations.map((location) => location.id);
  const warehouseIds = warehouses.map((warehouse) => warehouse.id);

  if (productIds.length > 0 || locationIds.length > 0) {
    await prisma.inventory.deleteMany({
      where: {
        OR: [
          productIds.length > 0 ? { productId: { in: productIds } } : undefined,
          locationIds.length > 0 ? { locationId: { in: locationIds } } : undefined,
        ].filter(Boolean) as any,
      },
    });
  }

  if (productIds.length > 0) {
    await prisma.productTechnicalAttribute.deleteMany({
      where: {
        productId: { in: productIds },
      },
    });
  }

  if (productIds.length > 0) {
    await prisma.product.deleteMany({
      where: {
        id: { in: productIds },
      },
    });
  }

  if (locationIds.length > 0) {
    await prisma.location.deleteMany({
      where: {
        id: { in: locationIds },
      },
    });
  }

  if (warehouseIds.length > 0) {
    await prisma.warehouse.deleteMany({
      where: {
        id: { in: warehouseIds },
      },
    });
  }
}

async function seedAssemblyFixtures() {
  await cleanupAssemblyFixtures();

  const warehouse = await prisma.warehouse.create({
    data: {
      code: FIXTURE.warehouseCode,
      name: FIXTURE.warehouseName,
      isActive: true,
    },
  });

  const [locationA, locationB] = await Promise.all([
    prisma.location.create({
      data: {
        code: FIXTURE.locationA,
        name: "Rack A",
        zone: "A",
        isActive: true,
        usageType: "STORAGE",
        warehouseId: warehouse.id,
      },
    }),
    prisma.location.create({
      data: {
        code: FIXTURE.locationB,
        name: "Rack B",
        zone: "B",
        isActive: true,
        usageType: "STORAGE",
        warehouseId: warehouse.id,
      },
    }),
  ]);

  const [entryFitting, exitFitting, hose] = await Promise.all([
    prisma.product.create({
      data: {
        sku: FIXTURE.entrySku,
        name: FIXTURE.entryName,
        type: "FITTING",
        brand: "Rigentec",
        subcategory: "Entrada",
        technicalAttributes: {
          create: [
            {
              key: "diametro",
              keyNormalized: "diametro",
              value: "DN16",
              valueNormalized: "dn16",
            },
          ],
        },
      },
    }),
    prisma.product.create({
      data: {
        sku: FIXTURE.exitSku,
        name: FIXTURE.exitName,
        type: "FITTING",
        brand: "Rigentec",
        subcategory: "Salida",
        technicalAttributes: {
          create: [
            {
              key: "diametro",
              keyNormalized: "diametro",
              value: "DN16",
              valueNormalized: "dn16",
            },
          ],
        },
      },
    }),
    prisma.product.create({
      data: {
        sku: FIXTURE.hoseSku,
        name: FIXTURE.hoseName,
        type: "HOSE",
        brand: "Rigentec",
        subcategory: "Termoplastica",
        technicalAttributes: {
          create: [
            {
              key: "diametro",
              keyNormalized: "diametro",
              value: "DN16",
              valueNormalized: "dn16",
            },
            {
              key: "material",
              keyNormalized: "material",
              value: "Termoplastica",
              valueNormalized: "termoplastica",
            },
          ],
        },
      },
    }),
  ]);

  await prisma.inventory.createMany({
    data: [
      {
        productId: entryFitting.id,
        locationId: locationA.id,
        quantity: 5,
        reserved: 0,
        available: 5,
      },
      {
        productId: exitFitting.id,
        locationId: locationA.id,
        quantity: 5,
        reserved: 0,
        available: 5,
      },
      {
        productId: hose.id,
        locationId: locationA.id,
        quantity: 6,
        reserved: 0,
        available: 6,
      },
      {
        productId: hose.id,
        locationId: locationB.id,
        quantity: 6,
        reserved: 0,
        available: 6,
      },
    ],
  });
}

async function selectWarehouse(page: import("@playwright/test").Page) {
  await page.getByTestId("assembly-warehouse-input").fill(FIXTURE.warehouseCode);
  await page.getByRole("button", { name: new RegExp(FIXTURE.warehouseName, "i") }).click();
}

async function selectAssemblyProducts(page: import("@playwright/test").Page) {
  await page.getByLabel("Longitud por ensamble").fill("2");
  await page.getByLabel("Cantidad de ensambles").fill("2");

  await page.getByTestId("assembly-entry-fitting-input").fill("entrada");
  await page.getByRole("button", { name: new RegExp(FIXTURE.entryName, "i") }).click();

  await page.getByTestId("assembly-exit-fitting-input").fill("salida");
  await page.getByRole("button", { name: new RegExp(FIXTURE.exitName, "i") }).click();

  await page.getByTestId("assembly-hose-input").fill("termoplastica");
  await page.getByRole("button", { name: new RegExp(FIXTURE.hoseName, "i") }).click();
}

test.describe("Busqueda de ensamble con stock contextual", () => {
  test.beforeEach(async () => {
    await seedAssemblyFixtures();
  });

  test.afterAll(async () => {
    await cleanupAssemblyFixtures();
    await prisma.$disconnect();
  });

  test("bloquea la busqueda de productos hasta seleccionar almacen", async ({ page }) => {
    await page.goto("/production/orders/new");

    await expect(page.getByTestId("assembly-entry-fitting-input")).toBeDisabled();
    await expect(page.getByTestId("assembly-exit-fitting-input")).toBeDisabled();
    await expect(page.getByTestId("assembly-hose-input")).toBeDisabled();
  });

  test("permite buscar por texto y previsualizar disponibilidad exacta", async ({ page }) => {
    await page.goto("/production/orders/new");

    await selectWarehouse(page);
    await selectAssemblyProducts(page);

    await expect(page.getByTestId("assembly-entry-fitting-selected")).toContainText(FIXTURE.entryName);
    await expect(page.getByTestId("assembly-exit-fitting-selected")).toContainText(FIXTURE.exitName);
    await expect(page.getByTestId("assembly-hose-selected")).toContainText(FIXTURE.hoseName);

    await page.getByRole("button", { name: "Previsualizar disponibilidad" }).click();

    await expect(page.getByText("Disponible exacto: ya puedes crear la orden.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Crear orden exacta" })).toBeEnabled();
  });

  test("mantiene la seleccion pero marca insuficiencia al cambiar la demanda", async ({ page }) => {
    await page.goto("/production/orders/new");

    await selectWarehouse(page);
    await selectAssemblyProducts(page);
    await page.getByRole("button", { name: "Previsualizar disponibilidad" }).click();

    await page.getByLabel("Cantidad de ensambles").fill("7");
    await expect(page.getByTestId("assembly-hose-selected")).toContainText(
      "La selección se conserva, pero ya no cumple con el stock suficiente para el ensamble actual."
    );

    await page.getByRole("button", { name: "Previsualizar disponibilidad" }).click();
    await expect(page.getByText("Stock insuficiente: no se permite crear la orden con faltantes.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Crear orden exacta" })).toBeDisabled();
  });
});
