import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getSessionContext } from "@/lib/auth/session-context";
import { requirePermission } from "@/lib/rbac";
import { createAuditLogSafeWithDb } from "@/lib/audit-log";

const BCRYPT_SALT_ROUNDS = 10;

export class UserAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserAdminError";
  }
}

type UserListFilters = {
  query?: string;
  roleCode?: string;
  isActive?: "active" | "inactive" | "all";
  page?: number;
  pageSize?: number;
};

type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  roleIds: string[];
  isActive?: boolean;
};

type UpdateUserInput = {
  name: string;
  email: string;
  roleIds: string[];
  isActive: boolean;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function getActiveRolesByIds(roleIds: string[], tx: Prisma.TransactionClient) {
  const uniqueRoleIds = Array.from(new Set(roleIds));
  const roles = await tx.role.findMany({
    where: {
      id: { in: uniqueRoleIds },
      isActive: true,
    },
    select: {
      id: true,
      code: true,
      name: true,
    },
  });

  if (roles.length !== uniqueRoleIds.length) {
    throw new UserAdminError("Uno o más roles no existen o están inactivos");
  }

  return roles;
}

export async function listUsers(filters: UserListFilters = {}) {
  const pageSize = Math.max(1, Math.min(filters.pageSize ?? 25, 100));
  const page = Math.max(1, filters.page ?? 1);
  const query = (filters.query ?? "").trim();
  const roleCode = (filters.roleCode ?? "").trim();

  const where: Prisma.UserWhereInput = {
    ...(query
      ? {
          OR: [
            { name: { contains: query } },
            { email: { contains: query } },
          ],
        }
      : {}),
    ...(roleCode
      ? {
          userRoles: {
            some: {
              role: {
                code: roleCode,
                isActive: true,
              },
            },
          },
        }
      : {}),
    ...(filters.isActive === "active"
      ? { isActive: true }
      : filters.isActive === "inactive"
        ? { isActive: false }
        : {}),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { email: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        userRoles: {
          where: { role: { isActive: true } },
          select: {
            role: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
          orderBy: { role: { name: "asc" } },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      userRoles: {
        where: { role: { isActive: true } },
        select: {
          role: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
        orderBy: { role: { name: "asc" } },
      },
    },
  });

  if (!user) {
    throw new UserAdminError("Usuario no encontrado");
  }

  return user;
}

export async function listAssignableRoles() {
  return prisma.role.findMany({
    where: { isActive: true },
    orderBy: [{ code: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
    },
  });
}

export async function createUser(input: CreateUserInput) {
  await requirePermission("users.manage");

  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const isActive = input.isActive ?? true;

  return prisma.$transaction(async (tx) => {
    const [existingUser, roles] = await Promise.all([
      tx.user.findUnique({ where: { email }, select: { id: true } }),
      getActiveRolesByIds(input.roleIds, tx),
    ]);

    if (existingUser) {
      throw new UserAdminError("Ya existe un usuario con ese email");
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

    const createdUser = await tx.user.create({
      data: {
        name,
        email,
        passwordHash,
        isActive,
        userRoles: {
          create: roles.map((role) => ({ roleId: role.id })),
        },
      },
      select: { id: true, name: true, email: true, isActive: true },
    });

    await createAuditLogSafeWithDb(
      {
        entityType: "USER",
        entityId: createdUser.id,
        action: "CREATE",
        source: "users/admin-service",
        after: {
          name: createdUser.name,
          email: createdUser.email,
          isActive: createdUser.isActive,
          roleCodes: roles.map((role) => role.code),
        },
      },
      tx,
    );

    return createdUser;
  });
}

export async function updateUser(userId: string, input: UpdateUserInput) {
  await requirePermission("users.manage");

  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const { user } = await getSessionContext();

  return prisma.$transaction(async (tx) => {
    const [existingUser, duplicateEmailUser, roles, systemAdminRole] = await Promise.all([
      tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          isActive: true,
          userRoles: {
            where: { role: { isActive: true } },
            select: { roleId: true, role: { select: { code: true } } },
          },
        },
      }),
      tx.user.findUnique({ where: { email }, select: { id: true } }),
      getActiveRolesByIds(input.roleIds, tx),
      tx.role.findFirst({ where: { code: "SYSTEM_ADMIN", isActive: true }, select: { id: true } }),
    ]);

    if (!existingUser) {
      throw new UserAdminError("Usuario no encontrado");
    }

    if (duplicateEmailUser && duplicateEmailUser.id !== userId) {
      throw new UserAdminError("Ya existe un usuario con ese email");
    }

    const isSelf = user?.id === existingUser.id;
    if (isSelf) {
      if (!input.isActive) {
        throw new UserAdminError("No puedes desactivar tu propio usuario");
      }

      if (systemAdminRole && !roles.some((role) => role.id === systemAdminRole.id)) {
        throw new UserAdminError("No puedes quitarte el rol SYSTEM_ADMIN");
      }
    }

    const existingHasSystemAdminRole = Boolean(
      systemAdminRole && existingUser.userRoles.some((role) => role.roleId === systemAdminRole.id),
    );
    const nextHasSystemAdminRole = Boolean(systemAdminRole && roles.some((role) => role.id === systemAdminRole.id));
    const isRemovingOrDeactivatingSystemAdmin = existingHasSystemAdminRole && (!input.isActive || !nextHasSystemAdminRole);

    if (systemAdminRole && isRemovingOrDeactivatingSystemAdmin) {
      const remainingActiveSystemAdmins = await tx.user.count({
        where: {
          id: { not: existingUser.id },
          isActive: true,
          userRoles: {
            some: {
              roleId: systemAdminRole.id,
            },
          },
        },
      });

      if (remainingActiveSystemAdmins === 0) {
        throw new UserAdminError("No puedes dejar al sistema sin un SYSTEM_ADMIN activo");
      }
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        name,
        email,
        isActive: input.isActive,
        userRoles: {
          deleteMany: {},
          create: roles.map((role) => ({ roleId: role.id })),
        },
      },
    });

    await createAuditLogSafeWithDb(
      {
        entityType: "USER",
        entityId: userId,
        action: "UPDATE",
        source: "users/admin-service",
        before: {
          email: existingUser.email,
          isActive: existingUser.isActive,
          roleCodes: existingUser.userRoles.map((entry) => entry.role.code),
        },
        after: {
          email,
          isActive: input.isActive,
          roleCodes: roles.map((role) => role.code),
        },
      },
      tx,
    );
  });
}

export async function resetUserPassword(userId: string, newPassword: string) {
  await requirePermission("users.manage");

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

  return prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!existingUser) {
      throw new UserAdminError("Usuario no encontrado");
    }

    await tx.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await createAuditLogSafeWithDb(
      {
        entityType: "USER",
        entityId: userId,
        action: "RESET_PASSWORD",
        source: "users/admin-service",
        after: {
          email: existingUser.email,
          passwordResetAt: new Date().toISOString(),
        },
      },
      tx,
    );
  });
}
