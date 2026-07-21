import { describe, expect, it } from "vitest";
import { getPermissionsForRoles } from "@/lib/rbac/role-permissions";
import { matchRouteAccessEntry } from "@/lib/rbac/route-access-map";

describe("warehouse operator governance", () => {
  it("allows controlled physical work without stock corrections or kardex access", () => {
    const permissions = getPermissionsForRoles(["WAREHOUSE_OPERATOR"]);

    expect(permissions).toEqual(expect.arrayContaining(["inventory.transfer", "inventory.receive", "inventory.pick"]));
    expect(permissions).not.toContain("inventory.adjust");
    expect(permissions).not.toContain("kardex.view");
  });

  it("blocks the direct adjustment and kardex routes for warehouse operators", () => {
    expect(matchRouteAccessEntry("/inventory/adjust")?.roles).not.toContain("WAREHOUSE_OPERATOR");
    expect(matchRouteAccessEntry("/inventory/kardex")?.roles).not.toContain("WAREHOUSE_OPERATOR");
  });
});
