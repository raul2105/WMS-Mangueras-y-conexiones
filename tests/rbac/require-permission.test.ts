import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSessionForRole } from "@/tests/fixtures/rbac-fixtures";

const authMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}));

describe("rbac requirePermission/hasPermission", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  it("allows when user has explicit permission", async () => {
    const manager = buildSessionForRole("MANAGER");
    authMock.mockResolvedValue({ user: manager });
    const { hasPermission, requirePermission } = await import("@/lib/rbac");

    await expect(hasPermission("inventory.adjust")).resolves.toBe(true);
    await expect(requirePermission("inventory.adjust")).resolves.toMatchObject({
      user: { email: manager.email },
    });
  });

  it("allows SYSTEM_ADMIN even without explicit permission list check", async () => {
    const admin = buildSessionForRole("SYSTEM_ADMIN");
    authMock.mockResolvedValue({ user: admin });
    const { hasPermission, requirePermission } = await import("@/lib/rbac");

    await expect(hasPermission("users.manage")).resolves.toBe(true);
    await expect(requirePermission("users.manage")).resolves.toBeTruthy();
  });

  it("denies when permission is missing", async () => {
    const sales = buildSessionForRole("SALES_EXECUTIVE");
    authMock.mockResolvedValue({ user: sales });
    const { hasPermission, requirePermission, RbacPermissionError } = await import("@/lib/rbac");

    await expect(hasPermission("inventory.pick")).resolves.toBe(false);
    await expect(requirePermission("inventory.pick")).rejects.toBeInstanceOf(RbacPermissionError);
  });

  it("denies when no session user exists", async () => {
    authMock.mockResolvedValue(null);
    const { requirePermission, RbacPermissionError } = await import("@/lib/rbac");

    await expect(requirePermission("audit.view")).rejects.toBeInstanceOf(RbacPermissionError);
  });
});
