import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session-context", () => ({
  getSessionContext: vi.fn(),
}));

import { hasSalesWriteAccess } from "@/lib/rbac/sales";

describe("sales write access", () => {
  it("allows managers and system admins without extra permission claims", () => {
    expect(hasSalesWriteAccess({ roles: ["MANAGER"], permissions: [] })).toBe(true);
    expect(hasSalesWriteAccess({ roles: ["SYSTEM_ADMIN"], permissions: [] })).toBe(true);
  });

  it("requires explicit permission or privileged role for non-admin users", () => {
    expect(hasSalesWriteAccess({ roles: ["SALES_EXECUTIVE"], permissions: [] })).toBe(false);
    expect(hasSalesWriteAccess({ roles: ["WAREHOUSE_OPERATOR"], permissions: [] })).toBe(false);
    expect(hasSalesWriteAccess({ roles: [], permissions: [] })).toBe(false);
    expect(hasSalesWriteAccess({ roles: ["SALES_EXECUTIVE"], permissions: ["sales.create_order"] })).toBe(true);
  });
});
