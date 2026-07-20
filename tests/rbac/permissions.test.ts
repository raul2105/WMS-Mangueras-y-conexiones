import { describe, expect, it } from "vitest";
import { RBAC_PERMISSIONS, RBAC_ROLES, isSystemAdmin } from "@/lib/rbac/permissions";
import { getPermissionsForRoles } from "@/lib/rbac/role-permissions";

describe("rbac permissions helpers", () => {
  it("declares the expected roles", () => {
    expect(RBAC_ROLES).toEqual([
      "SYSTEM_ADMIN",
      "MANAGER",
      "WAREHOUSE_OPERATOR",
      "SALES_EXECUTIVE",
    ]);
  });

  it("declares critical permissions", () => {
    expect(RBAC_PERMISSIONS).toContain("inventory.adjust");
    expect(RBAC_PERMISSIONS).toContain("inventory.transfer");
    expect(RBAC_PERMISSIONS).toContain("inventory.pick");
    expect(RBAC_PERMISSIONS).toContain("users.manage");
    expect(RBAC_PERMISSIONS).toContain("audit.view");
    expect(RBAC_PERMISSIONS).toContain("customers.view");
    expect(RBAC_PERMISSIONS).toContain("customers.quick_create_sales");
    expect(RBAC_PERMISSIONS).toContain("customers.manage");
  });

  it("isSystemAdmin returns true only when SYSTEM_ADMIN role is present", () => {
    expect(isSystemAdmin(["SYSTEM_ADMIN"])).toBe(true);
    expect(isSystemAdmin(["MANAGER", "SYSTEM_ADMIN"])).toBe(true);
    expect(isSystemAdmin(["MANAGER"])).toBe(false);
    expect(isSystemAdmin(undefined)).toBe(false);
  });

  it("allows sales to register a customer without customer management", () => {
    const permissions = getPermissionsForRoles(["SALES_EXECUTIVE"]);

    expect(permissions).toContain("customers.quick_create_sales");
    expect(permissions).not.toContain("customers.manage");
  });

  it("keeps warehouse operators on controlled physical work only", () => {
    const permissions = getPermissionsForRoles(["WAREHOUSE_OPERATOR"]);

    expect(permissions).toContain("inventory.transfer");
    expect(permissions).toContain("inventory.receive");
    expect(permissions).toContain("inventory.pick");
    expect(permissions).not.toContain("inventory.adjust");
    expect(permissions).not.toContain("kardex.view");
  });
});
