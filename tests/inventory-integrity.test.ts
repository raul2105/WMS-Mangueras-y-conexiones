import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { InventoryService } from "../lib/inventory-service";
import { importProductsFromCsv } from "../scripts/import-products-from-csv.cjs";

const prisma = new PrismaClient();

async function resetDb() {
  await prisma.inventoryMovement.deleteMany();
  await prisma.productionOrderItem.deleteMany();
  await prisma.productionOrder.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.location.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
}

async function createBaseData() {
  const warehouse = await prisma.warehouse.create({
    data: {
      code: "WH-TEST",
      name: "Warehouse Test",
      description: "Test warehouse",
      isActive: true,
    },
  });

  const location = await prisma.location.create({
    data: {
      code: "LOC-TEST-01",
      name: "Location Test",
      zone: "A",
      isActive: true,
      warehouseId: warehouse.id,
    },
  });

  const product = await prisma.product.create({
    data: {
      sku: "SKU-TEST-01",
      name: "Producto Test",
      type: "HOSE",
    },
  });

  return { warehouse, location, product };
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

describe("InventoryService integrity", () => {
  it("receive increments quantity", async () => {
    const { product, location } = await createBaseData();
    const service = new InventoryService(prisma);

    await service.receiveStock(product.id, location.id, 5, "RCV-1");
    await service.receiveStock(product.id, location.id, 3, "RCV-2");

    const inv = await prisma.inventory.findUnique({
      where: { productId_locationId: { productId: product.id, locationId: location.id } },
    });

    expect(inv?.quantity).toBe(8);
  });

  it("pick decrements quantity and never goes negative", async () => {
    const { product, location } = await createBaseData();
    const service = new InventoryService(prisma);

    await service.receiveStock(product.id, location.id, 5, "RCV-1");
    await service.pickStock(product.id, location.id, 3, "PICK-1");

    const inv = await prisma.inventory.findUnique({
      where: { productId_locationId: { productId: product.id, locationId: location.id } },
    });

    expect(inv?.quantity).toBe(2);
    expect(inv?.available).toBe(2);

    await expect(
      service.pickStock(product.id, location.id, 5, "PICK-2")
    ).rejects.toMatchObject({ code: "INSUFFICIENT_AVAILABLE" });
  });

  it("import creates location and uses locationId", async () => {
    const csvPath = path.join(process.cwd(), "data", "products.test.csv");
    const csvContent = [
      "sku,name,type,description,brand,base_cost,price,category,quantity,location,attributes,referenceCode,imageUrl",
      "SKU-IMP-01,Producto Importado,HOSE,Desc,Marca,10,20,Categoria,7,LOC-NEW,{},REF-01,",
    ].join("\n");

    fs.writeFileSync(csvPath, csvContent, "utf8");

    await importProductsFromCsv({ filePath: csvPath, dryRun: false, prismaClient: prisma });

    const location = await prisma.location.findUnique({
      where: { code: "LOC-NEW" },
      include: { warehouse: true },
    });

    expect(location).toBeTruthy();
    expect(location?.warehouse.code).toBe("DEFAULT");

    const product = await prisma.product.findUnique({
      where: { sku: "SKU-IMP-01" },
      select: { id: true },
    });

    const inv = await prisma.inventory.findUnique({
      where: { productId_locationId: { productId: product?.id ?? "", locationId: location?.id ?? "" } },
    });

    expect(inv).toBeTruthy();
    expect(inv?.locationId).toBe(location?.id);

    fs.unlinkSync(csvPath);
  });

  it("does not create duplicate inventory rows", async () => {
    const { product, location } = await createBaseData();
    const service = new InventoryService(prisma);

    await service.receiveStock(product.id, location.id, 2, "RCV-1");
    await service.receiveStock(product.id, location.id, 4, "RCV-2");

    const count = await prisma.inventory.count({
      where: { productId: product.id, locationId: location.id },
    });

    expect(count).toBe(1);
  });
});
