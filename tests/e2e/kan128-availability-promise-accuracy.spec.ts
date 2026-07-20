import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { loginAs } from "./lib/auth.helpers";

const prisma = new PrismaClient();

const FIXTURE = {
  warehouseCode: "KAN128-WH",
  warehouseName: "Almacén KAN-128",
  locationCode: "KAN128-LOC-01",
  productSku: "KAN128-SKU",
  productReference: "KAN128-REF",
  productName: "Manguera KAN-128 Test",
  equivalentSku: "KAN128-EQUIV",
  equivalentReference: "KAN128-EQUIV-REF",
  equivalentName: "Manguera KAN-128 Equiv",
  customerCode: "KAN128-CUST",
  customerName: "Cliente KAN-128",
};

async function cleanupFixtures() {
  const [customers, products, warehouses] = await Promise.all([
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
          in: [FIXTURE.productSku, FIXTURE.equivalentSku],
        },
      },
      select: { id: true },
    }),
    prisma.warehouse.findMany({
      where: { code: FIXTURE.warehouseCode },
      select: { id: true },
    }),
  ]);

  const customerIds = customers.map((c) => c.id);
  const productIds = products.map((p) => p.id);
  const warehouseIds = warehouses.map((w) => w.id);

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
    // Delete inventory for these products first
    await prisma.inventory.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: productIds } },
    });
  }

// Clean up locations first (all locations in the warehouse), then warehouses
  if (warehouseIds.length > 0) {
    // First get all locations in these warehouses
    const allLocationsInWarehouse = await prisma.location.findMany({
      where: { warehouseId: { in: warehouseIds } },
      select: { id: true },
    });
    const allLocationIds = allLocationsInWarehouse.map((l) => l.id);
    
    if (allLocationIds.length > 0) {
      // Delete all inventory that references these locations
      await prisma.inventory.deleteMany({
        where: { locationId: { in: allLocationIds } },
      });
      // Delete the locations
      await prisma.location.deleteMany({
        where: { id: { in: allLocationIds } },
      });
    }
    
    // Now delete the warehouses
    await prisma.warehouse.deleteMany({
      where: { id: { in: warehouseIds } },
    });
  }
}

