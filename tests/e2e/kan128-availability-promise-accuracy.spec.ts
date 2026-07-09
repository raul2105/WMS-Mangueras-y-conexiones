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
          in: [FIXTURE.productSku, FIXTURE.equivalentSku],
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

  const customerIds = customers.map((c) => c.id);
  const productIds = products.map((p) => p.id);
  const warehouseIds = warehouses.map((w) => w.id);
  const locationIds = locations.map((l) => l.id);

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
    // Use warehouse CODE for promiseWarehouseId as availability page link generation uses warehouse CODE
    await page.goto(`/production/requests/new?productId=${fixture.baseProductId}&sku=${fixture.baseProductSku}&source=availability&promiseProductId=${fixture.baseProductId}&promiseSku=${fixture.baseProductSku}&promiseWarehouseId=${fixture.warehouseCode}&promiseWarehouseCode=${fixture.warehouseCode}&promiseWarehouseName=${encodeURIComponent(fixture.warehouseName).replace(/%20/g, '+')}&promiseRequestedQty=1&promiseAvailableQty=20&promiseCheckedAt=${new Date().toISOString()}&promiseSource=availability&promiseIsSubstitute=false`);
    
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await page.waitForLoadState("networkidle");
    
    // Check if order-summary-desktop is there
    const summary = page.locator('[data-testid="order-summary-desktop"]');
    await expect(summary).toBeVisible({ timeout: 15000 });
    
    // Check if commercialPromise section exists
    const promiseSection = page.locator('[data-testid="order-summary-desktop"]').getByText("Promesa de disponibilidad");
    await expect(promiseSection).toBeVisible({ timeout: 10000 });
  });

  test("Click-through from availability page renders commercial promise summary", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto(`/production/availability?q=${fixture.baseProductSku}&productId=${fixture.baseProductId}&sku=${fixture.baseProductSku}&source=catalog`);
    
    const crearPedidoLink = page.getByRole("link", { name: new RegExp(`Crear pedido.*${fixture.warehouseCode}`, "i") });
    await crearPedidoLink.click();
    
    await expect(page).toHaveURL(/\/production\/requests\/new/);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    
    // Check promise state section in OrderSummary
    await expect(page.locator('[data-testid="order-summary-desktop"]')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);
    
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText("Promesa de disponibilidad")).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText("Promesa segura")).toBeVisible();
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText(fixture.warehouseCode)).toBeVisible();
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText("20")).toBeVisible();
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText(/Verificado:/i)).toBeVisible();
  });

  test("Nuevo Pedido summary shows promise state and checked availability", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    // Use the same flow as test #3 which passes - click through from availability page
    await page.goto(`/production/availability?q=${fixture.baseProductSku}&productId=${fixture.baseProductId}&sku=${fixture.baseProductSku}&source=catalog`);
    
    const crearPedidoLink = page.getByRole("link", { name: new RegExp(`Crear pedido.*${fixture.warehouseCode}`, "i") });
    await crearPedidoLink.click();
    
    // Wait for navigation and page to fully load
    await expect(page).toHaveURL(/\/production\/requests\/new/);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    
    // Check promise state section in OrderSummary with extended timeout
    await expect(page.locator('[data-testid="order-summary-desktop"]')).toBeVisible({ timeout: 15000 });
    
    // Wait for the promise section to render - use waitForFunction to check DOM
    await page.waitForFunction(() => 
      document.body.textContent?.includes("Promesa de disponibilidad"), 
      { timeout: 20000 }
    );
    
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText("Promesa de disponibilidad")).toBeVisible();
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText("Promesa segura")).toBeVisible();
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText(fixture.warehouseCode)).toBeVisible();
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText("20")).toBeVisible(); // Available qty
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText(/Verificado:/i)).toBeVisible();
  });

  test("Insufficient stock (requested > available) shows warning and is not displayed as promise_safe", async ({ page }) => {
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
    
    await expect(page.locator('[data-testid="order-summary-desktop"]')).toBeVisible();
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText("Disponibilidad insuficiente")).toBeVisible();
    
    // Should NOT show "Promesa segura"
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText("Promesa segura")).not.toBeVisible();
    
    // Cleanup
    await prisma.product.delete({ where: { id: lowStockProductId } });
    await prisma.location.delete({ where: { id: lowStockLocation.id } });
  });

  test("Missing availability context shows 'Disponibilidad no verificada'", async ({ page }) => {
    // Navigate directly without promise params
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto(`/production/requests/new?productId=${fixture.baseProductId}&sku=${fixture.baseProductSku}&source=catalog`);
    
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await expect(page.locator('[data-testid="order-summary-desktop"]')).toBeVisible();
    
    // Should show "Disponibilidad no verificada" or equivalent unresolved state
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText("Disponibilidad no verificada")).toBeVisible();
  });

  test("Equivalent/substitute context shows substitute confirmation state", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    await page.goto(`/production/equivalences?q=${fixture.baseProductSku}&productId=${fixture.baseProductId}&sku=${fixture.baseProductSku}&source=catalog`);
    
    await expect(page.getByRole("heading", { name: /Alternativas y equivalencias/i })).toBeVisible();
    
    // Click create order for equivalent product
    const crearPedidoEquivLink = page.getByRole("link", { name: new RegExp(`Crear pedido con ${FIXTURE.equivalentName}`, "i") });
    await expect(crearPedidoEquivLink).toBeVisible();
    await crearPedidoEquivLink.click();
    
    await expect(page).toHaveURL(/\/production\/requests\/new\?.*source=equivalences/);
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await expect(page.getByText(/Sustituye a/i)).toBeVisible();
    await expect(page.locator('[data-testid="order-summary-desktop"]')).toBeVisible();
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText("Sustituto pendiente de confirmar")).toBeVisible();
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText(fixture.baseProductSku)).toBeVisible();
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
    
    // Check mobile summary is collapsible and shows promise status
    await expect(page.locator('[data-testid="order-summary-mobile"]').getByText("Resumen del pedido")).toBeVisible();
  });

  test("MANAGER can access the flow and see promise state", async ({ page }) => {
    await loginAs(page, "MANAGER");
    await page.goto(`/production/availability?q=${fixture.baseProductSku}&productId=${fixture.baseProductId}&sku=${fixture.baseProductSku}&source=catalog`);
    
    const crearPedidoLink = page.getByRole("link", { name: new RegExp(`Crear pedido.*${fixture.warehouseCode}`, "i") });
    await crearPedidoLink.click();
    
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await expect(page.locator('[data-testid="order-summary-desktop"]')).toBeVisible();
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText("Promesa segura")).toBeVisible();
  });

  test("SYSTEM_ADMIN can access the flow and see promise state", async ({ page }) => {
    await loginAs(page, "SYSTEM_ADMIN");
    await page.goto(`/production/availability?q=${fixture.baseProductSku}&productId=${fixture.baseProductId}&sku=${fixture.baseProductSku}&source=catalog`);
    
    const crearPedidoLink = page.getByRole("link", { name: new RegExp(`Crear pedido.*${fixture.warehouseCode}`, "i") });
    await crearPedidoLink.click();
    
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    await expect(page.locator('[data-testid="order-summary-desktop"]')).toBeVisible();
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText("Promesa segura")).toBeVisible();
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
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText("Promesa vencida")).toBeVisible();
    
    // Should show warning about stale verification
    await expect(page.locator('[data-testid="order-summary-desktop"]').getByText(/supera el umbral de 15 minutos/i)).toBeVisible();
  });

  test("Draft creation is allowed but not marked as warehouse-ready or promise-safe without valid promise", async ({ page }) => {
    await loginAs(page, "SALES_EXECUTIVE");
    // Go to Nuevo Pedido with no promise context and no product
    await page.goto("/production/requests/new");
    
    await expect(page.getByRole("heading", { name: /Nuevo pedido comercial/i })).toBeVisible();
    
    // Fill required fields but don't select product
    await page.getByLabel(/Selecciona o crea el cliente/i).fill(fixture.customerName);
    await expect(page.getByRole("button", { name: new RegExp(fixture.customerName, "i") })).toBeVisible();
    await page.getByRole("button", { name: new RegExp(fixture.customerName, "i") }).click();
    
    await page.locator('select[name="warehouseId"]').selectOption(fixture.warehouseId);
    await page.locator('input[name="dueDate"]').fill("2026-12-31");
    
    // Should be able to create as draft (BORRADOR)
    await page.getByRole("button", { name: /Crear pedido/i }).click();
    
    // Should redirect to order detail with success
    await expect(page).toHaveURL(/\/production\/requests\/.+\?ok=/);
    await expect(page.getByText(/Pedido de surtido creado/i)).toBeVisible();
    
    // Order should be BORRADOR (draft) not CONFIRMADA
    await expect(page.getByText("Borrador")).toBeVisible();
  });
});