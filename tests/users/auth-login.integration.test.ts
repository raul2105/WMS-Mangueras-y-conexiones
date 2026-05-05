import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

type CapturedProvider = { authorize?: (credentials: unknown) => Promise<unknown> };
type CapturedAuthConfig = { providers?: CapturedProvider[] };
let capturedConfig: CapturedAuthConfig | null = null;

vi.mock("next-auth", () => ({
  default: vi.fn((config: CapturedAuthConfig) => {
    capturedConfig = config;
    return {
      handlers: {},
      auth: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
    };
  }),
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: (options: { authorize?: (credentials: unknown) => Promise<unknown> }) => ({
    id: "credentials",
    name: "Credentials",
    type: "credentials",
    options,
    authorize: options.authorize,
  }),
}));

const shouldRunPostgresSuite = process.env.RUN_POSTGRES_TESTS === "1"
  && /^postgres(ql)?:\/\//i.test(String(process.env.DATABASE_URL ?? ""));

const describePostgres = shouldRunPostgresSuite ? describe : describe.skip;

describePostgres("auth credentials integration (postgres)", () => {
  const prisma = new PrismaClient();
  const runId = `auth-it-${Date.now()}`;

  beforeAll(async () => {
    await prisma.$connect();
    await import("@/lib/auth");
  });

  beforeEach(async () => {
    await prisma.userRole.deleteMany({ where: { user: { email: { contains: runId } } } });
    await prisma.user.deleteMany({ where: { email: { contains: runId } } });
  });

  afterAll(async () => {
    await prisma.userRole.deleteMany({ where: { user: { email: { contains: runId } } } });
    await prisma.user.deleteMany({ where: { email: { contains: runId } } });
    await prisma.$disconnect();
  });

  function getAuthorize() {
    if (!capturedConfig?.providers?.[0]?.authorize) {
      throw new Error("Credentials authorize no fue capturado desde lib/auth.ts");
    }
    return capturedConfig.providers[0].authorize as (credentials: unknown) => Promise<unknown>;
  }

  it("rechaza login para usuario inactivo aunque el password sea correcto", async () => {
    const email = `${runId}-inactive@scmayher.com`;
    const password = "Passw0rd!";

    await prisma.user.create({
      data: {
        name: "Usuario Inactivo",
        email,
        isActive: false,
        passwordHash: await bcrypt.hash(password, 10),
      },
    });

    const authorize = getAuthorize();
    const result = await authorize({ email, password });

    expect(result).toBeNull();
  });

  it("permite login para usuario activo con password correcto", async () => {
    const email = `${runId}-active@scmayher.com`;
    const password = "Passw0rd!";

    const created = await prisma.user.create({
      data: {
        name: "Usuario Activo",
        email,
        isActive: true,
        passwordHash: await bcrypt.hash(password, 10),
      },
      select: { id: true, name: true, email: true },
    });

    const authorize = getAuthorize();
    const result = await authorize({ email, password }) as { id: string; email: string; name: string } | null;

    expect(result).toBeTruthy();
    expect(result?.id).toBe(created.id);
    expect(result?.email).toBe(created.email);
    expect(result?.name).toBe(created.name);
  });
});

