/* eslint-disable no-console */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function requireEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function awsJson(args, env) {
  const stdout = execFileSync("aws", args, {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(stdout);
}

function toAttr(value) {
  if (value == null) return { NULL: true };
  if (typeof value === "string") return { S: value };
  if (typeof value === "number") return { N: String(value) };
  if (typeof value === "boolean") return { BOOL: value };
  if (Array.isArray(value)) return { L: value.map((entry) => toAttr(entry)) };
  if (typeof value === "object") {
    return {
      M: Object.fromEntries(
        Object.entries(value)
          .filter(([, entry]) => entry !== undefined)
          .map(([key, entry]) => [key, toAttr(entry)]),
      ),
    };
  }
  return { S: String(value) };
}

function chunk(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function getStackOutputs({ stackName, profile, region, env }) {
  const response = awsJson(
    ["cloudformation", "describe-stacks", "--stack-name", stackName, "--profile", profile, "--region", region],
    env,
  );
  const outputs = response?.Stacks?.[0]?.Outputs || [];
  return Object.fromEntries(outputs.map((entry) => [entry.OutputKey, entry.OutputValue]));
}

async function loadCatalogItems() {
  const products = await prisma.product.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      sku: true,
      referenceCode: true,
      name: true,
      type: true,
      brand: true,
      subcategory: true,
      price: true,
      updatedAt: true,
      category: { select: { name: true } },
      inventory: {
        select: {
          quantity: true,
          reserved: true,
          available: true,
          location: { select: { warehouse: { select: { code: true } } } },
        },
      },
      equivalencesFrom: {
        where: { active: true },
        select: { equivProductId: true },
      },
    },
  });

  return products.map((product) => ({
    productId: product.id,
    sku: product.sku,
    referenceCode: product.referenceCode,
    name: product.name,
    type: product.type,
    brand: product.brand,
    categoryName: product.category?.name ?? null,
    subcategory: product.subcategory ?? null,
    price: product.price ?? null,
    inventory: Array.from(
      product.inventory.reduce((acc, row) => {
        const warehouseCode = row.location.warehouse.code;
        const current = acc.get(warehouseCode) || { warehouseCode, quantity: 0, reserved: 0, available: 0 };
        current.quantity += Number(row.quantity ?? 0);
        current.reserved += Number(row.reserved ?? 0);
        current.available += Number(row.available ?? 0);
        acc.set(warehouseCode, current);
        return acc;
      }, new Map()).values(),
    ),
    equivalents: product.equivalencesFrom.map((entry) => ({ productId: entry.equivProductId })),
    updatedAt: product.updatedAt.toISOString(),
  }));
}

