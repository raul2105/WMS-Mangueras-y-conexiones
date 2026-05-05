import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const shouldRunPostgresSuite = process.env.RUN_POSTGRES_TESTS === "1"
  && /^postgres(ql)?:\/\//i.test(String(process.env.DATABASE_URL ?? ""));

const describePostgres = shouldRunPostgresSuite ? describe : describe.skip;

const { requirePermissionMock, getSessionContextMock } = vi.hoisted(() => ({
  requirePermissionMock: vi.fn(async () => ({ user: { id: "session-admin" } })),
  getSessionContextMock: vi.fn(async () => ({
    session: { user: { id: "session-admin", email: "session-admin@scmayher.com", name: "Session Admin", roles: ["SYSTEM_ADMIN"] } },
    user: { id: "session-admin", email: "session-admin@scmayher.com", name: "Session Admin", roles: ["SYSTEM_ADMIN"] },
    roles: ["SYSTEM_ADMIN"],
    permissions: ["users.manage"],
    isAuthenticated: true,
    isSystemAdmin: true,
  })),
}));

vi.mock("@/lib/rbac", () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock("@/lib/auth/session-context", () => ({
  getSessionContext: getSessionContextMock,
}));

import { createUser, resetUserPassword, updateUser, UserAdminError } from "@/lib/users/admin-service";

describePostgres("users admin service integration (postgres)", () => {
  const prisma = new PrismaClient();
  const runId = `KAN49-${Date.now()}`;

  let roleSystemAdminId = "";
  let roleManagerId = "";
  let roleWarehouseId = "";
  let sessionAdminUserId = "";

  beforeAll(async () => {
    await prisma.$connect();

    const systemAdminRole = await prisma.role.upsert({
      where: { code: "SYSTEM_ADMIN" },
      update: { isActive: true, name: "SYSTEM_ADMIN" },
      create: { code: "SYSTEM_ADMIN", name: "SYSTEM_ADMIN", isActive: true },
      select: { id: true },
    });
    roleSystemAdminId = systemAdminRole.id;

    const managerRole = await prisma.role.upsert({
      where: { code: "MANAGER" },
      update: { isActive: true, name: "MANAGER" },
      create: { code: "MANAGER", name: "MANAGER", isActive: true },
      select: { id: true },
    });
    roleManagerId = managerRole.id;

    const warehouseRole = await prisma.role.upsert({
      where: { code: "WAREHOUSE_OPERATOR" },
      update: { isActive: true, name: "WAREHOUSE_OPERATOR" },
      create: { code: "WAREHOUSE_OPERATOR", name: "WAREHOUSE_OPERATOR", isActive: true },
      select: { id: true },
    });
    roleWarehouseId = warehouseRole.id;

    const sessionAdminEmail = `${runId}-session-admin@scmayher.com`;
    const sessionAdmin = await prisma.user.upsert({
      where: { email: sessionAdminEmail },
      update: {
        name: "Session Admin",
        isActive: true,
      },
      create: {
        name: "Session Admin",
        email: sessionAdminEmail,
        passwordHash: "session-admin-hash",
        isActive: true,
      },
      select: { id: true },
    });
    sessionAdminUserId = sessionAdmin.id;

    await prisma.userRole.deleteMany({ where: { userId: sessionAdminUserId } });
    await prisma.userRole.create({
      data: {
        userId: sessionAdminUserId,
        roleId: roleSystemAdminId,
      },
    });
  });

  beforeEach(async () => {
    requirePermissionMock.mockClear();
    getSessionContextMock.mockResolvedValue({
      session: { user: { id: sessionAdminUserId, email: `${runId}-session-admin@scmayher.com`, name: "Session Admin", roles: ["SYSTEM_ADMIN"] } },
      user: { id: sessionAdminUserId, email: `${runId}-session-admin@scmayher.com`, name: "Session Admin", roles: ["SYSTEM_ADMIN"] },
      roles: ["SYSTEM_ADMIN"],
      permissions: ["users.manage"],
      isAuthenticated: true,
      isSystemAdmin: true,
    });
  });

  afterAll(async () => {
    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: {
            startsWith: `${runId}-`,
          },
        },
      },
    });
    await prisma.auditLog.deleteMany({
      where: {
        source: "users/admin-service",
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          startsWith: `${runId}-`,
        },
      },
    });
    await prisma.$disconnect();
  });

  it("createUser: crea usuario activo con rol válido y audit log", async () => {
    const created = await createUser({
      name: "Nuevo Admin",
      email: `${runId}-create-ok@scmayher.com`,
      password: "Admin123*",
      roleIds: [roleSystemAdminId],
      isActive: true,
    });

    const [persisted, audit] = await Promise.all([
      prisma.user.findUnique({
        where: { id: created.id },
        select: {
          id: true,
          email: true,
          isActive: true,
          userRoles: { select: { roleId: true } },
        },
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

    expect(requirePermissionMock).toHaveBeenCalledWith("users.manage");
    expect(persisted?.email).toBe(`${runId}-create-ok@scmayher.com`.toLowerCase());
    expect(persisted?.isActive).toBe(true);
    expect(persisted?.userRoles.map((entry) => entry.roleId)).toContain(roleSystemAdminId);
    expect(audit).toBeTruthy();
  });

  it("createUser: rechaza email duplicado", async () => {
    const duplicateEmail = `${runId}-duplicate@scmayher.com`;

    await createUser({
      name: "Duplicado Uno",
      email: duplicateEmail,
      password: "Admin123*",
      roleIds: [roleManagerId],
      isActive: true,
    });

    await expect(
      createUser({
        name: "Duplicado Dos",
        email: duplicateEmail,
        password: "Admin123*",
        roleIds: [roleManagerId],
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(UserAdminError);
  });

  it("updateUser: actualiza name/email/roles/isActive, sincroniza UserRole y crea audit log", async () => {
    const target = await createUser({
      name: "Target Update",
      email: `${runId}-update-target@scmayher.com`,
      password: "Admin123*",
      roleIds: [roleSystemAdminId],
      isActive: true,
    });

    await updateUser(target.id, {
      name: "Target Updated Name",
      email: `${runId}-updated@scmayher.com`,
      roleIds: [roleManagerId, roleWarehouseId],
      isActive: false,
    });

    const [persisted, audit] = await Promise.all([
      prisma.user.findUnique({
        where: { id: target.id },
        select: {
          name: true,
          email: true,
          isActive: true,
          userRoles: {
            select: { role: { select: { code: true } } },
            orderBy: { role: { code: "asc" } },
          },
        },
      }),
      prisma.auditLog.findFirst({
        where: {
          entityType: "USER",
          entityId: target.id,
          action: "UPDATE",
          source: "users/admin-service",
        },
      }),
    ]);

    expect(persisted?.name).toBe("Target Updated Name");
    expect(persisted?.email).toBe(`${runId}-updated@scmayher.com`.toLowerCase());
    expect(persisted?.isActive).toBe(false);
    expect(persisted?.userRoles.map((entry) => entry.role.code)).toEqual(["MANAGER", "WAREHOUSE_OPERATOR"]);
    expect(audit).toBeTruthy();
  });

  it("updateUser: permite desactivar y reactivar usuario (soft disable)", async () => {
    const target = await createUser({
      name: "Toggle Target",
      email: `${runId}-toggle@scmayher.com`,
      password: "Admin123*",
      roleIds: [roleManagerId],
      isActive: true,
    });

    await updateUser(target.id, {
      name: "Toggle Target",
      email: `${runId}-toggle@scmayher.com`,
      roleIds: [roleManagerId],
      isActive: false,
    });

    let persisted = await prisma.user.findUnique({
      where: { id: target.id },
      select: { isActive: true },
    });
    expect(persisted?.isActive).toBe(false);

    await updateUser(target.id, {
      name: "Toggle Target",
      email: `${runId}-toggle@scmayher.com`,
      roleIds: [roleManagerId],
      isActive: true,
    });

    persisted = await prisma.user.findUnique({
      where: { id: target.id },
      select: { isActive: true },
    });
    expect(persisted?.isActive).toBe(true);
  });

  it("updateUser: bloquea auto-desactivación de SYSTEM_ADMIN", async () => {
    await expect(
      updateUser(sessionAdminUserId, {
        name: "Session Admin",
        email: `${runId}-session-admin@scmayher.com`,
        roleIds: [roleSystemAdminId],
        isActive: false,
      }),
    ).rejects.toThrow("No puedes desactivar tu propio usuario");
  });

  it("updateUser: bloquea quitarse rol SYSTEM_ADMIN", async () => {
    await expect(
      updateUser(sessionAdminUserId, {
        name: "Session Admin",
        email: `${runId}-session-admin@scmayher.com`,
        roleIds: [roleManagerId],
        isActive: true,
      }),
    ).rejects.toThrow("No puedes quitarte el rol SYSTEM_ADMIN");
  });

  it("resetUserPassword: actualiza hash de contraseña y deja audit log", async () => {
    const target = await createUser({
      name: "Reset Target",
      email: `${runId}-reset@scmayher.com`,
      password: "Admin123*",
      roleIds: [roleManagerId],
      isActive: true,
    });

    const newPassword = "Admin123*NEW";
    await resetUserPassword(target.id, newPassword);

    const [persisted, audit] = await Promise.all([
      prisma.user.findUnique({
        where: { id: target.id },
        select: { passwordHash: true },
      }),
      prisma.auditLog.findFirst({
        where: {
          entityType: "USER",
          entityId: target.id,
          action: "RESET_PASSWORD",
          source: "users/admin-service",
        },
      }),
    ]);

    expect(persisted?.passwordHash).toBeTruthy();
    expect(await bcrypt.compare(newPassword, String(persisted?.passwordHash))).toBe(true);
    expect(audit).toBeTruthy();
  });
});
