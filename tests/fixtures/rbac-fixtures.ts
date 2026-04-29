import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { RBAC_PERMISSIONS, RBAC_ROLES, type RoleCode } from "@/lib/rbac/permissions";

export type SessionUserFixture = {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
};

const ROLE_PERMISSIONS: Record<RoleCode, string[]> = {
  SYSTEM_ADMIN: [...RBAC_PERMISSIONS],
  MANAGER: [
    "catalog.view",
    "catalog.edit",
    "inventory.view",
    "inventory.adjust",
    "inventory.transfer",
    "inventory.receive",
    "inventory.pick",
    "kardex.view",
    "warehouse.manage",
    "location.manage",
    "production.view",
    "production.execute",
    "purchasing.view",
    "purchasing.manage",
    "sales.view",
    "sales.create_order",
    "customers.view",
    "customers.manage",
    "audit.view",
    "labels.manage",
  ],
  WAREHOUSE_OPERATOR: [
    "catalog.view",
    "inventory.view",
    "inventory.adjust",
    "inventory.transfer",
    "inventory.receive",
    "inventory.pick",
    "kardex.view",
    "production.view",
    "production.execute",
    "purchasing.view",
    "labels.manage",
  ],
  SALES_EXECUTIVE: [
    "catalog.view",
    "inventory.view",
    "sales.view",
    "sales.create_order",
    "customers.view",
  ],
};

const ROLE_USERS: Record<RoleCode, { email: string; name: string; password: string }> = {
  SYSTEM_ADMIN: { email: "test-admin@scmayher.com", name: "Test System Admin", password: "Admin123*" },
  MANAGER: { email: "test-manager@scmayher.com", name: "Test Manager", password: "Manager123*" },
  WAREHOUSE_OPERATOR: { email: "test-warehouse@scmayher.com", name: "Test Warehouse", password: "Warehouse123*" },
  SALES_EXECUTIVE: { email: "test-sales@scmayher.com", name: "Test Sales", password: "Sales123*" },
};

export function getRolePermissions(role: RoleCode) {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function buildSessionForRole(role: RoleCode): SessionUserFixture {
  const user = ROLE_USERS[role];
  const permissions = getRolePermissions(role);
  return {
    id: `session-${role.toLowerCase()}`,
    email: user.email,
    name: user.name,
    roles: [role],
    permissions,
  };
}

export async function ensureRbacFixtures(prisma: PrismaClient) {
  for (const permissionCode of RBAC_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permissionCode },
      create: { code: permissionCode, description: `Permission ${permissionCode}` },
      update: { description: `Permission ${permissionCode}` },
    });
  }

  for (const roleCode of RBAC_ROLES) {
    await prisma.role.upsert({
      where: { code: roleCode },
      create: {
        code: roleCode,
        name: roleCode,
        description: `Role ${roleCode}`,
        isActive: true,
      },
      update: {
        name: roleCode,
        description: `Role ${roleCode}`,
        isActive: true,
      },
    });
  }

  for (const roleCode of RBAC_ROLES) {
    const role = await prisma.role.findUnique({ where: { code: roleCode }, select: { id: true } });
    if (!role) continue;

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });

    const permissions = getRolePermissions(roleCode);
    for (const permissionCode of permissions) {
      const permission = await prisma.permission.findUnique({ where: { code: permissionCode }, select: { id: true } });
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  }

  for (const roleCode of RBAC_ROLES) {
    const role = await prisma.role.findUnique({ where: { code: roleCode }, select: { id: true } });
    if (!role) continue;
    const userData = ROLE_USERS[roleCode];
    const passwordHash = await bcrypt.hash(userData.password, 10);

    const user = await prisma.user.upsert({
      where: { email: userData.email },
      create: {
        email: userData.email,
        name: userData.name,
        passwordHash,
        isActive: true,
      },
      update: {
        name: userData.name,
        passwordHash,
        isActive: true,
      },
      select: { id: true },
    });

    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });
  }

  return ROLE_USERS;
}
