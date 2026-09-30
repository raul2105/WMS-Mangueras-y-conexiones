import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JWT } from "next-auth/jwt";

type CapturedAuthConfig = {
  callbacks: {
    jwt: (args: { token: JWT }) => Promise<JWT | null>;
    session: (args: { session: { user: Record<string, unknown> }; token: JWT }) => Promise<{ user: { permissions: string[] } }>;
  };
};

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), config: null as CapturedAuthConfig | null }));
vi.mock("next-auth", () => ({ default: (config: CapturedAuthConfig) => {
  mocks.config = config;
  return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
} }));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: unknown) => options }));
vi.mock("@/lib/prisma", () => ({ default: { user: { findUnique: mocks.findUnique } } }));

await import("@/lib/auth");

function capturedConfig() {
  if (!mocks.config) throw new Error("NextAuth configuration was not captured");
  return mocks.config;
}

describe("server sessions use current account and role state", () => {
  beforeEach(() => {
    mocks.findUnique.mockReset();
    mocks.findUnique.mockResolvedValue({ id: "u1", name: "Current", email: "current@example.test", isActive: true,
      userRoles: [{ role: { code: "SALES_EXECUTIVE" } }] });
  });

  it("replaces privileges from an older admin token with the current roles", async () => {
    const token = await capturedConfig().callbacks.jwt({ token: { uid: "u1", roles: ["SYSTEM_ADMIN"] } });
    if (!token) throw new Error("Active user session was unexpectedly invalidated");
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "u1" } }));
    expect(token.roles).toEqual(["SALES_EXECUTIVE"]);
    expect(token.permVersion).toBe("SALES_EXECUTIVE");
    const session = await capturedConfig().callbacks.session({ session: { user: {} }, token });
    expect(session.user.permissions).not.toContain("users.manage");
  });

  it.each([null, { id: "u1", isActive: false, userRoles: [] }])("invalidates a missing or disabled account", async (user) => {
    mocks.findUnique.mockResolvedValue(user);
    expect(await capturedConfig().callbacks.jwt({ token: { uid: "u1", roles: ["SYSTEM_ADMIN"] } })).toBeNull();
  });

  it("does not reuse stale permissions when the database is unavailable", async () => {
    mocks.findUnique.mockRejectedValue(new Error("database unavailable"));
    await expect(capturedConfig().callbacks.jwt({ token: { uid: "u1", roles: ["SYSTEM_ADMIN"] } })).rejects.toThrow("database unavailable");
  });

  it("invalidates tokens without a user identifier", async () => {
    expect(await capturedConfig().callbacks.jwt({ token: { roles: ["SYSTEM_ADMIN"] } })).toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
