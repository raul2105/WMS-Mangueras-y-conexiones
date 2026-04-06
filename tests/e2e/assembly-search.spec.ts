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

  if (warehouseIds.length > 0) {
    await prisma.productionOrder.deleteMany({
      where: {
        warehouseId: { in: warehouseIds },
        kind: "ASSEMBLY_3PIECE",
      },
    });

    await prisma.location.deleteMany({
      where: {
        warehouseId: { in: warehouseIds },
        usageType: "WIP",
      },
    });
  }

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
        brand: "SCMayer",
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
        brand: "SCMayer",
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
        brand: "SCMayer",
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

async function createCommercialHeader(
  page: import("@playwright/test").Page,
  options?: { customerName?: string; dueDate?: string }
) {
  const customerName = options?.customerName ?? "Cliente Ensamble E2E";
  const dueDate = options?.dueDate ?? "2026-04-15";

  await page.getByLabel("Almacen *").selectOption({ label: `${FIXTURE.warehouseName} (${FIXTURE.warehouseCode})` });
  await page.getByLabel("Cliente *").fill(customerName);
  await page.getByLabel("Fecha compromiso *").fill(dueDate);
  await page.getByRole("button", { name: "Crear encabezado" }).click();
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

  test("requiere encabezado comercial y permite reanudar la configuracion desde el listado", async ({ page }) => {
    await page.goto("/production/orders/new");

    await expect(page.getByRole("button", { name: "Crear encabezado" })).toBeVisible();
    await expect(page.getByText("Se habilita cuando el encabezado comercial ya existe.")).toBeVisible();
    await expect(page.getByTestId("assembly-entry-fitting-input")).toHaveCount(0);

    await createCommercialHeader(page, { customerName: "Cliente Reanudar E2E", dueDate: "2026-04-18" });

    await page.waitForURL(/\/production\/orders\/new\?orderId=/);
    await expect(page.getByText("Encabezado comercial creado")).toBeVisible();
    await expect(page.getByTestId("assembly-commercial-summary")).toContainText("Cliente Reanudar E2E");

    const warehouse = await prisma.warehouse.findUnique({
      where: { code: FIXTURE.warehouseCode },
      select: { id: true },
    });
    expect(warehouse?.id).toBeTruthy();

    const draftOrder = await prisma.productionOrder.findFirst({
      where: {
        warehouseId: warehouse!.id,
        kind: "ASSEMBLY_3PIECE",
        status: "BORRADOR",
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, customerName: true },
    });
    expect(draftOrder?.customerName).toBe("Cliente Reanudar E2E");

    await page.goto("/production/orders");
    await expect(page.getByText("Cliente Reanudar E2E")).toBeVisible();
    await expect(page.getByRole("link", { name: "Continuar configuracion" })).toBeVisible();

    await page.getByRole("link", { name: "Continuar configuracion" }).click();
    await page.waitForURL(new RegExp(`/production/orders/new\\?orderId=${draftOrder!.id}`));
    await expect(page.getByTestId("assembly-commercial-summary")).toContainText("Cliente Reanudar E2E");
  });

  test("permite previsualizar disponibilidad exacta y detectar insuficiencia al cambiar la demanda", async ({ page }) => {
    await page.goto("/production/orders/new");
    await createCommercialHeader(page);

    await page.waitForURL(/\/production\/orders\/new\?orderId=/);
    await selectAssemblyProducts(page);

    await expect(page.getByTestId("assembly-entry-fitting-selected")).toContainText(FIXTURE.entryName);
    await expect(page.getByTestId("assembly-exit-fitting-selected")).toContainText(FIXTURE.exitName);
    await expect(page.getByTestId("assembly-hose-selected")).toContainText(FIXTURE.hoseName);

    await page.getByRole("button", { name: "Previsualizar disponibilidad" }).click();
    await expect(page.getByText("Disponible exacto: ya puedes crear la orden.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Crear orden exacta" })).toBeEnabled();

    await page.getByLabel("Cantidad de ensambles").fill("7");
    await expect(page.getByTestId("assembly-hose-selected")).toContainText(FIXTURE.hoseName);

    await page.getByRole("button", { name: "Previsualizar disponibilidad" }).click();
    await expect(page.getByText("Stock insuficiente: no se permite crear la orden con faltantes.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Crear orden exacta" })).toBeDisabled();
  });

  test("crea la orden exacta sin caer en el error falso y deja la pick list en draft", async ({ page }) => {
    await page.goto("/production/orders/new");
    await createCommercialHeader(page, { customerName: "Cliente Flujo Exacto", dueDate: "2026-04-20" });
    await page.waitForURL(/\/production\/orders\/new\?orderId=/);
    await selectAssemblyProducts(page);
    await page.getByRole("button", { name: "Previsualizar disponibilidad" }).click();

    await expect(page.getByText("Disponible exacto: ya puedes crear la orden.")).toBeVisible();

    await page.getByRole("button", { name: "Crear orden exacta" }).click();

    await page.waitForURL(/\/production\/orders\/[^/?]+\?ok=/);
    await expect(page.getByText("Orden de ensamble creada con reserva exacta")).toBeVisible();
    await expect(page.getByRole("button", { name: "Liberar surtido" })).toBeVisible();
    await expect(page).not.toHaveURL(/error=/);

    const warehouse = await prisma.warehouse.findUnique({
      where: { code: FIXTURE.warehouseCode },
      select: { id: true },
    });
    expect(warehouse?.id).toBeTruthy();

    const latestOrder = await prisma.productionOrder.findFirst({
      where: {
        warehouseId: warehouse!.id,
        kind: "ASSEMBLY_3PIECE",
      },
      orderBy: { createdAt: "desc" },
      select: {
        code: true,
        status: true,
        customerName: true,
        assemblyWorkOrder: {
          select: {
            pickStatus: true,
            reservationStatus: true,
            pickLists: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { code: true, status: true },
            },
          },
        },
      },
    });

    expect(latestOrder?.code).toMatch(/^ENS-/);
    expect(latestOrder?.status).toBe("ABIERTA");
    expect(latestOrder?.customerName).toBe("Cliente Flujo Exacto");
    expect(latestOrder?.assemblyWorkOrder?.reservationStatus).toBe("RESERVED");
    expect(latestOrder?.assemblyWorkOrder?.pickStatus).toBe("NOT_RELEASED");
    expect(latestOrder?.assemblyWorkOrder?.pickLists[0]?.status).toBe("DRAFT");
    expect(latestOrder?.assemblyWorkOrder?.pickLists[0]?.code).toMatch(/^PK-ENS-/);
  });
});