async function loadSalesRequestItems() {
  const existingCount = await prisma.salesInternalOrder.count();
  if (existingCount === 0) {
    const [warehouse, salesUser, adminUser, product] = await Promise.all([
      prisma.warehouse.findFirst({ orderBy: { code: "asc" }, select: { id: true, code: true } }),
      prisma.user.findUnique({ where: { email: "sales@scmayher.com" }, select: { id: true, name: true, email: true } }),
      prisma.user.findUnique({ where: { email: "admin@scmayher.com" }, select: { id: true, name: true, email: true } }),
      prisma.product.findFirst({ orderBy: { sku: "asc" }, select: { id: true } }),
    ]);

    if (warehouse && salesUser && adminUser && product) {
      const draft = await prisma.salesInternalOrder.create({
        data: {
          code: "SUR-DEMO-001",
          status: "BORRADOR",
          customerName: "Cliente Demo Comercial",
          warehouseId: warehouse.id,
          dueDate: new Date("2026-04-15T00:00:00.000Z"),
          notes: "Pedido borrador para bootstrap móvil.",
          requestedByUserId: salesUser.id,
        },
      });

      const confirmed = await prisma.salesInternalOrder.create({
        data: {
          code: "SUR-DEMO-002",
          status: "CONFIRMADA",
          customerName: "Cuenta Demo Minería",
          warehouseId: warehouse.id,
          dueDate: new Date("2026-04-16T00:00:00.000Z"),
          notes: "Pedido confirmado con surtido directo activo.",
          requestedByUserId: salesUser.id,
          confirmedByUserId: adminUser.id,
          confirmedAt: new Date("2026-04-08T12:00:00.000Z"),
        },
      });

      const cancelled = await prisma.salesInternalOrder.create({
        data: {
          code: "SUR-DEMO-003",
          status: "CANCELADA",
          customerName: "Cliente Demo Cancelado",
          warehouseId: warehouse.id,
          dueDate: new Date("2026-04-17T00:00:00.000Z"),
          notes: "Pedido cancelado para validar filtros.",
          requestedByUserId: salesUser.id,
          cancelledByUserId: adminUser.id,
          cancelledAt: new Date("2026-04-08T13:00:00.000Z"),
        },
      });

      const confirmedLine = await prisma.salesInternalOrderLine.create({
        data: {
          orderId: confirmed.id,
          productId: product.id,
          requestedQty: 3,
        },
      });

      await prisma.salesInternalOrderLine.create({
        data: {
          orderId: draft.id,
          productId: product.id,
          requestedQty: 2,
        },
      });

      const targetLocation = await prisma.location.findFirst({
        where: { warehouseId: warehouse.id, usageType: "STAGING", isActive: true },
        orderBy: { code: "asc" },
        select: { id: true },
      });

      if (targetLocation) {
        await prisma.salesInternalOrderPickList.create({
          data: {
            code: "SPL-DEMO-001",
            orderId: confirmed.id,
            status: "RELEASED",
            targetLocationId: targetLocation.id,
            releasedAt: new Date("2026-04-08T12:10:00.000Z"),
          },
        });
      }

      await prisma.salesInternalOrderLine.create({
        data: {
          orderId: cancelled.id,
          productId: product.id,
          requestedQty: 1,
        },
      });
    }
  }

  const orders = await prisma.salesInternalOrder.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      status: true,
      customerName: true,
      dueDate: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      warehouse: { select: { code: true } },
      requestedByUser: { select: { name: true, email: true } },
      lines: { select: { id: true } },
      pickLists: {
        where: { status: { in: ["DRAFT", "RELEASED", "IN_PROGRESS", "PARTIAL"] } },
        select: { id: true },
      },
    },
  });

  return orders.map((order) => ({
    requestId: order.id,
    code: order.code,
    status: order.status,
    customerName: order.customerName ?? null,
    warehouseCode: order.warehouse?.code ?? null,
    dueDate: order.dueDate ? order.dueDate.toISOString() : null,
    requestedBy: order.requestedByUser?.name ?? order.requestedByUser?.email ?? null,
    lineCount: order.lines.length,
    linkedAssemblyCount: 0,
    directPickActive: order.pickLists.length > 0,
    syncStatus: "SYNCED",
    notes: order.notes ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  }));
}

function writeBatch({ tableName, items, profile, region, env }) {
  const requestItems = {
    [tableName]: items.map((item) => ({
      PutRequest: {
        Item: Object.fromEntries(Object.entries(item).map(([key, value]) => [key, toAttr(value)])),
      },
    })),
  };
  const tempFile = path.join(os.tmpdir(), `ddb-batch-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(tempFile, JSON.stringify(requestItems, null, 2), "utf8");
  try {
    execFileSync(
      "aws",
      ["dynamodb", "batch-write-item", "--request-items", `file://${tempFile}`, "--profile", profile, "--region", region],
      { env, stdio: "inherit" },
    );
  } finally {
    fs.unlinkSync(tempFile);
  }
}

async function run() {
  const environment = requireEnv("MOBILE_ENV");
  const profile = requireEnv("AWS_PROFILE");
  const region = requireEnv("AWS_REGION");
  const configPath = path.resolve(__dirname, "../../mobile/infra/cdk/config", `${environment}.json`);
  const stackConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const stackName = stackConfig.stackName;
  const env = { ...process.env, AWS_PAGER: "", AWS_REGION: region };
  const outputs = getStackOutputs({ stackName, profile, region, env });
  const catalogTableName = outputs.MobileCatalogTableName;
  const salesRequestsTableName = outputs.MobileSalesRequestsTableName;

  if (!catalogTableName || !salesRequestsTableName) {
    throw new Error("Missing stack outputs for bootstrap");
  }

  const [catalogItems, salesRequestItems] = await Promise.all([loadCatalogItems(), loadSalesRequestItems()]);

  for (const batch of chunk(catalogItems, 25)) {
    writeBatch({ tableName: catalogTableName, items: batch, profile, region, env });
  }

  for (const batch of chunk(salesRequestItems, 25)) {
    writeBatch({ tableName: salesRequestsTableName, items: batch, profile, region, env });
  }

  console.log(`bootstrap-ok catalog=${catalogItems.length} salesRequests=${salesRequestItems.length}`);
}

run()
  .catch((error) => {
    console.error(`[bootstrap] FAILED: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