async function seedFixtures() {
  await cleanupFixtures();

  const warehouse = await prisma.warehouse.upsert({
    where: { code: FIXTURE.warehouseCode },
    update: { name: FIXTURE.warehouseName, isActive: true },
    create: {
      code: FIXTURE.warehouseCode,
      name: FIXTURE.warehouseName,
      isActive: true,
    },
    select: { id: true },
  });

  const location = await prisma.location.upsert({
    where: { code: FIXTURE.locationCode },
    update: { name: "Rack KAN-128", zone: "A", isActive: true, usageType: "STORAGE", warehouseId: warehouse.id },
    create: {
      code: FIXTURE.locationCode,
      name: "Rack KAN-128",
      zone: "A",
      isActive: true,
      usageType: "STORAGE",
      warehouseId: warehouse.id,
    },
    select: { id: true },
  });

  const baseProduct = await prisma.product.upsert({
    where: { sku: FIXTURE.productSku },
    update: { referenceCode: FIXTURE.productReference, name: FIXTURE.productName, type: "HOSE", brand: "SCMayher", subcategory: "Comercial" },
    create: {
      sku: FIXTURE.productSku,
      referenceCode: FIXTURE.productReference,
      name: FIXTURE.productName,
      type: "HOSE",
      brand: "SCMayher",
      subcategory: "Comercial",
    },
    select: { id: true, sku: true, name: true },
  });

  const equivalentProduct = await prisma.product.upsert({
    where: { sku: FIXTURE.equivalentSku },
    update: { referenceCode: FIXTURE.equivalentReference, name: FIXTURE.equivalentName, type: "HOSE", brand: "SCMayher", subcategory: "Comercial" },
    create: {
      sku: FIXTURE.equivalentSku,
      referenceCode: FIXTURE.equivalentReference,
      name: FIXTURE.equivalentName,
      type: "HOSE",
      brand: "SCMayher",
      subcategory: "Comercial",
    },
    select: { id: true, sku: true, name: true },
  });

  const customer = await prisma.customer.upsert({
    where: { code: FIXTURE.customerCode },
    update: { name: FIXTURE.customerName, isActive: true },
    create: {
      code: FIXTURE.customerCode,
      name: FIXTURE.customerName,
      isActive: true,
    },
    select: { id: true },
  });

  // Create inventory with sufficient stock for base product
  await prisma.inventory.createMany({
    data: [
      {
        productId: baseProduct.id,
        locationId: location.id,
        quantity: 20,
        reserved: 0,
        available: 20,
      },
      {
        productId: equivalentProduct.id,
        locationId: location.id,
        quantity: 10,
        reserved: 0,
        available: 10,
      },
    ],
  });

  // Create product equivalence
  await prisma.productEquivalence.create({
    data: {
      productId: baseProduct.id,
      equivProductId: equivalentProduct.id,
      basisNorm: "DN16",
      sourceSheet: "KAN-128",
      notes: "Fixture for KAN-128 testing",
      active: true,
    },
  });

  return {
    warehouseId: warehouse.id,
    warehouseCode: FIXTURE.warehouseCode,
    warehouseName: FIXTURE.warehouseName,
    baseProductId: baseProduct.id,
    baseProductSku: baseProduct.sku,
    baseProductName: baseProduct.name,
    equivalentProductId: equivalentProduct.id,
    equivalentSku: equivalentProduct.sku,
    equivalentName: equivalentProduct.name,
    customerId: customer.id,
    customerName: FIXTURE.customerName,
    locationId: location.id,
  };
}

