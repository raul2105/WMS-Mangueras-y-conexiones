import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import prisma from "@/lib/prisma";
import { ensurePurchaseOrderDocumentVersion } from "@/lib/purchasing/purchase-order-document-service";
import { sendPurchaseOrderEmail, markStalePurchaseOrderEmailAttemptUnknown } from "@/lib/purchasing/purchase-order-email-service";
import { buildPurchaseOrderPdf } from "@/lib/purchasing/purchase-order-pdf";

// Only PDF rendering and provider I/O are simulated. Claims, documents,
// attempts, audit records and foreign keys use the isolated AWS PostgreSQL schema.
vi.mock("@/lib/purchasing/purchase-order-pdf", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/purchasing/purchase-order-pdf")>(),
  buildPurchaseOrderPdf: vi.fn(),
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function fixture() {
  const token = randomUUID().slice(0, 8);
  const manager = await prisma.user.create({ data: {
    email: `mail-cas-${token}@example.invalid`, name: "Mail CAS Manager", passwordHash: "test-only-unused",
  } });
  const supplier = await prisma.supplier.create({ data: {
    code: `MAIL-CAS-${token}`, name: "Mail CAS supplier", email: "supplier@example.invalid", paymentTerms: "30 días",
  } });
  const warehouse = await prisma.warehouse.create({ data: {
    code: `MAIL-CAS-${token}`, name: "Mail CAS warehouse", address: "QA address",
  } });
  const product = await prisma.product.create({ data: {
    sku: `MAIL-CAS-${token}`, name: "Mail CAS product", type: "ACCESSORY",
  } });
  const order = await prisma.purchaseOrder.create({ data: {
    folio: `OC-CAS-${token}`, supplierId: supplier.id, deliveryWarehouseId: warehouse.id,
    status: "CONFIRMADA", deliveryAddressSnapshot: "QA address", paymentTermsSnapshot: "30 días",
    lines: { create: { productId: product.id, qtyOrdered: 2, unitPrice: 10 } },
  } });
  await ensurePurchaseOrderDocumentVersion({ purchaseOrderId: order.id, prismaClient: prisma });
  return { order, manager };
}

function gateTwoOrderReads(orderId: string) {
  const read = prisma.purchaseOrder.findUnique.bind(prisma.purchaseOrder);
  const bothRead = deferred();
  let arrived = 0;
  const gatedRead = async (args: Parameters<typeof read>[0]) => {
    const row = await read(args);
    if (args.where.id === orderId && args.select?.emailSendState && arrived < 2) {
      arrived += 1;
      if (arrived === 2) bothRead.resolve();
      await bothRead.promise;
    }
    return row;
  };
  const model = new Proxy(prisma.purchaseOrder, { get(target, property) {
    if (property === "findUnique") return gatedRead;
    const value = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return new Proxy(prisma, { get(target, property) {
    if (property === "purchaseOrder") return model;
    const value = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

afterEach(() => { vi.restoreAllMocks(); vi.mocked(buildPurchaseOrderPdf).mockReset(); });
afterAll(async () => { await prisma.$disconnect(); });

describe.skipIf(process.env.RUN_POSTGRES_TESTS !== "1")("purchase order email real PostgreSQL concurrency", () => {
  it("allows only one simultaneous send and persists its sender, official document and provider ID", async () => {
    const { order, manager } = await fixture();
    const gatedDb = gateTwoOrderReads(order.id);
    vi.mocked(buildPurchaseOrderPdf).mockResolvedValue({ pdfArrayBuffer: new ArrayBuffer(20), filename: "qa.pdf" });
    const held = deferred();
    const started = deferred();
    const provider = { providerId: "qa-no-network", send: vi.fn(async () => {
      started.resolve(); await held.promise; return { messageId: "qa-message-one" };
    }) };
    const input = { purchaseOrderId: order.id, triggeredByUserId: manager.id };
    const sends = [sendPurchaseOrderEmail(input, { provider, senderEmail: manager.email, prismaClient: gatedDb }),
      sendPurchaseOrderEmail(input, { provider, senderEmail: manager.email, prismaClient: gatedDb })];
    try {
      await started.promise;
      const firstFinished = await Promise.race(sends);
      expect(firstFinished.errorCode).toBe("SEND_IN_PROGRESS");
    } finally { held.resolve(); }
    const results = await Promise.all(sends);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(provider.send).toHaveBeenCalledTimes(1);
    const attempts = await prisma.purchaseOrderEmailAttempt.findMany({ where: { purchaseOrderId: order.id } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ sendState: "SENT", senderEmail: manager.email,
      provider: "qa-no-network", providerMessageId: "qa-message-one", triggeredByUserId: manager.id });
    expect(attempts[0].purchaseOrderDocumentId).toBeTruthy();
    expect(await prisma.purchaseOrder.findUnique({ where: { id: order.id } })).toMatchObject({
      emailSendState: "SENT", emailSendClaimToken: null,
    });
  });

  it("rejects a stale second request after the first send becomes uncertain and requires explicit resend confirmation", async () => {
    const { order, manager } = await fixture();
    const gatedDb = gateTwoOrderReads(order.id);
    const releaseSecondPdf = deferred();
    let pdfCalls = 0;
    vi.mocked(buildPurchaseOrderPdf).mockImplementation(async () => {
      pdfCalls += 1;
      if (pdfCalls === 2) await releaseSecondPdf.promise;
      return { pdfArrayBuffer: new ArrayBuffer(20), filename: "qa.pdf" };
    });
    const provider = { providerId: "qa-no-network", send: vi.fn(async () => { throw new Error("uncertain network result"); }) };
    const input = { purchaseOrderId: order.id, triggeredByUserId: manager.id };
    const first = sendPurchaseOrderEmail(input, { provider, prismaClient: gatedDb });
    const second = sendPurchaseOrderEmail(input, { provider, prismaClient: gatedDb });
    let result;
    try { result = await Promise.race([first, second]); } finally { releaseSecondPdf.resolve(); }
    expect(result.sendState).toBe("SEND_UNKNOWN");
    expect((await Promise.all([first, second])).filter((item) => item.errorCode === "SEND_IN_PROGRESS")).toHaveLength(1);
    expect((await sendPurchaseOrderEmail(input, { provider })).errorCode).toBe("SEND_RESULT_UNKNOWN");
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(await prisma.purchaseOrderEmailAttempt.count({ where: { purchaseOrderId: order.id } })).toBe(1);
    expect(await prisma.purchaseOrder.findUnique({ where: { id: order.id } })).toMatchObject({ emailSendState: "SEND_UNKNOWN" });
  });

  it("reconciles a crashed stale claim without sending and records the reviewing Manager", async () => {
    const { order, manager } = await fixture();
    await prisma.purchaseOrder.update({ where: { id: order.id }, data: {
      emailSendState: "SENDING", emailSendClaimToken: randomUUID(), emailSendClaimedAt: new Date(Date.now() - 180_000),
    } });
    expect(await markStalePurchaseOrderEmailAttemptUnknown({ purchaseOrderId: order.id, reconciledByUserId: manager.id }))
      .toEqual({ reconciled: true, status: "RECONCILED" });
    expect(await prisma.purchaseOrder.findUnique({ where: { id: order.id } })).toMatchObject({
      emailSendState: "SEND_UNKNOWN", emailSendClaimToken: null,
    });
    expect(await prisma.auditLog.findFirst({ where: { entityId: order.id,
      action: "RECONCILE_PURCHASE_ORDER_EMAIL_UNKNOWN" } })).toMatchObject({ actorUserId: manager.id });
    expect(await prisma.purchaseOrderEmailAttempt.count({ where: { purchaseOrderId: order.id } })).toBe(0);
    expect(buildPurchaseOrderPdf).not.toHaveBeenCalled();
  });
});
