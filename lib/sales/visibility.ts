import type { Prisma } from "@prisma/client";
import { isSystemAdmin } from "@/lib/rbac/permissions";

export function canManageAllSalesRequests(roles: string[]) {
  return isSystemAdmin(roles) || roles.includes("MANAGER");
}

export function buildSalesRequestVisibilityWhere(args: {
  roles: string[];
  userId?: string | null;
  baseWhere?: Prisma.SalesInternalOrderWhereInput;
}): Prisma.SalesInternalOrderWhereInput {
  const { roles, userId, baseWhere } = args;
  if (canManageAllSalesRequests(roles)) {
    return baseWhere ?? {};
  }

  if (!roles.includes("SALES_EXECUTIVE") || !userId) {
    return {
      AND: [
        baseWhere ?? {},
        { id: "__NO_ACCESS__" },
      ],
    };
  }

  return {
    AND: [
      baseWhere ?? {},
      {
        OR: [
          { assignedToUserId: userId },
          {
            assignedToUserId: null,
            requestedByUser: {
              userRoles: {
                some: {
                  role: {
                    code: "MANAGER",
                    isActive: true,
                  },
                },
              },
            },
          },
        ],
      },
    ],
  };
}