test.describe.serial("KAN-128: Commercial Availability Promise Accuracy", () => {
  let fixture: Awaited<ReturnType<typeof seedFixtures>>;

  test.beforeAll(async () => {
    fixture = await seedFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("SALES_EXECUTIVE opens availability from /sales and sees commercial availability page", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/sales");
    
    const availabilityLink = page.getByRole("link", { name: /Disponibilidad/i });
    await expect(availabilityLink).toBeVisible();
    await availabilityLink.click();
    
    await expect(page).toHaveURL(/\/production\/availability/);
    await expect(page.getByRole("heading", { name: /Disponibilidad comercial/i })).toBeVisible();
  });

  test("Product + warehouse availability shows warehouse-specific 'Crear pedido' links with promise context", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto(`/production/availability?q=${fixture.baseProductSku}&productId=${fixture.baseProductId}&sku=${fixture.baseProductSku}&source=catalog`);
    
    await expect(page.getByRole("heading", { name: /Disponibilidad comercial/i })).toBeVisible();
    await expect(page.getByLabel(/Producto requerido/i)).toHaveValue(fixture.baseProductSku);
    
    // Check warehouse-specific "Crear pedido" link exists with warehouse code
    const crearPedidoLink = page.getByRole("link", { name: new RegExp(`Crear pedido.*${fixture.warehouseCode}`, "i") });
    await expect(crearPedidoLink).toBeVisible();
    
    // Verify link contains all promise parameters
    const href = await crearPedidoLink.getAttribute("href");
    expect(href).toContain("promiseWarehouseCode=" + fixture.warehouseCode);
    expect(href).toContain("promiseAvailableQty=20");
    expect(href).toContain("promiseCheckedAt");
    expect(href).toContain("promiseSource=availability");
  });

  test("Crear pedido from availability carries productId, sku, warehouseId, available quantity, source=availability", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto(`/production/availability?q=${fixture.baseProductSku}&productId=${fixture.baseProductId}&sku=${fixture.baseProductSku}&source=catalog`);
    
    const crearPedidoLink = page.getByRole("link", { name: new RegExp(`Crear pedido.*${fixture.warehouseCode}`, "i") });
    await crearPedidoLink.click();
    
    await expect(page).toHaveURL(/\/production\/requests\/new/);
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    
    // Verify URL has all promise parameters
    expect(page.url()).toContain("productId=" + fixture.baseProductId);
    expect(page.url()).toContain("sku=" + fixture.baseProductSku);
    expect(page.url()).toContain("source=availability");
    expect(page.url()).toContain("promiseWarehouseId=");
    expect(page.url()).toContain("promiseWarehouseCode=" + fixture.warehouseCode);
    // URLSearchParams encodes spaces as +, not %20
    const expectedWarehouseName = encodeURIComponent(fixture.warehouseName).replace(/%20/g, '+');
    expect(page.url()).toContain("promiseWarehouseName=" + expectedWarehouseName);
    expect(page.url()).toContain("promiseRequestedQty=1");
    expect(page.url()).toContain("promiseAvailableQty=20");
    expect(page.url()).toContain("promiseCheckedAt=");
    expect(page.url()).toContain("promiseSource=availability");
  });

  test("Direct URL with promise params renders commercial promise summary", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto(`/production/requests/new?productId=${fixture.baseProductId}&sku=${fixture.baseProductSku}&source=availability&promiseProductId=${fixture.baseProductId}&promiseSku=${fixture.baseProductSku}&promiseWarehouseId=${fixture.warehouseId}&promiseWarehouseCode=${fixture.warehouseCode}&promiseWarehouseName=${encodeURIComponent(fixture.warehouseName).replace(/%20/g, '+')}&promiseRequestedQty=1&promiseAvailableQty=20&promiseCheckedAt=${new Date().toISOString()}&promiseSource=availability&promiseIsSubstitute=false`);
    
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await expect(page.getByTestId("commercial-promise-section")).toBeVisible();
    await expect(page.getByTestId("commercial-promise-status")).toHaveText("Promesa segura");
  });

  test("Click-through from availability page renders commercial promise summary", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto(`/production/availability?q=${fixture.baseProductSku}&productId=${fixture.baseProductId}&sku=${fixture.baseProductSku}&source=catalog`);
    
    const crearPedidoLink = page.getByRole("link", { name: new RegExp(`Crear pedido.*${fixture.warehouseCode}`, "i") });
    await crearPedidoLink.click();
    
    await expect(page).toHaveURL(/\/production\/requests\/new/);
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await expect(page.getByTestId("commercial-promise-section")).toBeVisible();
    await expect(page.getByTestId("commercial-promise-status")).toHaveText("Promesa segura");
    await expect(page.getByTestId("commercial-promise-section")).toContainText(fixture.warehouseCode);
    await expect(page.getByTestId("commercial-promise-available-qty")).toHaveText("20");
  });

  test("Nuevo Pedido summary shows promise state and checked availability", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    // Use the same flow as test #3 which passes - click through from availability page
    await page.goto(`/production/availability?q=${fixture.baseProductSku}&productId=${fixture.baseProductId}&sku=${fixture.baseProductSku}&source=catalog`);
    
    const crearPedidoLink = page.getByRole("link", { name: new RegExp(`Crear pedido.*${fixture.warehouseCode}`, "i") });
    await crearPedidoLink.click();
    
    await expect(page).toHaveURL(/\/production\/requests\/new/);
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await expect(page.getByTestId("commercial-promise-section")).toBeVisible();
    await expect(page.getByTestId("commercial-promise-status")).toHaveText("Promesa segura");
    await expect(page.getByTestId("commercial-promise-section")).toContainText(fixture.warehouseCode);
    await expect(page.getByTestId("commercial-promise-available-qty")).toHaveText("20"); // Available qty
  });

  test("Insufficient stock (requested > available) shows warning and is not displayed as promise_safe", async ({ page }) => {
    // Remove leftovers from an interrupted run before creating the fixture.
    // This keeps the serial suite repeatable when a prior assertion failed
    // before reaching its inline cleanup.
    const existingLowStockProduct = await prisma.product.findUnique({ where: { sku: "LOW-STOCK-001" }, select: { id: true } });
    const existingLowStockLocation = await prisma.location.findUnique({ where: { code: "LOW-LOC-001" }, select: { id: true } });
    if (existingLowStockProduct || existingLowStockLocation) {
      await prisma.inventory.deleteMany({
        where: {
          OR: [
            ...(existingLowStockProduct ? [{ productId: existingLowStockProduct.id }] : []),
            ...(existingLowStockLocation ? [{ locationId: existingLowStockLocation.id }] : []),
          ],
        },
      });
      if (existingLowStockProduct) {
        await prisma.product.delete({ where: { id: existingLowStockProduct.id } });
      }
      if (existingLowStockLocation) {
        await prisma.location.delete({ where: { id: existingLowStockLocation.id } });
      }
    }

    // Create a product with low stock
    const lowStockProduct = await prisma.product.create({
      data: {
        sku: "LOW-STOCK-001",
        referenceCode: "LOW-REF-001",
        name: "Low Stock Product",
        type: "HOSE",
        brand: "Test",
        subcategory: "Test",
      },
      select: { id: true },
    });

    const lowStockLocation = await prisma.location.create({
      data: {
        code: "LOW-LOC-001",
        name: "Low Stock Location",
        zone: "A",
        isActive: true,
        usageType: "STORAGE",
        warehouseId: fixture.warehouseId,
      },
      select: { id: true },
    });

    await prisma.inventory.create({
      data: {
        productId: lowStockProduct.id,
        locationId: lowStockLocation.id,
        quantity: 2,
        reserved: 0,
        available: 2,
      },
    });

    const { id: lowStockProductId } = lowStockProduct;
    
    // Test with requested qty > available qty directly in Nuevo Pedido
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto(`/production/requests/new?productId=${lowStockProductId}&sku=LOW-STOCK-001&source=availability&promiseProductId=${lowStockProductId}&promiseSku=LOW-STOCK-001&promiseWarehouseId=${fixture.warehouseId}&promiseWarehouseCode=${fixture.warehouseCode}&promiseWarehouseName=${encodeURIComponent(fixture.warehouseName)}&promiseRequestedQty=5&promiseAvailableQty=2&promiseCheckedAt=${new Date().toISOString()}&promiseSource=availability&promiseIsSubstitute=false`);
    
    await expect(page.getByTestId("commercial-promise-section")).toBeVisible();
    await expect(page.getByTestId("commercial-promise-status")).toHaveText("Disponibilidad insuficiente");
    
    // Should NOT show "Promesa segura"
    await expect(page.getByTestId("commercial-promise-status")).not.toHaveText("Promesa segura");
    
    // Cleanup
    await prisma.product.delete({ where: { id: lowStockProductId } });
    await prisma.location.delete({ where: { id: lowStockLocation.id } });
  });

  test("Missing availability context does not show a promise", async ({ page }) => {
    // Navigate directly without promise params
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto(`/production/requests/new?productId=${fixture.baseProductId}&sku=${fixture.baseProductSku}&source=catalog`);
    
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await expect(page.getByTestId("commercial-promise-section")).toHaveCount(0);
  });

  test("Equivalent context does not claim availability before it is checked", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto(`/production/equivalences?q=${fixture.baseProductSku}&productId=${fixture.baseProductId}&sku=${fixture.baseProductSku}&source=catalog`);
    
    await expect(page.getByRole("heading", { name: /Alternativas y equivalencias/i })).toBeVisible();
    
    // Click create order for equivalent product
    const crearPedidoEquivLink = page.getByRole("link", { name: new RegExp(`Crear pedido con ${FIXTURE.equivalentName}`, "i") });
    await expect(crearPedidoEquivLink).toBeVisible();
    await crearPedidoEquivLink.click();
    
    await expect(page).toHaveURL(/\/production\/requests\/new\?.*source=equivalences/);
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await expect(page.getByTestId("commercial-promise-section")).toHaveCount(0);
  });

  test("Mobile layout has no horizontal overflow and shows promise status", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto(`/production/availability?q=${fixture.baseProductSku}&productId=${fixture.baseProductId}&sku=${fixture.baseProductSku}&source=catalog`);
    
    const crearPedidoLink = page.getByRole("link", { name: new RegExp(`Crear pedido.*${fixture.warehouseCode}`, "i") });
    await crearPedidoLink.click();
    
    const body = page.locator("body");
    const bodyWidth = await body.evaluate(el => el.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(390);
    
    await expect(page.getByTestId("commercial-promise-section")).toBeVisible();
  });

  test("MANAGER can access the flow and see promise state", async ({ page }) => {
    await loginAs(page, "MANAGER");
    await page.goto(`/production/availability?q=${fixture.baseProductSku}&productId=${fixture.baseProductId}&sku=${fixture.baseProductSku}&source=catalog`);
    
    const crearPedidoLink = page.getByRole("link", { name: new RegExp(`Crear pedido.*${fixture.warehouseCode}`, "i") });
    await crearPedidoLink.click();
    
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await expect(page.getByTestId("commercial-promise-section")).toBeVisible();
    await expect(page.getByTestId("commercial-promise-status")).toHaveText("Promesa segura");
  });

  test("SYSTEM_ADMIN can access the flow and see promise state", async ({ page }) => {
    await loginAs(page, "SYSTEM_ADMIN");
    await page.goto(`/production/availability?q=${fixture.baseProductSku}&productId=${fixture.baseProductId}&sku=${fixture.baseProductSku}&source=catalog`);
    
    const crearPedidoLink = page.getByRole("link", { name: new RegExp(`Crear pedido.*${fixture.warehouseCode}`, "i") });
    await crearPedidoLink.click();
    
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await expect(page.getByTestId("commercial-promise-section")).toBeVisible();
    await expect(page.getByTestId("commercial-promise-status")).toHaveText("Promesa segura");
  });

  test("WAREHOUSE_OPERATOR does not see sales-only commercial promise actions", async ({ page }) => {
    await loginAs(page, "WAREHOUSE_OPERATOR");
    await page.goto("/production/requests/new");
    
    // Should not have access to sales views - either redirected or blocked
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).not.toBeVisible();
  });

  test("Stale promise (checkedAt > 15 min ago) shows warning and requires re-check", async ({ page }) => {
    // Set checkedAt to 20 minutes ago (stale threshold is 15 min)
    const staleTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto(`/production/requests/new?productId=${fixture.baseProductId}&sku=${fixture.baseProductSku}&source=availability&promiseProductId=${fixture.baseProductId}&promiseSku=${fixture.baseProductSku}&promiseWarehouseId=${fixture.warehouseId}&promiseWarehouseCode=${fixture.warehouseCode}&promiseWarehouseName=${encodeURIComponent(fixture.warehouseName)}&promiseRequestedQty=5&promiseAvailableQty=20&promiseCheckedAt=${encodeURIComponent(staleTime)}&promiseSource=availability&promiseIsSubstitute=false`);
    
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    
    // Should show "Promesa vencida" badge (warning variant)
    await expect(page.getByTestId("commercial-promise-status")).toHaveText("Promesa vencida");
    
    // Should show warning about stale verification
    await expect(page.getByText(/consulta supera el límite de 15 minutos/i)).toBeVisible();
  });

  test("Nuevo Pedido does not allow creation without at least one product or ensamble", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto("/production/requests/new");
    
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continuar a producto/i })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Crear pedido/i })).toHaveCount(0);
  });
});
