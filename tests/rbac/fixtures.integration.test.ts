import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ensureRbacFixtures, getRolePermissions } from "@/tests/fixtures/rbac-fixtures";

const prisma = new PrismaClient();

const TEST_EMAILS = [
  "test-admin@scmayher.local",
  "test-manager@scmayher.local",
  "test-warehouse@scmayher.local",
  "test-sales@scmayher.local",
];

describe("rbac fixtures seed by role", () => {
  beforeAll(async () => {
    await ensureRbacFixtures(prisma);
  });

  afterAll(async () => {
    await prisma.userRole.deleteMany({ where: { user: { email: { in: TEST_EMAILS } } } });
    await prisma.user.deleteMany({ where: { email: { in: TEST_EMAILS } } });
    await prisma.$disconnect();
  });

  it("creates one active user per required role", async () => {
    const users = await prisma.user.findMany({
      where: { email: { in: TEST_EMAILS } },
      select: {
        email: true,
        isActive: true,
        userRoles: { select: { role: { select: { code: true } } } },
      },
    });

    expect(users).toHaveLength(4);
    const roleCodes = users.flatMap((u) => u.userRoles.map((ur) => ur.role.code));
    expect(roleCodes.sort()).toEqual([
      "MANAGER",
      "SALES_EXECUTIVE",
      "SYSTEM_ADMIN",
      "WAREHOUSE_OPERATOR",
    ]);
    users.forEach((user) => expect(user.isActive).toBe(true));
  });

  it("ensures critical permissions by role in DB", async () => {
    const manager = await prisma.role.findUnique({
      where: { code: "MANAGER" },
      select: { rolePermissions: { select: { permission: { select: { code: true } } } } },
    });
    const sales = await prisma.role.findUnique({
      where: { code: "SALES_EXECUTIVE" },
      select: { rolePermissions: { select: { permission: { select: { code: true } } } } },
    });

    const managerCodes = (manager?.rolePermissions ?? []).map((rp) => rp.permission.code);
    const salesCodes = (sales?.rolePermissions ?? []).map((rp) => rp.permission.code);

    expect(managerCodes).toEqual(expect.arrayContaining(getRolePermissions("MANAGER")));
    expect(salesCodes).toEqual(expect.arrayContaining(getRolePermissions("SALES_EXECUTIVE")));
    expect(salesCodes).not.toContain("inventory.adjust");
    expect(salesCodes).not.toContain("inventory.transfer");
    expect(salesCodes).not.toContain("inventory.pick");
    expect(salesCodes).not.toContain("audit.view");
  });
});
