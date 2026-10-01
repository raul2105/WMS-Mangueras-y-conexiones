import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import type { JWT } from "next-auth/jwt";
import type { User } from "next-auth";

type AuthConfig = {
  providers: Array<{ authorize: (credentials: { email: string; password: string }) => Promise<User | null> }>;
  callbacks: { jwt: (args: { token: JWT; user?: User }) => Promise<JWT | null> };
};
let config: AuthConfig;
vi.mock("next-auth", () => ({ default: (options: AuthConfig) => {
  config = options;
  return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
} }));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: unknown) => options }));

const describePostgres = process.env.RUN_POSTGRES_TESTS === "1" ? describe : describe.skip;
describePostgres("credential resets revoke server sessions against PostgreSQL", () => {
  const prisma = new PrismaClient();
  let user: { id: string; email: string };
  const previousPassword = `QA-before-${randomUUID()}`;
  const nextPassword = `QA-after-${randomUUID()}`;
  beforeAll(async () => {
    user = await prisma.user.create({ data: {
      email: `qa-session-${randomUUID()}@example.invalid`, name: "QA session reset",
      passwordHash: await bcrypt.hash(previousPassword, 10), isActive: true,
    }, select: { id: true, email: true } });
    await import("@/lib/auth");
  });
  afterAll(async () => {
    if (user) await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  });

  it("rejects earlier JWTs and passwords while preserving the same user identity", async () => {
    const signedIn = await config.providers[0].authorize({ email: user.email, password: previousPassword });
    expect(signedIn?.id).toBe(user.id);
    const token = await config.callbacks.jwt({ token: {}, user: signedIn! });
    expect(token?.credentialVersion).toBeTruthy();
    expect(token).not.toHaveProperty("passwordHash");

    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(nextPassword, 10) } });
    expect(await config.callbacks.jwt({ token: token! })).toBeNull();
    expect(await config.providers[0].authorize({ email: user.email, password: previousPassword })).toBeNull();
    expect(await config.callbacks.jwt({ token: {}, user: signedIn! })).toBeNull();

    const freshUser = await config.providers[0].authorize({ email: user.email, password: nextPassword });
    expect(freshUser?.id).toBe(user.id);
    expect(freshUser?.email).toBe(user.email);
    const freshToken = await config.callbacks.jwt({ token: {}, user: freshUser! });
    expect(freshToken?.uid).toBe(user.id);
    expect(freshToken?.credentialVersion).not.toBe(token?.credentialVersion);
    expect(await config.callbacks.jwt({ token: freshToken! })).not.toBeNull();
  });
});
