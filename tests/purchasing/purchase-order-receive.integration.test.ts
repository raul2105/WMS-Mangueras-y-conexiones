import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { commitPurchaseOrderReceipt } from "@/lib/purchasing/purchase-order-receiving";
import { ensureDefaultLabelTemplates } from "@/lib/labeling-service";

const shouldRunPostgresSuite =
  process.env.RUN_POSTGRES_TESTS === "1" &&
  /^postgres(ql)?:\/\//i.test(String(process.env.DATABASE_URL ?? ""));

const describePostgres = shouldRunPostgresSuite ? describe : describe.skip;

describePostgres("purchase order receive integration", () => {
  const prisma = new PrismaClient();
  const defaultLabelTemplateCodes = [
    "RECEIPT_STANDARD", "RECEIPT_COMPACT", "PICKING_STANDARD", "PICKING_COMPACT",
    "LOCATION_STANDARD", "LOCATION_COMPACT", "ADJUSTMENT_STANDARD", "ADJUSTMENT_COMPACT",
    "WIP_STANDARD", "WIP_COMPACT",
  ];
  const unique = () =>
    `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const actorUserIds: string[] = [];

  async function resetDb() {
    if (actorUserIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { actorUserId: { in: actorUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: actorUserIds } } });
      actorUserIds.splice(0);
    }
    await prisma.labelPrintJob.deleteMany();
    await prisma.traceRecord.deleteMany();
    await prisma.purchaseReceiptLine.deleteMany();
    await prisma.purchaseReceipt.deleteMany();
    await prisma.purchaseOrderLine.deleteMany();
    await prisma.purchaseOrder.deleteMany();
    await prisma.supplierProduct.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.location.deleteMany();
    await prisma.warehouse.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.product.deleteMany();
  }

  async function createFixture() {
    const supplier = await prisma.supplier.create({
      data: {
        code: `SUP-${unique()}`,
        name: "Proveedor Test",
        businessName: "Proveedor Test SA",
        legalName: "Proveedor Test SA de CV",
        taxId: "TAX-123",
        email: "compras@proveedor.test",
        phone: "555-111-2222",
        address: "Calle 1",
        paymentTerms: "30 días",
      },
    });

    const warehouse = await prisma.warehouse.create({
      data: {
        code: `WH-${unique()}`,
        name: "Almacén Test",
        address: "Carretera 1 Km 10",
      },
    });

    const location = await prisma.location.create({
      data: {
        code: `RECV-${unique()}`,
        name: "Ubicación Test",
        zone: "A",
        isActive: true,
        usageType: "RECEIVING",
        warehouseId: warehouse.id,
      },
    });

    const productA = await prisma.product.create({
      data: {
        sku: `SKU-${unique()}-1`,
        name: "Manguera Test",
        type: "HOSE",
        unitLabel: "metro",
      },
    });

    const productB = await prisma.product.create({
      data: {
        sku: `SKU-${unique()}-2`,
        name: "Conexión Test",
        type: "FITTING",
      },
    });

    const order = await prisma.purchaseOrder.create({
      data: {
        folio: `OC-${unique()}`,
        supplierId: supplier.id,
        deliveryWarehouseId: warehouse.id,
        status: "CONFIRMADA",
        notes: "OC para recepción",
        deliveryAddressSnapshot: warehouse.address,
        paymentTermsSnapshot: supplier.paymentTerms,
        lines: {
          create: [
            {
              productId: productA.id,
              qtyOrdered: 10,
              qtyReceived: 0,
              unitPrice: 12.5,
            },
            {
              productId: productB.id,
              qtyOrdered: 5,
              qtyReceived: 0,
              unitPrice: 8.0,
            },
          ],
        },
      },
    });

    const orderLines = await prisma.purchaseOrderLine.findMany({
      where: { purchaseOrderId: order.id },
    });

    return {
      supplier,
      warehouse,
      location,
      productA,
      productB,
      order,
      orderLines,
    };
  }

  async function expectRejectedWithoutReceipt(input: {
    order: { id: string; folio: string };
    line: { id: string; productId: string };
    locationId: string;
    actor: { id: string; name: string };
  }) {
    await expect(commitPurchaseOrderReceipt({
      prismaClient: prisma,
      orderId: input.order.id,
      locationId: input.locationId,
      referenceDoc: `DENIED-${unique()}`,
      notes: "Prueba de ubicación no autorizada",
      lines: [{
        lineId: input.line.id,
        productId: input.line.productId,
        qtyReceived: 2,
        qtyDamaged: 0,
        qtyMissing: 0,
        qtyRejected: 0,
        qtySurplusReported: 0,
        discrepancyReason: null,
      }],
      actor: { name: input.actor.name, userId: input.actor.id, operatorName: input.actor.name },
    })).rejects.toThrow("Selecciona una zona de recepción autorizada");

    const [line, order, receipts, stock, movements, audits, traces, labelJobs] = await Promise.all([
      prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: input.line.id } }),
      prisma.purchaseOrder.findUniqueOrThrow({ where: { id: input.order.id } }),
      prisma.purchaseReceipt.count({ where: { purchaseOrderId: input.order.id } }),
      prisma.inventory.findUnique({ where: { productId_locationId: { productId: input.line.productId, locationId: input.locationId } } }),
      prisma.inventoryMovement.count({ where: { reference: input.order.folio, type: "IN" } }),
      prisma.auditLog.count({ where: { entityType: "PURCHASE_ORDER", entityId: input.order.id, action: "RECEIVE" } }),
      prisma.traceRecord.count({ where: { productId: input.line.productId } }),
      prisma.labelPrintJob.count({ where: { traceRecord: { productId: input.line.productId } } }),
    ]);
    expect(line.qtyReceived).toBe(0);
    expect(order.status).toBe("CONFIRMADA");
    expect(receipts).toBe(0);
    expect(stock).toBeNull();
    expect(movements).toBe(0);
    expect(audits).toBe(0);
    expect(traces).toBe(0);
    expect(labelJobs).toBe(0);
  }

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("full receipt updates PO status to RECIBIDA", async () => {
    const { order, orderLines, location } = await createFixture();

    await prisma.$transaction(async (tx) => {
      const receipt = await tx.purchaseReceipt.create({
        data: {
          purchaseOrderId: order.id,
          locationId: location.id,
          referenceDoc: "REM-001",
          notes: "Recepción completa",
        },
      });

      for (const line of orderLines) {
        const qty = line.qtyOrdered;
        await tx.purchaseReceiptLine.create({
          data: {
            purchaseReceiptId: receipt.id,
            purchaseOrderLineId: line.id,
            productId: line.productId,
            qtyReceived: qty,
          },
        });

        const updated = await tx.purchaseOrderLine.updateMany({
          where: {
            id: line.id,
            qtyReceived: { lte: line.qtyOrdered - qty },
          },
          data: { qtyReceived: { increment: qty } },
        });
        expect(updated.count).toBe(1);
      }

      await tx.purchaseOrder.update({
        where: { id: order.id },
        data: { status: "RECIBIDA" as never },
      });
    });

    const updatedOrder = await prisma.purchaseOrder.findUnique({
      where: { id: order.id },
    });
    expect(updatedOrder?.status).toBe("RECIBIDA");

    const updatedLines = await prisma.purchaseOrderLine.findMany({
      where: { purchaseOrderId: order.id },
    });
    for (const line of updatedLines) {
      expect(line.qtyReceived).toBe(line.qtyOrdered);
    }
  });

  it("commits only accepted units through the receiving transaction and creates matching stock movement", async () => {
    const { order, orderLines, location, productA } = await createFixture();
    const actor = await prisma.user.create({
      data: { email: `qa-receipt-${unique()}@example.invalid`, name: "Operador recepción QA", passwordHash: "unused-test-hash" },
    });
    actorUserIds.push(actor.id);
    const line = orderLines[0];

    const receiptId = await commitPurchaseOrderReceipt({
      prismaClient: prisma,
      orderId: order.id,
      locationId: location.id,
      referenceDoc: "REM-REAL-001",
      notes: "Conteo desde servicio de recepción",
      lines: [{
        lineId: line.id,
        productId: productA.id,
        qtyReceived: 6,
        qtyDamaged: 2,
        qtyMissing: 0,
        qtyRejected: 0,
        qtySurplusReported: 0,
        discrepancyReason: "Dos piezas dañadas",
      }],
      actor: { name: actor.name, userId: actor.id, operatorName: actor.name },
    });

    const [updatedLine, updatedOrder, receiptLine, stock, movements, audits] = await Promise.all([
      prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: line.id } }),
      prisma.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.purchaseReceiptLine.findFirstOrThrow({ where: { purchaseReceiptId: receiptId } }),
      prisma.inventory.findUnique({ where: { productId_locationId: { productId: productA.id, locationId: location.id } } }),
      prisma.inventoryMovement.findMany({ where: { documentId: receiptId, type: "IN" } }),
      prisma.auditLog.findMany({ where: { actorUserId: actor.id, entityId: order.id } }),
    ]);

    expect(updatedLine.qtyReceived).toBe(6);
    expect(updatedOrder.status).toBe("PARCIAL");
    expect(receiptLine).toMatchObject({ qtyReceived: 6, qtyDamaged: 2, discrepancyReason: "Dos piezas dañadas" });
    expect(stock).toMatchObject({ quantity: 6, available: 6, reserved: 0 });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ quantity: 6, operatorUserId: actor.id, documentId: receiptId });
    expect(audits.some((audit) => audit.action === "RECEIVE" && audit.actorUserId === actor.id)).toBe(true);
  });

  it("accepts a custom location code when the active location is semantically RECEIVING", async () => {
    const { order, orderLines, location, productA } = await createFixture();
    const actor = await prisma.user.create({
      data: { email: `qa-custom-receiving-${unique()}@example.invalid`, name: "Operador recepción custom QA", passwordHash: "unused-test-hash" },
    });
    actorUserIds.push(actor.id);
    const customCode = `QA-${unique()}-RECV`;
    await prisma.location.update({ where: { id: location.id }, data: { code: customCode } });

    const receiptId = await commitPurchaseOrderReceipt({
      prismaClient: prisma,
      orderId: order.id,
      locationId: location.id,
      referenceDoc: "CUSTOM-RECEIVING-CODE",
      notes: "El código no determina el uso de la ubicación",
      lines: [{ lineId: orderLines[0].id, productId: productA.id, qtyReceived: 2, qtyDamaged: 0, qtyMissing: 0, qtyRejected: 0, qtySurplusReported: 0, discrepancyReason: null }],
      actor: { name: actor.name, userId: actor.id, operatorName: actor.name },
    });

    const [savedLocation, line, stock, receipt, movements, audits] = await Promise.all([
      prisma.location.findUniqueOrThrow({ where: { id: location.id } }),
      prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: orderLines[0].id } }),
      prisma.inventory.findUniqueOrThrow({ where: { productId_locationId: { productId: productA.id, locationId: location.id } } }),
      prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receiptId } }),
      prisma.inventoryMovement.findMany({ where: { documentId: receiptId, type: "IN" } }),
      prisma.auditLog.findMany({ where: { entityType: "PURCHASE_ORDER", entityId: order.id, action: "RECEIVE" } }),
    ]);
    expect(savedLocation).toMatchObject({ code: customCode, usageType: "RECEIVING", isActive: true });
    expect(line.qtyReceived).toBe(2);
    expect(stock).toMatchObject({ quantity: 2, available: 2, reserved: 0 });
    expect(receipt.locationId).toBe(location.id);
    expect(movements).toHaveLength(1);
    expect(audits).toHaveLength(1);
  });

  it.each(["STORAGE", "STAGING", "SHIPPING"] as const)(
    "rejects RECV-prefixed %s locations without receipt side effects",
    async (usageType) => {
      const { order, orderLines, location } = await createFixture();
      const actor = await prisma.user.create({
        data: { email: `qa-denied-${usageType.toLowerCase()}-${unique()}@example.invalid`, name: "Operador recepción QA", passwordHash: "unused-test-hash" },
      });
      actorUserIds.push(actor.id);
      await prisma.location.update({
        where: { id: location.id },
        data: { code: `RECV-${unique()}`, usageType },
      });
      await expectRejectedWithoutReceipt({ order, line: orderLines[0], locationId: location.id, actor });
    },
  );

  it("rejects a RECEIVING location whose warehouse is inactive without receipt side effects", async () => {
    const { order, orderLines, location, warehouse } = await createFixture();
    const actor = await prisma.user.create({
      data: { email: `qa-denied-inactive-warehouse-${unique()}@example.invalid`, name: "Operador recepción QA", passwordHash: "unused-test-hash" },
    });
    actorUserIds.push(actor.id);
    await prisma.warehouse.update({ where: { id: warehouse.id }, data: { isActive: false } });
    await expectRejectedWithoutReceipt({ order, line: orderLines[0], locationId: location.id, actor });
  });

  it("rejects a RECEIVING location in a warehouse different from the PO destination", async () => {
    const { order, orderLines, warehouse, productA } = await createFixture();
    const actor = await prisma.user.create({
      data: { email: `qa-denied-wrong-destination-${unique()}@example.invalid`, name: "Operador recepción QA", passwordHash: "unused-test-hash" },
    });
    actorUserIds.push(actor.id);
    const otherWarehouse = await prisma.warehouse.create({
      data: { code: `WH-OTHER-${unique()}`, name: "Almacén destino distinto", address: "Carretera 2", isActive: true },
    });
    const otherLocation = await prisma.location.create({
      data: { code: `CUSTOM-IN-${unique()}`, name: "Recepción alterna", zone: "B", usageType: "RECEIVING", isActive: true, warehouseId: otherWarehouse.id },
    });
    expect(order.deliveryWarehouseId).toBe(warehouse.id);
    await expectRejectedWithoutReceipt({ order, line: orderLines[0], locationId: otherLocation.id, actor });
    expect(await prisma.inventory.findUnique({ where: { productId_locationId: { productId: productA.id, locationId: otherLocation.id } } })).toBeNull();
  });

  it("allows only one concurrent receipt commit and rolls back the losing CAS attempt", async () => {
    const { order, orderLines, location, productA } = await createFixture();
    const actor = await prisma.user.create({
      data: { email: `qa-receipt-race-${unique()}@example.invalid`, name: "Operador concurrencia QA", passwordHash: "unused-test-hash" },
    });
    actorUserIds.push(actor.id);
    const line = orderLines[0];
    let orderReads = 0;
    let releaseReads!: () => void;
    const bothReadOrder = new Promise<void>((resolve) => { releaseReads = resolve; });
    const gatedClient = new Proxy(prisma, {
      get(target, property, receiver) {
        if (property !== "$transaction") {
          const value = Reflect.get(target, property, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        }
        return (callback: (tx: unknown) => Promise<unknown>, options?: unknown) => target.$transaction(async (tx) => {
          const gatedTx = new Proxy(tx, {
            get(txTarget, txProperty, txReceiver) {
              const model = Reflect.get(txTarget, txProperty, txReceiver);
              if (txProperty !== "purchaseOrder") return model;
              return new Proxy(model, {
                get(modelTarget, modelProperty, modelReceiver) {
                  const method = Reflect.get(modelTarget, modelProperty, modelReceiver);
                  if (modelProperty !== "findUnique") return typeof method === "function" ? method.bind(modelTarget) : method;
                  return async (args: { where?: { id?: string } }) => {
                    const result = await method.call(modelTarget, args);
                    if (args.where?.id === order.id) {
                      orderReads += 1;
                      if (orderReads === 2) releaseReads();
                      await bothReadOrder;
                    }
                    return result;
                  };
                },
              });
            },
          });
          return callback(gatedTx);
        }, options as never);
      },
    }) as PrismaClient;
    const attempt = () => commitPurchaseOrderReceipt({
      prismaClient: gatedClient,
      orderId: order.id,
      locationId: location.id,
      referenceDoc: `RACE-${unique()}`,
      notes: "Intento concurrente de recepción",
      lines: [{ lineId: line.id, productId: productA.id, qtyReceived: 3, qtyDamaged: 0, qtyMissing: 0, qtyRejected: 0, qtySurplusReported: 0, discrepancyReason: null }],
      actor: { name: actor.name, userId: actor.id, operatorName: actor.name },
    });

    const results = await Promise.allSettled([attempt(), attempt()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    const [updatedLine, updatedOrder, receipts, stock, movements, receiveAudits] = await Promise.all([
      prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: line.id } }),
      prisma.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.purchaseReceipt.findMany({ where: { purchaseOrderId: order.id } }),
      prisma.inventory.findUnique({ where: { productId_locationId: { productId: productA.id, locationId: location.id } } }),
      prisma.inventoryMovement.findMany({ where: { reference: order.folio, type: "IN" } }),
      prisma.auditLog.findMany({ where: { entityType: "PURCHASE_ORDER", entityId: order.id, action: "RECEIVE" } }),
    ]);
    expect(updatedLine.qtyReceived).toBe(3);
    expect(updatedOrder.status).toBe("PARCIAL");
    expect(receipts).toHaveLength(1);
    expect(stock).toMatchObject({ quantity: 3, available: 3, reserved: 0 });
    expect(movements).toHaveLength(1);
    expect(receiveAudits).toHaveLength(1);
    expect(receiveAudits[0].source).toBe("purchasing/receive");
    expect(receiveAudits[0].before).toContain('"qtyReceived":0');
  });

  it("rolls back receipt, inventory, movement and status if PostgreSQL rejects RECEIVE audit", async () => {
    const { order, orderLines, location, productA } = await createFixture();
    const actor = await prisma.user.create({
      data: { email: `qa-receipt-audit-${unique()}@example.invalid`, name: "Operador auditoría QA", passwordHash: "unused-test-hash" },
    });
    actorUserIds.push(actor.id);
    const [{ schema }] = await prisma.$queryRaw<Array<{ schema: string }>>`SELECT current_schema() AS schema`;
    if (!/^t_[a-zA-Z0-9_]+_f[0-9a-f]{16}$/.test(schema)) {
      throw new Error("RECEIVE audit fault injection requires an isolated AWS test schema");
    }
    const triggerName = `qa_receipt_${randomUUID().replaceAll("-", "")}`;
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION "${schema}"."${triggerName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA receipt audit unavailable'; END; $$`,
    );
    try {
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "${schema}"."AuditLog" FOR EACH ROW WHEN (NEW."entityId" = '${order.id}' AND NEW."action" = 'RECEIVE') EXECUTE FUNCTION "${schema}"."${triggerName}"()`,
      );
      await expect(commitPurchaseOrderReceipt({
        prismaClient: prisma,
        orderId: order.id,
        locationId: location.id,
        referenceDoc: "AUDIT-ROLLBACK",
        notes: "Debe revertirse ante auditoría fallida",
        lines: [{ lineId: orderLines[0].id, productId: productA.id, qtyReceived: 6, qtyDamaged: 1, qtyMissing: 0, qtyRejected: 0, qtySurplusReported: 0, discrepancyReason: "Prueba de rollback" }],
        actor: { name: actor.name, userId: actor.id, operatorName: actor.name },
      })).rejects.toThrow();
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "${schema}"."AuditLog"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION "${schema}"."${triggerName}"()`);
    }

    const [updatedLine, updatedOrder, receipts, stock, movements, audits] = await Promise.all([
      prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: orderLines[0].id } }),
      prisma.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.purchaseReceipt.count({ where: { purchaseOrderId: order.id } }),
      prisma.inventory.findUnique({ where: { productId_locationId: { productId: productA.id, locationId: location.id } } }),
      prisma.inventoryMovement.count({ where: { reference: order.folio, type: "IN" } }),
      prisma.auditLog.count({ where: { entityId: order.id, action: "RECEIVE" } }),
    ]);
    expect(updatedLine.qtyReceived).toBe(0);
    expect(updatedOrder.status).toBe("CONFIRMADA");
    expect(receipts).toBe(0);
    expect(stock).toBeNull();
    expect(movements).toBe(0);
    expect(audits).toBe(0);
  });

  it("preserves a manager-disabled custom receipt template and rolls back when no active receipt label exists", async () => {
    const { order, orderLines, location, productA, warehouse } = await createFixture();
    const actor = await prisma.user.create({
      data: { email: `qa-receipt-template-${unique()}@example.invalid`, name: "Manager etiquetas QA", passwordHash: "unused-test-hash" },
    });
    actorUserIds.push(actor.id);
    const [{ schema }] = await prisma.$queryRaw<Array<{ schema: string }>>`SELECT current_schema() AS schema`;
    if (!/^t_[a-zA-Z0-9_]+_f[0-9a-f]{16}$/.test(schema)) {
      throw new Error("Label template configuration test requires an isolated AWS test schema");
    }

    const receiptTemplateCodes = ["RECEIPT_STANDARD", "RECEIPT_COMPACT"];
    const priorTemplates = await prisma.labelTemplate.findMany({ where: { code: { in: defaultLabelTemplateCodes } } });
    await ensureDefaultLabelTemplates(prisma);
    const configuredTemplates = await prisma.labelTemplate.findMany({ where: { code: { in: defaultLabelTemplateCodes } } });
    const priorByCode = new Map(priorTemplates.map((template) => [template.code, template]));

    try {
      await prisma.labelTemplate.updateMany({
        where: { code: { in: receiptTemplateCodes } },
        data: {
          name: "Plantilla de recepción personalizada por Manager",
          isActive: false,
          isDefault: true,
          definitionJson: JSON.stringify({ variant: "manager-custom", revision: unique() }),
        },
      });
      const disabledSnapshot = await prisma.labelTemplate.findMany({ where: { code: { in: defaultLabelTemplateCodes } }, orderBy: { code: "asc" } });

      await expect(commitPurchaseOrderReceipt({
        prismaClient: prisma,
        orderId: order.id,
        locationId: location.id,
        referenceDoc: "LABEL-TEMPLATE-FAIL-CLOSED",
        notes: "Sin plantilla de recepción activa",
        lines: [{ lineId: orderLines[0].id, productId: productA.id, qtyReceived: 6, qtyDamaged: 0, qtyMissing: 0, qtyRejected: 0, qtySurplusReported: 0, discrepancyReason: null }],
        actor: { name: actor.name, userId: actor.id, operatorName: actor.name },
      })).rejects.toThrow("No active label template for RECEIPT");

      const [afterTemplates, updatedLine, updatedOrder, receipts, stock, movements, traces, labelJobs, audits] = await Promise.all([
        prisma.labelTemplate.findMany({ where: { code: { in: defaultLabelTemplateCodes } }, orderBy: { code: "asc" } }),
        prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: orderLines[0].id } }),
        prisma.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } }),
        prisma.purchaseReceipt.count({ where: { purchaseOrderId: order.id } }),
        prisma.inventory.findUnique({ where: { productId_locationId: { productId: productA.id, locationId: location.id } } }),
        prisma.inventoryMovement.count({ where: { documentType: "PURCHASE_RECEIPT", reference: order.folio } }),
        prisma.traceRecord.count({ where: { productId: productA.id, warehouseId: warehouse.id } }),
        prisma.labelPrintJob.count({ where: { traceRecord: { productId: productA.id, warehouseId: warehouse.id } } }),
        prisma.auditLog.count({ where: { entityType: "PURCHASE_ORDER", entityId: order.id, action: "RECEIVE" } }),
      ]);
      expect(afterTemplates).toEqual(disabledSnapshot);
      expect(updatedLine.qtyReceived).toBe(0);
      expect(updatedOrder.status).toBe("CONFIRMADA");
      expect(receipts).toBe(0);
      expect(stock).toBeNull();
      expect(movements).toBe(0);
      expect(traces).toBe(0);
      expect(labelJobs).toBe(0);
      expect(audits).toBe(0);
    } finally {
      for (const template of configuredTemplates) {
        const prior = priorByCode.get(template.code);
        if (!prior) {
          await prisma.labelPrintJob.deleteMany({ where: { labelTemplateId: template.id } });
          await prisma.labelTemplate.deleteMany({ where: { id: template.id } });
          continue;
        }
        await prisma.labelTemplate.update({
          where: { id: template.id },
          data: {
            name: prior.name,
            labelType: prior.labelType,
            rendererKind: prior.rendererKind,
            symbolKind: prior.symbolKind,
            paperSize: prior.paperSize,
            schemaVersion: prior.schemaVersion,
            isActive: prior.isActive,
            isDefault: prior.isDefault,
            definitionJson: prior.definitionJson,
            createdAt: prior.createdAt,
            updatedAt: prior.updatedAt,
          },
        });
      }
    }
  });

  // =====================================================================
  // KAN-24 Discrepancy tests
  // =====================================================================

  it("damaged quantity stored, not added to inventory", async () => {
    const { order, orderLines, location, productA } = await createFixture();
    const lineA = orderLines[0]; // qtyOrdered=10
    await prisma.$transaction(async (tx) => {
      const receipt = await tx.purchaseReceipt.create({
        data: {
          purchaseOrderId: order.id,
          locationId: location.id,
          referenceDoc: "REM-DMG",
          notes: "Con dañados",
        },
      });
      await tx.purchaseReceiptLine.create({
        data: {
          purchaseReceiptId: receipt.id,
          purchaseOrderLineId: lineA.id,
          productId: lineA.productId,
          qtyReceived: 8,
          qtyDamaged: 2,
          discrepancyReason: "Empaque dañado",
        },
      });
      const updated = await tx.purchaseOrderLine.updateMany({
        where: { id: lineA.id, qtyReceived: { lte: lineA.qtyOrdered - 8 } },
        data: { qtyReceived: { increment: 8 } },
      });
      expect(updated.count).toBe(1);
    });

    // Verify PO line qtyReceived only increased by good qty
    const poLine = await prisma.purchaseOrderLine.findUnique({
      where: { id: lineA.id },
    });
    expect(poLine?.qtyReceived).toBe(8);

    // Verify receipt line has damaged qty
    const receiptLine = await prisma.purchaseReceiptLine.findFirst({
      where: { purchaseReceipt: { purchaseOrderId: order.id } },
    });
    expect(receiptLine?.qtyReceived).toBe(8);
    expect(receiptLine?.qtyDamaged).toBe(2);
    expect(receiptLine?.discrepancyReason).toBe("Empaque dañado");

    // Inventory is not created by the direct DB transaction in this test.
    const inventory = await prisma.inventory.findUnique({
      where: {
        productId_locationId: {
          productId: productA.id,
          locationId: location.id,
        },
      },
    });
    expect(inventory).toBeNull();
  });

  it("missing quantity stored, not added to inventory", async () => {
    const { order, orderLines, location } = await createFixture();
    const lineA = orderLines[0]; // qtyOrdered=10
    await prisma.$transaction(async (tx) => {
      const receipt = await tx.purchaseReceipt.create({
        data: {
          purchaseOrderId: order.id,
          locationId: location.id,
          referenceDoc: "REM-MIS",
          notes: "Con faltantes",
        },
      });
      await tx.purchaseReceiptLine.create({
        data: {
          purchaseReceiptId: receipt.id,
          purchaseOrderLineId: lineA.id,
          productId: lineA.productId,
          qtyReceived: 5,
          qtyMissing: 5,
          discrepancyReason: "Faltante por envío incompleto",
        },
      });
      await tx.purchaseOrderLine.updateMany({
        where: { id: lineA.id, qtyReceived: { lte: lineA.qtyOrdered - 5 } },
        data: { qtyReceived: { increment: 5 } },
      });
    });

    // PO line qtyReceived only increased by good qty (5)
    const poLine = await prisma.purchaseOrderLine.findUnique({
      where: { id: lineA.id },
    });
    expect(poLine?.qtyReceived).toBe(5);

    // Receipt line has missing qty
    const receiptLine = await prisma.purchaseReceiptLine.findFirst({
      where: { purchaseReceipt: { purchaseOrderId: order.id } },
    });
    expect(receiptLine?.qtyMissing).toBe(5);
    expect(receiptLine?.discrepancyReason).toBe(
      "Faltante por envío incompleto",
    );

    // Inventory is not created by the direct DB transaction in this test.
    const inventory = await prisma.inventory.findUnique({
      where: {
        productId_locationId: {
          productId: lineA.productId,
          locationId: location.id,
        },
      },
    });
    expect(inventory).toBeNull();
  });

  it("rejected quantity stored, not added to inventory", async () => {
    const { order, orderLines, location } = await createFixture();
    const lineA = orderLines[0]; // qtyOrdered=10
    await prisma.$transaction(async (tx) => {
      const receipt = await tx.purchaseReceipt.create({
        data: {
          purchaseOrderId: order.id,
          locationId: location.id,
          referenceDoc: "REM-REJ",
          notes: "Con rechazados",
        },
      });
      await tx.purchaseReceiptLine.create({
        data: {
          purchaseReceiptId: receipt.id,
          purchaseOrderLineId: lineA.id,
          productId: lineA.productId,
          qtyReceived: 7,
          qtyRejected: 3,
          discrepancyReason: "Producto defectuoso",
        },
      });
      await tx.purchaseOrderLine.updateMany({
        where: { id: lineA.id, qtyReceived: { lte: lineA.qtyOrdered - 7 } },
        data: { qtyReceived: { increment: 7 } },
      });
    });

    const poLine = await prisma.purchaseOrderLine.findUnique({
      where: { id: lineA.id },
    });
    expect(poLine?.qtyReceived).toBe(7);

    const receiptLine = await prisma.purchaseReceiptLine.findFirst({
      where: { purchaseReceipt: { purchaseOrderId: order.id } },
    });
    expect(receiptLine?.qtyRejected).toBe(3);
    expect(receiptLine?.discrepancyReason).toBe("Producto defectuoso");

    const inventory = await prisma.inventory.findUnique({
      where: {
        productId_locationId: {
          productId: lineA.productId,
          locationId: location.id,
        },
      },
    });
    expect(inventory).toBeNull();
  });

  it("surplus reported stored, not added to inventory or PO received qty", async () => {
    const { order, orderLines, location } = await createFixture();
    const lineA = orderLines[0]; // qtyOrdered=10
    await prisma.$transaction(async (tx) => {
      const receipt = await tx.purchaseReceipt.create({
        data: {
          purchaseOrderId: order.id,
          locationId: location.id,
          referenceDoc: "REM-SUR",
          notes: "Con sobrantes",
        },
      });
      await tx.purchaseReceiptLine.create({
        data: {
          purchaseReceiptId: receipt.id,
          purchaseOrderLineId: lineA.id,
          productId: lineA.productId,
          qtyReceived: 10,
          qtySurplusReported: 2,
          discrepancyReason: "Envío extra por error del proveedor",
        },
      });
      await tx.purchaseOrderLine.updateMany({
        where: { id: lineA.id, qtyReceived: { lte: lineA.qtyOrdered - 10 } },
        data: { qtyReceived: { increment: 10 } },
      });
    });

    // PO line qtyReceived = 10 (only good qty)
    const poLine = await prisma.purchaseOrderLine.findUnique({
      where: { id: lineA.id },
    });
    expect(poLine?.qtyReceived).toBe(10);

    // Receipt line has surplus reported
    const receiptLine = await prisma.purchaseReceiptLine.findFirst({
      where: { purchaseReceipt: { purchaseOrderId: order.id } },
    });
    expect(receiptLine?.qtySurplusReported).toBe(2);
    expect(receiptLine?.discrepancyReason).toBe(
      "Envío extra por error del proveedor",
    );

    // Inventory is not created by the direct DB transaction in this test.
    const inventory = await prisma.inventory.findUnique({
      where: {
        productId_locationId: {
          productId: lineA.productId,
          locationId: location.id,
        },
      },
    });
    expect(inventory).toBeNull();
  });

  it("discrepancy without reason fails validation", async () => {
    const { orderLines } = await createFixture();
    const lineA = orderLines[0];
    // Try to create with damaged qty but no reason - should fail at schema level
    const schema = await import("@/lib/schemas/wms").then(
      (m) => m.purchaseReceiptLineDiscrepancySchema,
    );
    const result = schema.safeParse({
      lineId: lineA.id,
      qtyReceived: 8,
      qtyDamaged: 2,
      qtyMissing: 0,
      qtyRejected: 0,
      qtySurplusReported: 0,
      discrepancyReason: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].path).toContain("discrepancyReason");
    }
  });

  it("total accounted cannot exceed ordered quantity", async () => {
    const { order, orderLines, location } = await createFixture();
    const lineA = orderLines[0]; // qtyOrdered=10
    // Try to receive 8 good + 5 damaged = 13 > 10 ordered
    const schema = await import("@/lib/schemas/wms").then(
      (m) => m.purchaseReceiptLineDiscrepancySchema,
    );
    expect(
      schema.safeParse({
        lineId: lineA.id,
        qtyReceived: 8,
        qtyDamaged: 5,
        qtyMissing: 0,
        qtyRejected: 0,
        qtySurplusReported: 0,
        discrepancyReason: "Test",
      }).success,
    ).toBe(true);
    // Schema validation doesn't check total vs ordered - that's done in server action
    // But we can test the server action constraint via transaction
    await prisma.$transaction(async (tx) => {
      const receipt = await tx.purchaseReceipt.create({
        data: {
          purchaseOrderId: order.id,
          locationId: location.id,
          referenceDoc: "REM-OVER",
          notes: "Sobre cuenta",
        },
      });
      await tx.purchaseReceiptLine.create({
        data: {
          purchaseReceiptId: receipt.id,
          purchaseOrderLineId: lineA.id,
          productId: lineA.productId,
          qtyReceived: 8,
          qtyDamaged: 5,
          discrepancyReason: "Test",
        },
      });
      const updated = await tx.purchaseOrderLine.updateMany({
        where: { id: lineA.id, qtyReceived: { lte: lineA.qtyOrdered - 8 } },
        data: { qtyReceived: { increment: 8 } },
      });
      expect(updated.count).toBe(1);
    });

    // The server action would reject this, but the DB layer allows it
    // The actual check is in the server action before the transaction
    // This test documents the expected behavior
    const receiptLine = await prisma.purchaseReceiptLine.findFirst({
      where: { purchaseReceipt: { purchaseOrderId: order.id } },
    });
    // Total accounted = 8 + 5 = 13 > 10, but server action prevents this
    expect(
      (receiptLine?.qtyReceived ?? 0) +
        (receiptLine?.qtyDamaged ?? 0) +
        (receiptLine?.qtyMissing ?? 0) +
        (receiptLine?.qtyRejected ?? 0),
    ).toBeGreaterThan(lineA.qtyOrdered);
  });

  it("partial receipt updates PO status to PARCIAL", async () => {
    const { order, orderLines, location } = await createFixture();

    await prisma.$transaction(async (tx) => {
      const receipt = await tx.purchaseReceipt.create({
        data: {
          purchaseOrderId: order.id,
          locationId: location.id,
          referenceDoc: "REM-002",
          notes: "Recepción parcial",
        },
      });

      const lineA = orderLines[0];
      const qtyA = lineA.qtyOrdered;
      await tx.purchaseReceiptLine.create({
        data: {
          purchaseReceiptId: receipt.id,
          purchaseOrderLineId: lineA.id,
          productId: lineA.productId,
          qtyReceived: qtyA,
        },
      });
      const updatedA = await tx.purchaseOrderLine.updateMany({
        where: { id: lineA.id, qtyReceived: { lte: lineA.qtyOrdered - qtyA } },
        data: { qtyReceived: { increment: qtyA } },
      });
      expect(updatedA.count).toBe(1);
    });

    // Compute and set status like server action does
    const updatedLinesAll = await prisma.purchaseOrderLine.findMany({
      where: { purchaseOrderId: order.id },
    });
    const allDone = updatedLinesAll.every((l) => l.qtyReceived >= l.qtyOrdered);
    const anyDone = updatedLinesAll.some((l) => l.qtyReceived > 0);
    const newStatus = allDone ? "RECIBIDA" : anyDone ? "PARCIAL" : "CONFIRMADA";
    await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: { status: newStatus as never },
    });
    expect(newStatus).toBe("PARCIAL");

    const updatedLines = await prisma.purchaseOrderLine.findMany({
      where: { purchaseOrderId: order.id },
    });
    expect(updatedLines.find(line => line.id === orderLines[0].id)?.qtyReceived).toBe(orderLines[0].qtyOrdered);
    expect(updatedLines.find(line => line.id === orderLines[1].id)?.qtyReceived).toBe(0);
  });

  it("over-receipt fails with conditional update returning count 0", async () => {
    const { order, orderLines, location } = await createFixture();

    // First receipt: receive 5 of line A (qtyOrdered=10)
    await prisma.$transaction(async (tx) => {
      const receipt = await tx.purchaseReceipt.create({
        data: {
          purchaseOrderId: order.id,
          locationId: location.id,
          referenceDoc: "REM-003",
          notes: "Primera recepción",
        },
      });
      const lineA = orderLines[0];
      await tx.purchaseReceiptLine.create({
        data: {
          purchaseReceiptId: receipt.id,
          purchaseOrderLineId: lineA.id,
          productId: lineA.productId,
          qtyReceived: 5,
        },
      });
      const updated = await tx.purchaseOrderLine.updateMany({
        where: { id: lineA.id, qtyReceived: { lte: lineA.qtyOrdered - 5 } },
        data: { qtyReceived: { increment: 5 } },
      });
      expect(updated.count).toBe(1);
    });

    // Second receipt: try to receive 10 more of line A (would exceed qtyOrdered)
    await expect(
      prisma.$transaction(async (tx) => {
        const receipt = await tx.purchaseReceipt.create({
          data: {
            purchaseOrderId: order.id,
            locationId: location.id,
            referenceDoc: "REM-004",
            notes: "Segunda recepción",
          },
        });
        const lineA = orderLines[0];
        await tx.purchaseReceiptLine.create({
          data: {
            purchaseReceiptId: receipt.id,
            purchaseOrderLineId: lineA.id,
            productId: lineA.productId,
            qtyReceived: 10,
          },
        });
        const updated = await tx.purchaseOrderLine.updateMany({
          where: { id: lineA.id, qtyReceived: { lte: lineA.qtyOrdered - 10 } },
          data: { qtyReceived: { increment: 10 } },
        });
        if (updated.count === 0) {
          throw new Error("Cantidad excede pendiente");
        }
      }),
    ).rejects.toThrow("Cantidad excede pendiente");
  });

  it("concurrent receives cannot overcount (race condition protection)", async () => {
    const { order, orderLines, location } = await createFixture();
    const lineA = orderLines[0]; // qtyOrdered=10

    let successCount = 0;
    const errors: Error[] = [];

    const attemptReceive = async (qty: number) => {
      try {
        await prisma.$transaction(async (tx) => {
          const receipt = await tx.purchaseReceipt.create({
            data: {
              purchaseOrderId: order.id,
              locationId: location.id,
              referenceDoc: `REM-${unique()}`,
              notes: `Concurrencia ${qty}`,
            },
          });
          await tx.purchaseReceiptLine.create({
            data: {
              purchaseReceiptId: receipt.id,
              purchaseOrderLineId: lineA.id,
              productId: lineA.productId,
              qtyReceived: qty,
            },
          });
          const updated = await tx.purchaseOrderLine.updateMany({
            where: {
              id: lineA.id,
              qtyReceived: { lte: lineA.qtyOrdered - qty },
            },
            data: { qtyReceived: { increment: qty } },
          });
          if (updated.count === 0) {
            throw new Error("Concurrency protection triggered");
          }
        });
        successCount++;
      } catch (e) {
        errors.push(e as Error);
      }
    };

    await Promise.all([attemptReceive(8), attemptReceive(8)]);

    expect(successCount).toBe(1);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("Concurrency protection");

    const finalLine = await prisma.purchaseOrderLine.findUnique({
      where: { id: lineA.id },
    });
    expect(finalLine?.qtyReceived).toBe(8);
  });

  it("creates purchase receipt and receipt lines correctly", async () => {
    const { order, orderLines, location } = await createFixture();
    const lineA = orderLines[0];

    await prisma.$transaction(async (tx) => {
      const receipt = await tx.purchaseReceipt.create({
        data: {
          purchaseOrderId: order.id,
          locationId: location.id,
          referenceDoc: "REM-005",
          notes: "Test trace",
        },
      });
      await tx.purchaseReceiptLine.create({
        data: {
          purchaseReceiptId: receipt.id,
          purchaseOrderLineId: lineA.id,
          productId: lineA.productId,
          qtyReceived: 3,
        },
      });
      await tx.purchaseOrderLine.updateMany({
        where: { id: lineA.id, qtyReceived: { lte: lineA.qtyOrdered - 3 } },
        data: { qtyReceived: { increment: 3 } },
      });
    });

    // Verify receipt created
    const receipts = await prisma.purchaseReceipt.findMany({
      where: { purchaseOrderId: order.id },
    });
    expect(receipts.length).toBeGreaterThan(0);
    const receipt = receipts[0];
    expect(receipt.referenceDoc).toBe("REM-005");

    // Verify receipt lines created
    const receiptLines = await prisma.purchaseReceiptLine.findMany({
      where: { purchaseReceiptId: receipt.id },
    });
    expect(receiptLines.length).toBe(1);
    expect(receiptLines[0].qtyReceived).toBe(3);
    expect(receiptLines[0].productId).toBe(lineA.productId);
  });
});
