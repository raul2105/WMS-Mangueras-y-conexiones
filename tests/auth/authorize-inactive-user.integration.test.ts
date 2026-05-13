import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const shouldRunPostgresSuite = process.env.RUN_POSTGRES_TESTS === "1"
  && /^postgres(ql)?:\/\//i.test(String(process.env.DATABASE_URL ?? ""));

const describePostgres = shouldRunPostgresSuite ? describe : describe.skip;

type CredentialsProviderLike = {
  authorize: (credentials: { email?: string; password?: string }) => Promise<unknown>;
};

type NextAuthConfigLike = {
  providers: CredentialsProviderLike[];
};

let capturedConfig: NextAuthConfigLike | undefined;

vi.mock("next-auth", () => ({
  default: (config: NextAuthConfigLike) => {
    capturedConfig = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: (config: CredentialsProviderLike) => config,
}));

describePostgres("auth authorize inactive user integration (postgres)", () => {
  const prisma = new PrismaClient();
  const runId = `KAN49-AUTH-${Date.now()}`;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: {
            startsWith: `${runId}-`,
          },
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          startsWith: `${runId}-`,
        },
      },
    });
    await prisma.$disconnect();
  });

  it("blocks login when user is inactive even with valid password", async () => {
    const password = "Admin123*";
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name: "Inactive Login",
        email: `${runId}-inactive@scmayher.com`,
        passwordHash,
        isActive: false,
      },
      select: { id: true, email: true },
    });

    const role = await prisma.role.upsert({
      where: { code: "MANAGER" },
      update: { isActive: true, name: "MANAGER" },
      create: { code: "MANAGER", name: "MANAGER", isActive: true },
      select: { id: true },
    });

    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: role.id,
      },
    });

    await import("@/lib/auth");

    const provider = capturedConfig?.providers[0];
    expect(provider).toBeTruthy();
    if (!provider) {
      throw new Error("No se pudo obtener provider de credenciales desde lib/auth");
    }
    const result = await provider.authorize({ email: user.email, password });

    expect(result).toBeNull();
  });
});
