import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { promoteProductTechnicalSource } from "@/lib/catalog/technical-specs";

const describePostgres = process.env.RUN_POSTGRES_TESTS === "1" ? describe : describe.skip;
let prisma: PrismaClient;

describePostgres("technical source review (PostgreSQL)", () => {
  beforeAll(() => { prisma = new PrismaClient(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("requires an active catalog reviewer and a documented version before atomic publication", async () => {
    const managerRole = await prisma.role.upsert({
      where: { code: "MANAGER" },
      update: { isActive: true, name: "MANAGER" },
      create: { code: "MANAGER", name: "MANAGER", isActive: true },
      select: { id: true },
    });
    const warehouseRole = await prisma.role.upsert({
      where: { code: "WAREHOUSE_OPERATOR" },
      update: { isActive: true, name: "WAREHOUSE_OPERATOR" },
      create: { code: "WAREHOUSE_OPERATOR", name: "WAREHOUSE_OPERATOR", isActive: true },
      select: { id: true },
    });
    const manager = await prisma.user.create({
      data: {
        email: "technical-source-manager@wms-test.invalid",
        name: "Source Reviewer",
        passwordHash: "test-only",
        userRoles: { create: [{ roleId: managerRole.id }] },
      },
      select: { id: true },
    });
    const operator = await prisma.user.create({
      data: {
        email: "technical-source-operator@wms-test.invalid",
        name: "Not A Reviewer",
        passwordHash: "test-only",
        userRoles: { create: [{ roleId: warehouseRole.id }] },
      },
      select: { id: true },
    });
    const product = await prisma.product.create({
      data: { sku: "TECH-SOURCE-REVIEW-HOSE", name: "Reviewable hose", type: "HOSE", attributes: "{}" },
      select: { id: true },
    });
    const source = await prisma.productTechnicalSource.create({
      data: { supplierName: "Fabricante", documentRef: "FICHA-HOSE-9", status: "PENDING_REVIEW" },
      select: { id: true },
    });
    await prisma.productTechnicalSpecCandidate.create({
      data: {
        productId: product.id,
        sourceId: source.id,
        family: "HOSE",
        key: "working_pressure",
        value: "250",
        normalizedValue: "250",
        unit: "bar",
        isSafetyCritical: true,
      },
    });

    await expect(promoteProductTechnicalSource(prisma, { sourceId: source.id, reviewerUserId: operator.id }))
      .rejects.toThrow("Sólo un usuario activo de catálogo puede aprobar fuentes técnicas");
    await expect(promoteProductTechnicalSource(prisma, { sourceId: source.id, reviewerUserId: manager.id }))
      .rejects.toThrow("La fuente requiere fabricante, documento y versión vigente antes de aprobarse");
    await expect(prisma.productTechnicalSource.findUnique({ where: { id: source.id }, select: { status: true } }))
      .resolves.toMatchObject({ status: "PENDING_REVIEW" });
    await expect(prisma.productTechnicalSpec.findMany({ where: { productId: product.id } })).resolves.toHaveLength(0);

    await prisma.productTechnicalSource.update({ where: { id: source.id }, data: { documentVersion: "Rev. 9" } });
    await promoteProductTechnicalSource(prisma, { sourceId: source.id, reviewerUserId: manager.id });
    const [publishedSource, publishedSpec, audit] = await Promise.all([
      prisma.productTechnicalSource.findUnique({ where: { id: source.id }, select: { status: true, documentVersion: true, reviewedByUserId: true } }),
      prisma.productTechnicalSpec.findUnique({ where: { productId_key: { productId: product.id, key: "working_pressure" } }, select: { value: true, sourceId: true } }),
      prisma.auditLog.findFirst({ where: { entityType: "PRODUCT_TECHNICAL_SOURCE", entityId: source.id, action: "APPROVE" }, select: { actorUserId: true, after: true } }),
    ]);
    expect(publishedSource).toMatchObject({ status: "APPROVED", documentVersion: "Rev. 9", reviewedByUserId: manager.id });
    expect(publishedSpec).toMatchObject({ value: "250", sourceId: source.id });
    expect(audit?.actorUserId).toBe(manager.id);
    expect(JSON.parse(audit?.after ?? "null")).toMatchObject({ status: "APPROVED", sourceId: source.id });
  });
});
