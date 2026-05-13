import { describe, expect, it } from "vitest";
import { getRequiredPermissionForPath } from "@/lib/rbac/route-permissions";
import { RBAC_ROLES, type RoleCode } from "@/lib/rbac/permissions";
import { getRolePermissions } from "@/tests/fixtures/rbac-fixtures";

function canAccess(role: RoleCode, pathname: string) {
  if (role === "SYSTEM_ADMIN") return true;
  const permission = getRequiredPermissionForPath(pathname);
  if (!permission) return true;
  return getRolePermissions(role).includes(permission);
}

describe("rbac role-route access matrix", () => {
  const criticalRoutes = [
    "/users",
    "/users/new",
    "/users/abc",
    "/users/abc/edit",
    "/inventory/adjust",
    "/inventory/transfer",
    "/inventory/pick",
    "/audit",
    "/production/requests",
    "/production/requests/new",
    "/production/availability",
    "/production/equivalences",
    "/sales/customers",
    "/sales/customers/new",
    "/sales/customers/abc",
    "/sales/customers/abc/edit",
  ] as const;

  it("maps critical routes to expected permissions", () => {
    expect(getRequiredPermissionForPath("/users")).toBe("users.manage");
    expect(getRequiredPermissionForPath("/users/new")).toBe("users.manage");
    expect(getRequiredPermissionForPath("/users/abc")).toBe("users.manage");
    expect(getRequiredPermissionForPath("/users/abc/edit")).toBe("users.manage");
    expect(getRequiredPermissionForPath("/inventory/adjust")).toBe("inventory.adjust");
    expect(getRequiredPermissionForPath("/inventory/transfer")).toBe("inventory.transfer");
    expect(getRequiredPermissionForPath("/inventory/pick")).toBe("inventory.pick");
    expect(getRequiredPermissionForPath("/audit")).toBe("audit.view");
    expect(getRequiredPermissionForPath("/production/requests")).toBe("sales.view");
    expect(getRequiredPermissionForPath("/production/availability")).toBe("sales.view");
    expect(getRequiredPermissionForPath("/production/equivalences")).toBe("sales.view");
    expect(getRequiredPermissionForPath("/sales/orders")).toBe("sales.view");
    expect(getRequiredPermissionForPath("/sales/customers")).toBe("customers.view");
    expect(getRequiredPermissionForPath("/sales/customers/new")).toBe("customers.manage");
    expect(getRequiredPermissionForPath("/sales/customers/abc")).toBe("customers.view");
    expect(getRequiredPermissionForPath("/sales/customers/abc/edit")).toBe("customers.manage");
  });

  it("SYSTEM_ADMIN can access all critical routes", () => {
    for (const route of criticalRoutes) {
      expect(canAccess("SYSTEM_ADMIN", route)).toBe(true);
    }
  });

  it("MANAGER can access inventory critical routes and audit", () => {
    expect(canAccess("MANAGER", "/inventory/adjust")).toBe(true);
    expect(canAccess("MANAGER", "/inventory/transfer")).toBe(true);
    expect(canAccess("MANAGER", "/inventory/pick")).toBe(true);
    expect(canAccess("MANAGER", "/audit")).toBe(true);
  });

  it("WAREHOUSE_OPERATOR can do physical inventory but not audit", () => {
    expect(canAccess("WAREHOUSE_OPERATOR", "/inventory/adjust")).toBe(true);
    expect(canAccess("WAREHOUSE_OPERATOR", "/inventory/transfer")).toBe(true);
    expect(canAccess("WAREHOUSE_OPERATOR", "/inventory/pick")).toBe(true);
    expect(canAccess("WAREHOUSE_OPERATOR", "/audit")).toBe(false);
  });

  it("SALES_EXECUTIVE cannot access physical inventory routes or audit", () => {
    expect(canAccess("SALES_EXECUTIVE", "/users")).toBe(false);
    expect(canAccess("SALES_EXECUTIVE", "/inventory/adjust")).toBe(false);
    expect(canAccess("SALES_EXECUTIVE", "/inventory/transfer")).toBe(false);
    expect(canAccess("SALES_EXECUTIVE", "/inventory/pick")).toBe(false);
    expect(canAccess("SALES_EXECUTIVE", "/audit")).toBe(false);
  });

  it("request routes are available for manager and sales executive", () => {
    expect(canAccess("MANAGER", "/production/requests")).toBe(true);
    expect(canAccess("MANAGER", "/production/requests/new")).toBe(true);
    expect(canAccess("MANAGER", "/production/availability")).toBe(true);
    expect(canAccess("MANAGER", "/production/equivalences")).toBe(true);
    expect(canAccess("SALES_EXECUTIVE", "/production/requests")).toBe(true);
    expect(canAccess("SALES_EXECUTIVE", "/production/requests/new")).toBe(true);
    expect(canAccess("SALES_EXECUTIVE", "/production/availability")).toBe(true);
    expect(canAccess("SALES_EXECUTIVE", "/production/equivalences")).toBe(true);
  });

  it("customer routes respect view/manage split", () => {
    expect(canAccess("MANAGER", "/sales/customers")).toBe(true);
    expect(canAccess("MANAGER", "/sales/customers/new")).toBe(true);
    expect(canAccess("MANAGER", "/sales/customers/abc")).toBe(true);
    expect(canAccess("MANAGER", "/sales/customers/abc/edit")).toBe(true);

    expect(canAccess("SALES_EXECUTIVE", "/sales/customers")).toBe(true);
    expect(canAccess("SALES_EXECUTIVE", "/sales/customers/abc")).toBe(true);
    expect(canAccess("SALES_EXECUTIVE", "/sales/customers/new")).toBe(false);
    expect(canAccess("SALES_EXECUTIVE", "/sales/customers/abc/edit")).toBe(false);

    expect(canAccess("WAREHOUSE_OPERATOR", "/sales/customers")).toBe(false);
    expect(canAccess("WAREHOUSE_OPERATOR", "/sales/customers/new")).toBe(false);
    expect(canAccess("WAREHOUSE_OPERATOR", "/sales/customers/abc")).toBe(false);
    expect(canAccess("WAREHOUSE_OPERATOR", "/sales/customers/abc/edit")).toBe(false);
  });

  it("legacy sales redirects still require sales.view", () => {
    expect(canAccess("MANAGER", "/sales/orders")).toBe(true);
    expect(canAccess("MANAGER", "/sales/orders/new")).toBe(true);
    expect(canAccess("SALES_EXECUTIVE", "/sales/orders")).toBe(true);
    expect(canAccess("SALES_EXECUTIVE", "/sales/orders/new")).toBe(true);
  });

  it("users.manage remains restricted to SYSTEM_ADMIN", () => {
    const adminsWithUsersManage = RBAC_ROLES.filter((role) => {
      if (role === "SYSTEM_ADMIN") return true;
      return getRolePermissions(role).includes("users.manage");
    });

    expect(adminsWithUsersManage).toEqual(["SYSTEM_ADMIN"]);
    expect(canAccess("MANAGER", "/users")).toBe(false);
    expect(canAccess("WAREHOUSE_OPERATOR", "/users")).toBe(false);
    expect(canAccess("SALES_EXECUTIVE", "/users")).toBe(false);
  });

  it("MANAGER, SALES_EXECUTIVE y WAREHOUSE_OPERATOR no acceden al modulo /users", () => {
    const blockedRoles: RoleCode[] = ["MANAGER", "SALES_EXECUTIVE", "WAREHOUSE_OPERATOR"];
    const userRoutes = ["/users", "/users/new", "/users/abc", "/users/abc/edit"] as const;

    for (const role of blockedRoles) {
      for (const route of userRoutes) {
        expect(canAccess(role, route)).toBe(false);
      }
    }
  });
});
