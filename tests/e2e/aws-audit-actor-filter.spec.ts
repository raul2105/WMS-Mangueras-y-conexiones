import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { createAuditLogRequiredWithDb } from "@/lib/audit-log";
import { expectForbidden, loginAs, USERS } from "./lib/auth.helpers";

const prisma = new PrismaClient();
const enabled = process.env.WMS_AWS_WRITE_E2E === "1";
if (enabled) {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (database.hostname !== "wms-web-dev-pg.cvb2fezndc4e.us-east-1.rds.amazonaws.com"
    || database.pathname !== "/wms" || ![null, "public"].includes(database.searchParams.get("schema"))) {
    throw new Error("Audit browser fixtures require the authorized canonical AWS database");
  }
}
const entityId = randomUUID();
const entityType = `KAN26_AUDIT_${randomUUID().replaceAll("-", "").toUpperCase()}`;
const action = "KAN26_E2E_ACTOR_FILTER";
const source = "e2e/kan26/audit-actor-filter";
const before = { state: "before-state", revision: 4, marker: entityId };
const after = { state: "after-state", revision: 5, marker: entityId };
let managerUserId = "";
let managerName = "";
let auditId = "";
let beforeManifest: Record<string, unknown> = {};
let duringManifest: Record<string, unknown> = {};

async function captureManifest() {
  const [{ schema }] = await prisma.$queryRaw<Array<{ schema: string }>>`SELECT current_schema() AS schema`;
  const [manager, events] = await Promise.all([
    managerUserId
      ? prisma.user.findUnique({ where: { id: managerUserId }, select: { id: true, name: true, isActive: true } })
      : Promise.resolve(null),
    prisma.auditLog.findMany({
      where: { entityId },
      orderBy: { createdAt: "asc" },
      select: { id: true, entityType: true, entityId: true, action: true, before: true, after: true, actor: true, actorUserId: true, source: true },
    }),
  ]);
  return {
    capturedAt: new Date().toISOString(),
    schema,
    uniqueEntityId: entityId,
    expectedActor: { userId: managerUserId || null, name: managerName || null },
    managerStillPresent: Boolean(manager),
    records: events.map((event) => ({
      ...event,
      before: event.before ? JSON.parse(event.before) : null,
      after: event.after ? JSON.parse(event.after) : null,
    })),
  };
}

async function writeManifest() {
  const directory = process.env.WMS_AWS_EVIDENCE_DIR ?? path.join("output", `kan26-audit-actor-${entityId}`);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "audit-actor-fixture-manifest.json"), JSON.stringify({ before: beforeManifest, during: duringManifest, after: await captureManifest() }, null, 2), "utf8");
}

test.describe.serial("AWS KAN-26 audit actor search", () => {
  test.skip(!enabled, "Enable the authorized AWS write lane for this UUID audit fixture");
  test.beforeAll(async () => {
    const [{ schema }] = await prisma.$queryRaw<Array<{ schema: string }>>`SELECT current_schema() AS schema`;
    const manager = await prisma.user.findUniqueOrThrow({
      where: { email: USERS.MANAGER.email },
      select: { id: true, name: true, isActive: true, userRoles: { select: { role: { select: { code: true, isActive: true } } } } },
    });
    if (!manager.isActive || !manager.userRoles.some(({ role }) => role.code === "MANAGER" && role.isActive)) {
      throw new Error("Configured Manager account is not active or lacks MANAGER role");
    }
    managerUserId = manager.id;
    managerName = manager.name ?? "";
    if (!managerName) throw new Error("Configured Manager account has no name to verify actor-name search");

    const existing = await prisma.auditLog.findMany({ where: { entityId }, select: { id: true } });
    if (existing.length) throw new Error(`UUID audit fixture collision before write: ${entityId}`);
    beforeManifest = {
      schema,
      uniqueEntityId: entityId,
      actor: { userId: managerUserId, name: managerName },
      records: existing,
    };

    await createAuditLogRequiredWithDb({
      entityType,
      entityId,
      action,
      before,
      after,
      actor: managerName,
      actorUserId: managerUserId,
      source,
    }, prisma);
    const created = await prisma.auditLog.findFirstOrThrow({ where: { entityId, actorUserId: managerUserId, action } });
    auditId = created.id;
    const during = await captureManifest();
    duringManifest = during;
    expect(during.records).toHaveLength(1);
    expect(during.records[0]).toMatchObject({ id: auditId, actorUserId: managerUserId, actor: managerName, source, before, after });
  });

  test.afterAll(async () => {
    try {
      duringManifest = await captureManifest();
      await prisma.auditLog.deleteMany({ where: { id: auditId || "00000000-0000-0000-0000-000000000000", entityId } });
      const after = await captureManifest();
      expect(after.records).toEqual([]);
      await writeManifest();
    } finally {
      await prisma.$disconnect();
    }
  });

  test("Manager encuentra el mismo evento filtrando por nombre de actor y ve origen/snapshots", async ({ page }) => {
    await loginAs(page, "MANAGER", "/audit", "/audit");
    await page.getByLabel("Actor").fill(managerName);
    await Promise.all([
      page.waitForURL(/\/audit\?.*actor=/),
      page.getByRole("button", { name: "Filtrar" }).click(),
    ]);

    const result = page.getByRole("row").filter({ hasText: entityId });
    await expect(result).toHaveCount(1);
    await expect(result).toContainText(entityType);
    await expect(result).toContainText(managerName);
    await expect(result).toContainText(source);
    await result.getByText("Ver cambios", { exact: true }).click();
    await expect(result).toContainText("Antes");
    await expect(result).toContainText("Después");
    await expect(result).toContainText('"revision": 4');
    await expect(result).toContainText('"revision": 5');
    const stored = await prisma.auditLog.findUniqueOrThrow({ where: { id: auditId } });
    expect(JSON.parse(stored.before ?? "null")).toEqual(before);
    expect(JSON.parse(stored.after ?? "null")).toEqual(after);
  });

  test("Admin encuentra el mismo evento filtrando por correo del actor", async ({ page }) => {
    await loginAs(page, "SYSTEM_ADMIN", "/audit", "/audit");
    await page.getByLabel("Actor").fill(USERS.MANAGER.email);
    await Promise.all([
      page.waitForURL(/\/audit\?.*actor=/),
      page.getByRole("button", { name: "Filtrar" }).click(),
    ]);

    const result = page.getByRole("row").filter({ hasText: entityId });
    await expect(result).toHaveCount(1);
    await expect(result).toContainText(managerName);
    await expect(result).toContainText(source);
    await result.getByText("Ver cambios", { exact: true }).click();
    await expect(result).toContainText('"state": "before-state"');
    await expect(result).toContainText('"state": "after-state"');
  });

  test("Warehouse Operator y Sales no pueden consultar auditoría", async ({ page }) => {
    await loginAs(page, "WAREHOUSE_OPERATOR");
    await expectForbidden(page, "/audit");
    await loginAs(page, "SALES_EXECUTIVE");
    await expectForbidden(page, "/audit");
  });
});
