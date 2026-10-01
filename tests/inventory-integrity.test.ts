import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { InventoryService, InventoryServiceError } from "../lib/inventory-service";
import { importProductsFromCsv } from "../scripts/data/import-products-from-csv.cjs";

const csvFixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "wms-inventory-fixtures-"));

const prisma = new PrismaClient();

async function resetDb() {
  await prisma.purchaseReceiptLine.deleteMany();
  await prisma.purchaseReceipt.deleteMany();
  await prisma.purchaseOrderLine.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.supplierProduct.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.salesInternalOrderPickTask.deleteMany();
  await prisma.salesInternalOrderPickList.deleteMany();
  await prisma.salesInternalOrderAssemblyConfig.deleteMany();
  await prisma.salesInternalOrderLine.deleteMany();
  await prisma.salesInternalOrder.deleteMany();
  await prisma.pickTask.deleteMany();
  await prisma.pickList.deleteMany();
  await prisma.assemblyWorkOrderLine.deleteMany();
  await prisma.assemblyWorkOrder.deleteMany();
  await prisma.assemblyConfiguration.deleteMany();
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
  for (const filename of fs.readdirSync(csvFixtureDirectory)) {
    fs.unlinkSync(path.join(csvFixtureDirectory, filename));
  }
  fs.rmdirSync(csvFixtureDirectory);
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

  it("import uses the registered location and preserves its warehouse relation", async () => {
    const { warehouse, location: registeredLocation } = await createBaseData();
    const csvPath = path.join(csvFixtureDirectory, "products.test.csv");
    const csvContent = [
      "sku,name,type,description,brand,base_cost,price,category,quantity,location,attributes,referenceCode,imageUrl",
      `SKU-IMP-01,Producto Importado,HOSE,Desc,Marca,10,20,Categoria,7,${registeredLocation.code},{},REF-01,`,
    ].join("\n");

    fs.writeFileSync(csvPath, csvContent, "utf8");

    await importProductsFromCsv({ filePath: csvPath, dryRun: false, prismaClient: prisma });

    const location = await prisma.location.findUnique({
      where: { code: registeredLocation.code },
      include: { warehouse: true },
    });

    expect(location).toBeTruthy();
    expect(location?.id).toBe(registeredLocation.id);
    expect(location?.warehouse.id).toBe(warehouse.id);

    const product = await prisma.product.findUnique({
      where: { sku: "SKU-IMP-01" },
      select: { id: true },
    });

    const inv = await prisma.inventory.findUnique({
      where: { productId_locationId: { productId: product?.id ?? "", locationId: location?.id ?? "" } },
    });

    expect(inv).toBeTruthy();
    expect(inv?.locationId).toBe(location?.id);
    expect(inv?.quantity).toBe(7);

    fs.unlinkSync(csvPath);
  });

  it("import rejects an unregistered location without creating product or inventory", async () => {
    const csvPath = path.join(csvFixtureDirectory, "products.unknown-location.csv");
    fs.writeFileSync(csvPath, [
      "sku,name,type,quantity,location",
      "SKU-UNKNOWN,Producto importado,HOSE,7,LOC-UNKNOWN",
    ].join("\n"), "utf8");
    await expect(importProductsFromCsv({ filePath: csvPath, dryRun: false, prismaClient: prisma }))
      .rejects.toThrow('unknown location "LOC-UNKNOWN"');
    expect(await prisma.product.count()).toBe(0);
    expect(await prisma.inventory.count()).toBe(0);
    expect(await prisma.location.count()).toBe(0);
  });

  it("import rejects an existing referenceCode conflict without changing its owner", async () => {
    const { location } = await createBaseData();
    await prisma.product.create({
      data: {
        sku: "SKU-EXIST-REF",
        name: "Producto Existente",
        type: "HOSE",
        referenceCode: "REF-DUP-01",
      },
    });

    const csvPath = path.join(csvFixtureDirectory, "products.ref-conflict.csv");
    const csvContent = [
      "sku,name,type,description,brand,base_cost,price,category,quantity,location,attributes,referenceCode,imageUrl",
      `SKU-NEW-REF,Producto Nuevo,HOSE,Desc,Marca,10,20,Categoria,5,${location.code},{},REF-DUP-01,`,
    ].join("\n");

    fs.writeFileSync(csvPath, csvContent, "utf8");

    await expect(importProductsFromCsv({ filePath: csvPath, dryRun: false, prismaClient: prisma }))
      .rejects.toThrow("referenceCode REF-DUP-01 already belongs to sku SKU-EXIST-REF");

    const imported = await prisma.product.findUnique({
      where: { sku: "SKU-NEW-REF" },
      select: { referenceCode: true },
    });

    expect(imported).toBeNull();
    expect((await prisma.product.findUnique({ where: { sku: "SKU-EXIST-REF" } }))?.referenceCode).toBe("REF-DUP-01");
    expect(await prisma.inventory.count()).toBe(0);

    fs.unlinkSync(csvPath);
  });

  it("import rejects duplicate referenceCode inside CSV before applying any row", async () => {
    const { location } = await createBaseData();
    const csvPath = path.join(csvFixtureDirectory, "products.ref-dup-in-csv.csv");
    const csvContent = [
      "sku,name,type,description,brand,base_cost,price,category,quantity,location,attributes,referenceCode,imageUrl",
      `SKU-CSV-REF-1,Producto 1,HOSE,Desc,Marca,10,20,Categoria,2,${location.code},{},REF-CSV-DUP,`,
      `SKU-CSV-REF-2,Producto 2,HOSE,Desc,Marca,10,20,Categoria,3,${location.code},{},REF-CSV-DUP,`,
    ].join("\n");

    fs.writeFileSync(csvPath, csvContent, "utf8");

    await expect(importProductsFromCsv({ filePath: csvPath, dryRun: false, prismaClient: prisma }))
      .rejects.toThrow("referenceCode REF-CSV-DUP already appears on sku SKU-CSV-REF-1");

    const [first, second] = await Promise.all([
      prisma.product.findUnique({ where: { sku: "SKU-CSV-REF-1" }, select: { referenceCode: true } }),
      prisma.product.findUnique({ where: { sku: "SKU-CSV-REF-2" }, select: { referenceCode: true } }),
    ]);

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(await prisma.inventory.count()).toBe(0);

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

  it("adjust stock changes quantity by delta", async () => {
    const { product, location } = await createBaseData();
    const service = new InventoryService(prisma);

    await service.receiveStock(product.id, location.id, 10, "RCV-1");
    await service.adjustStock(product.id, location.id, -3, "CONTEO_CICLICO");

    const inv = await prisma.inventory.findUnique({
      where: { productId_locationId: { productId: product.id, locationId: location.id } },
    });
    expect(inv?.quantity).toBe(7);
    expect(inv?.available).toBe(7);
  });

  it("adjust stock rejects delta that would result in negative stock", async () => {
    const { product, location } = await createBaseData();
    const service = new InventoryService(prisma);

    await service.receiveStock(product.id, location.id, 5, "RCV-1");
    await expect(
      service.adjustStock(product.id, location.id, -10, "MERMA_DANIO")
    ).rejects.toMatchObject({ code: "NEGATIVE_STOCK" });
  });

  it("pick rejects picking from non-existent inventory", async () => {
    const { product, location } = await createBaseData();
    const service = new InventoryService(prisma);

    await expect(
      service.pickStock(product.id, location.id, 1, "PICK-1")
    ).rejects.toMatchObject({ code: "INVENTORY_NOT_FOUND" });
  });

  it("transfer rejects same source and destination", async () => {
    const { product, location } = await createBaseData();
    const service = new InventoryService(prisma);

    await service.receiveStock(product.id, location.id, 5, "RCV-1");
    await expect(
      service.transferStock(product.id, location.id, location.id, 2, "TRF-1")
    ).rejects.toMatchObject({ code: "INVALID_TRANSFER" });
  });

  it("transfer rejects transferring more than available", async () => {
    const { product, warehouse, location } = await createBaseData();
    const location2 = await prisma.location.create({
      data: { code: "LOC-TEST-ERR", name: "Loc Err", zone: "A", isActive: true, warehouseId: warehouse.id },
    });
    const service = new InventoryService(prisma);

    await service.receiveStock(product.id, location.id, 3, "RCV-1");
    await expect(
      service.transferStock(product.id, location.id, location2.id, 10, "TRF-FAIL")
    ).rejects.toMatchObject({ code: "INSUFFICIENT_AVAILABLE" });
  });

  it("InventoryServiceError has correct name and code", () => {
    const err = new InventoryServiceError("TEST_CODE", "test message");
    expect(err.name).toBe("InventoryServiceError");
    expect(err.code).toBe("TEST_CODE");
    expect(err.message).toBe("test message");
    expect(err instanceof Error).toBe(true);
  });

  it("transfer moves stock between locations atomically", async () => {
    const { product, warehouse, location } = await createBaseData();
    const location2 = await prisma.location.create({
      data: {
        code: "LOC-TEST-02",
        name: "Location Test 2",
        zone: "B",
        isActive: true,
        warehouseId: warehouse.id,
      },
    });
    const service = new InventoryService(prisma);

    await service.receiveStock(product.id, location.id, 10, "RCV-1");
    await service.transferStock(product.id, location.id, location2.id, 4, "TRF-1");

    const [fromInv, toInv] = await Promise.all([
      prisma.inventory.findUnique({
        where: { productId_locationId: { productId: product.id, locationId: location.id } },
      }),
      prisma.inventory.findUnique({
        where: { productId_locationId: { productId: product.id, locationId: location2.id } },
      }),
    ]);

    expect(fromInv?.quantity).toBe(6);
    expect(toInv?.quantity).toBe(4);
  });

  it("transfer preserves operator attribution in movement and audit records", async () => {
    const { product, warehouse, location } = await createBaseData();
    const actorUser = await prisma.user.create({
      data: {
        email: "operator-qa@scmayher.com",
        name: "Operador QA",
        passwordHash: "hash",
        isActive: true,
      },
    });
    const location2 = await prisma.location.create({
      data: {
        code: "LOC-TEST-03",
        name: "Location Test 3",
        zone: "C",
        isActive: true,
        warehouseId: warehouse.id,
      },
    });
    const service = new InventoryService(prisma);

    await service.receiveStock(product.id, location.id, 7, "RCV-ATTR");
    await service.transferStock(product.id, location.id, location2.id, 3, "TRF-ATTR", {
      actor: "Operador QA",
      actorUserId: actorUser.id,
      operatorName: "Operador QA",
      operatorUserId: actorUser.id,
      source: "tests/inventory-integrity",
    });

    const [movement, audit] = await Promise.all([
      prisma.inventoryMovement.findFirst({
        where: { reference: "TRF-ATTR", type: "TRANSFER" },
        orderBy: { createdAt: "desc" },
        select: { operatorName: true, operatorUserId: true, fromLocationCode: true, toLocationCode: true },
      }),
      prisma.auditLog.findFirst({
        where: {
          entityType: "INVENTORY",
          action: "TRANSFER_STOCK",
          actor: "Operador QA",
        },
        orderBy: { createdAt: "desc" },
        select: { actor: true, actorUserId: true, source: true },
      }),
    ]);

    expect(movement?.operatorName).toBe("Operador QA");
    expect(movement?.operatorUserId).toBe(actorUser.id);
    expect(audit?.actor).toBe("Operador QA");
    expect(audit?.actorUserId).toBe(actorUser.id);
    expect(audit?.source).toBe("tests/inventory-integrity");
  });
});
