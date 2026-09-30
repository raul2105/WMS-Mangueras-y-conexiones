import { describe, expect, it } from "vitest";
import { getVisibleNavItems, isNavItemActive } from "@/components/layout/nav-config";
import { getPermissionsForRoles } from "@/lib/rbac/role-permissions";

describe("manager Gmail settings navigation", () => {
  it("shows the per-manager PO sender settings only to purchasing managers", () => {
    const managerItems = getVisibleNavItems(["MANAGER"], getPermissionsForRoles(["MANAGER"]));
    const operatorItems = getVisibleNavItems(["WAREHOUSE_OPERATOR"], getPermissionsForRoles(["WAREHOUSE_OPERATOR"]));

    expect(managerItems.some((item) => item.href === "/purchasing/email")).toBe(true);
    expect(operatorItems.some((item) => item.href === "/purchasing/email")).toBe(false);
  });

  it("highlights the most specific settings route without marking the purchasing parent active", () => {
    const managerItems = getVisibleNavItems(["MANAGER"], getPermissionsForRoles(["MANAGER"]));
    const purchasing = managerItems.find((item) => item.href === "/purchasing");
    const emailSettings = managerItems.find((item) => item.href === "/purchasing/email");

    expect(purchasing).toBeDefined();
    expect(emailSettings).toBeDefined();
    expect(isNavItemActive("/purchasing/email", emailSettings!, managerItems)).toBe(true);
    expect(isNavItemActive("/purchasing/email", purchasing!, managerItems)).toBe(false);
  });
});
