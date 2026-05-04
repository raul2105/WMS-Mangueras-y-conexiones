import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

let currentActorId = "actor-system-admin";

vi.mock("@/lib/rbac", () => ({
  requirePermission: vi.fn(async () => true),
}));

vi.mock("@/lib/auth/session-context", () => ({
  getSessionContext: vi.fn(async () => ({ user: { id: currentActorId } })),
}));

import { createUser, resetUserPassword, updateUser } from "@/lib/users/admin-service";

const shouldRunPostgresSuite = process.env.RUN_POSTGRES_TESTS === "1"
  && /^postgres(ql)?:\/\//i.test(String(process.env.DATABASE_URL ?? ""));

const describePostgres = shouldRunPostgresSuite ? describe : describe.skip;

describePostgres("users admin-service integration (postgres)", () => {
  const prisma = new PrismaClient();
  const runId = `USR-IT-${Date.now()}`;
  let managerRoleId = "";
  let systemAdminRoleId = "";

  function parseJsonRecord(value: string | null) {
    if (!value) return null;
    return JSON.parse(value) as Record<string, unknown>;
  }

  async function restrictToSingleActiveSystemAdmin(targetUserId: string) {
    const otherAdmins = await prisma.user.findMany({
      where: {
        id: { not: targetUserId },
        isActive: true,
        userRoles: {
          some: {
            roleId: systemAdminRoleId,
          },
        },
      },
      select: { id: true, isActive: true },
    });

    if (otherAdmins.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: otherAdmins.map((row) => row.id) } },
        data: { isActive: false },
      });
    }

    return otherAdmins;
  }

  async function restoreAdminActiveStates(rows: Array<{ id: string; isActive: boolean }>) {
    for (const row of rows) {
      await prisma.user.update({
        where: { id: row.id },
        data: { isActive: row.isActive },
      });
    }
  }

  beforeAll(async () => {
    await prisma.$connect();
    const [managerRole, systemAdminRole] = await Promise.all([
      prisma.role.create({
        data: {
          code: `${runId}_MANAGER`,
          name: `${runId} Manager`,
          description: "Role for users admin-service integration tests",
          isActive: true,
        },
        select: { id: true },
      }),
      prisma.role.upsert({
        where: { code: "SYSTEM_ADMIN" },
        update: {
          isActive: true,
          name: "System Administrator",
        },
        create: {
          code: "SYSTEM_ADMIN",
          name: "System Administrator",
          description: "Role required for users.manage",
          isActive: true,
        },
        select: { id: true },
      }),
    ]);
    managerRoleId = managerRole.id;
    systemAdminRoleId = systemAdminRole.id;
  });

  beforeEach(async () => {
    currentActorId = "actor-system-admin";
    await prisma.auditLog.deleteMany({
      where: { source: "users/admin-service" },
    });
    await prisma.userRole.deleteMany({
      where: { user: { email: { contains: runId } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: runId } },
    });
  });

  afterAll(async () => {
    await prisma.userRole.deleteMany({
      where: { user: { email: { contains: runId } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: runId } },
    });
    await prisma.role.deleteMany({
      where: { code: `${runId}_MANAGER` },
    });
    await prisma.$disconnect();
  });

  it("creates user with role and writes CREATE audit log", async () => {
    const email = `${runId}-create@scmayher.com`;
    const created = await createUser({
      name: "Usuario Integracion",
      email,
      password: "Passw0rd!",
      roleIds: [managerRoleId],
      isActive: true,
    });

    const [savedUser, savedSecret, audit] = await Promise.all([
      prisma.user.findUnique({
        where: { id: created.id },
        select: {
          email: true,
          isActive: true,
          userRoles: { select: { role: { select: { code: true } } } },
        },
      }),
      prisma.user.findUnique({
        where: { id: created.id },
        select: { passwordHash: true },
      }),
      prisma.auditLog.findFirst({
        where: {
          entityType: "USER",
          entityId: created.id,
          action: "CREATE",
          source: "users/admin-service",
        },
      }),
    ]);

    expect(savedUser?.email).toBe(email.toLowerCase());
    expect(savedUser?.isActive).toBe(true);
    expect(savedUser?.userRoles.map((row) => row.role.code)).toEqual([`${runId}_MANAGER`]);
    expect(savedSecret?.passwordHash).toBeTruthy();
    expect(savedSecret?.passwordHash).not.toBe("Passw0rd!");
    expect(audit).toBeTruthy();
    const auditAfter = parseJsonRecord(audit?.after ?? null);
    expect(auditAfter).not.toHaveProperty("password");
    expect(auditAfter).not.toHaveProperty("passwordHash");
  });

  it("updates user and writes UPDATE audit log", async () => {
    const email = `${runId}-update@scmayher.com`;
    const created = await createUser({
      name: "Usuario Update",
      email,
      password: "Passw0rd!",
      roleIds: [managerRoleId],
      isActive: true,
    });

    await updateUser(created.id, {
      name: "Usuario Update Editado",
      email: `${runId}-update-edited@scmayher.com`,
      roleIds: [managerRoleId],
      isActive: false,
    });

    const [savedUser, audit] = await Promise.all([
      prisma.user.findUnique({
        where: { id: created.id },
        select: { name: true, email: true, isActive: true },
      }),
      prisma.auditLog.findFirst({
        where: {
          entityType: "USER",
          entityId: created.id,
          action: "UPDATE",
          source: "users/admin-service",
        },
      }),
    ]);

    expect(savedUser?.name).toBe("Usuario Update Editado");
    expect(savedUser?.email).toBe(`${runId}-update-edited@scmayher.com`.toLowerCase());
    expect(savedUser?.isActive).toBe(false);
    expect(audit).toBeTruthy();
    const auditBefore = parseJsonRecord(audit?.before ?? null);
    const auditAfter = parseJsonRecord(audit?.after ?? null);
    expect(auditBefore).not.toHaveProperty("password");
    expect(auditBefore).not.toHaveProperty("passwordHash");
    expect(auditAfter).not.toHaveProperty("password");
    expect(auditAfter).not.toHaveProperty("passwordHash");
  });

  it("resets user password hash and writes RESET_PASSWORD audit log", async () => {
    const email = `${runId}-reset@scmayher.com`;
    const created = await createUser({
      name: "Usuario Reset",
      email,
      password: "Passw0rd!",
      roleIds: [managerRoleId],
      isActive: true,
    });

    const before = await prisma.user.findUnique({
      where: { id: created.id },
      select: { passwordHash: true },
    });

    await resetUserPassword(created.id, "N3wP@ssword!");

    const [after, audit] = await Promise.all([
      prisma.user.findUnique({
        where: { id: created.id },
        select: { passwordHash: true },
      }),
      prisma.auditLog.findFirst({
        where: {
          entityType: "USER",
          entityId: created.id,
          action: "RESET_PASSWORD",
          source: "users/admin-service",
        },
      }),
    ]);

    expect(after?.passwordHash).toBeTruthy();
    expect(after?.passwordHash).not.toBe(before?.passwordHash);
    expect(after?.passwordHash).not.toBe("N3wP@ssword!");
    expect(audit).toBeTruthy();
    const auditAfter = parseJsonRecord(audit?.after ?? null);
    expect(auditAfter).not.toHaveProperty("password");
    expect(auditAfter).not.toHaveProperty("passwordHash");
  });

  it("blocks deactivating the last active SYSTEM_ADMIN", async () => {
    const admin = await createUser({
      name: "Admin Unico",
      email: `${runId}-admin-only@scmayher.com`,
      password: "Passw0rd!",
      roleIds: [systemAdminRoleId],
      isActive: true,
    });
    const modifiedAdmins = await restrictToSingleActiveSystemAdmin(admin.id);

    try {
      currentActorId = "actor-other-admin";

      await expect(
        updateUser(admin.id, {
          name: "Admin Unico",
          email: `${runId}-admin-only@scmayher.com`,
          roleIds: [systemAdminRoleId],
          isActive: false,
        }),
      ).rejects.toThrow("No puedes dejar al sistema sin un SYSTEM_ADMIN activo");
    } finally {
      await restoreAdminActiveStates(modifiedAdmins);
    }
  });

  it("blocks removing SYSTEM_ADMIN role from the last active SYSTEM_ADMIN", async () => {
    const admin = await createUser({
      name: "Admin Unico Role",
      email: `${runId}-admin-only-role@scmayher.com`,
      password: "Passw0rd!",
      roleIds: [systemAdminRoleId],
      isActive: true,
    });
    const modifiedAdmins = await restrictToSingleActiveSystemAdmin(admin.id);

    try {
      currentActorId = "actor-other-admin";

      await expect(
        updateUser(admin.id, {
          name: "Admin Unico Role",
          email: `${runId}-admin-only-role@scmayher.com`,
          roleIds: [managerRoleId],
          isActive: true,
        }),
      ).rejects.toThrow("No puedes dejar al sistema sin un SYSTEM_ADMIN activo");
    } finally {
      await restoreAdminActiveStates(modifiedAdmins);
    }
  });

  it("allows deactivating a SYSTEM_ADMIN when another active SYSTEM_ADMIN exists", async () => {
    const adminA = await createUser({
      name: "Admin A",
      email: `${runId}-admin-a@scmayher.com`,
      password: "Passw0rd!",
      roleIds: [systemAdminRoleId],
      isActive: true,
    });
    await createUser({
      name: "Admin B",
      email: `${runId}-admin-b@scmayher.com`,
      password: "Passw0rd!",
      roleIds: [systemAdminRoleId],
      isActive: true,
    });

    currentActorId = "actor-other-admin";

    await expect(
      updateUser(adminA.id, {
        name: "Admin A",
        email: `${runId}-admin-a@scmayher.com`,
        roleIds: [managerRoleId],
        isActive: false,
      }),
    ).resolves.toBeUndefined();

    const updated = await prisma.user.findUnique({
      where: { id: adminA.id },
      select: {
        isActive: true,
        userRoles: { select: { role: { select: { code: true } } } },
      },
    });
    expect(updated?.isActive).toBe(false);
    expect(updated?.userRoles.map((entry) => entry.role.code)).toEqual([`${runId}_MANAGER`]);
  });
});
