import { describe, expect, it } from "vitest";
import {
  getMobileCapabilities,
  getMobileEffectivePermissions,
  getMobilePermissionsForRole,
  resolveRoleFromClaims,
} from "@/lib/mobile/rbac";

describe("mobile rbac", () => {
  it("assigns expected permissions for manager", () => {
    const permissions = getMobilePermissionsForRole("MANAGER");
    expect(permissions).toContain("mobile.profile.read");
    expect(permissions).toContain("inventory.search");
    expect(permissions).toContain("assembly_requests.create");
    expect(permissions).toContain("product_drafts.create");
  });

  it("keeps operator without write intake permissions", () => {
    const permissions = getMobilePermissionsForRole("WAREHOUSE_OPERATOR");
    expect(permissions).toContain("inventory.search");
    expect(permissions).not.toContain("assembly_requests.create");
    expect(permissions).not.toContain("product_drafts.create");
  });

  it("derives capabilities from permission set", () => {
    const permissions = getMobilePermissionsForRole("SALES_EXECUTIVE");
    const capabilities = getMobileCapabilities(permissions);
    expect(capabilities.canSearchInventory).toBe(true);
    expect(capabilities.canCreateAssemblyRequests).toBe(true);
    expect(capabilities.canCreateProductDrafts).toBe(true);
  });

  it("combines permissions from multiple roles", () => {
    const permissions = getMobileEffectivePermissions(["WAREHOUSE_OPERATOR", "SALES_EXECUTIVE"]);
    expect(permissions).toContain("inventory.search");
    expect(permissions).toContain("assembly_requests.create");
    expect(permissions).toContain("product_drafts.create");
  });

  it("resolves role from custom claim first", () => {
    const role = resolveRoleFromClaims({ "custom:role_code": "SYSTEM_ADMIN" });
    expect(role).toBe("SYSTEM_ADMIN");
  });

  it("falls back to groups and then MANAGER", () => {
    expect(resolveRoleFromClaims({}, ["WAREHOUSE_OPERATOR"])).toBe("WAREHOUSE_OPERATOR");
    expect(resolveRoleFromClaims({}, [])).toBe("MANAGER");
  });
});
