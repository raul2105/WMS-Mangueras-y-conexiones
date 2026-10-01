import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { expect } from "vitest";

type IsolationState = {
  initializedSchemas: Set<string>;
};

declare global {
  var __wmsPgIsolationState: IsolationState | undefined;
}

function getIsolationState(): IsolationState {
  if (!globalThis.__wmsPgIsolationState) {
    globalThis.__wmsPgIsolationState = { initializedSchemas: new Set() };
  }
  return globalThis.__wmsPgIsolationState;
}

function withSchema(url: string, schema: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("schema", schema);
  return parsed.toString();
}

function isPostgresUrl(value: string) {
  return /^postgres(ql)?:\/\//i.test(value);
}

function readAuthoritativeDatabaseUrl(repoRoot: string) {
  const envFilePath = path.join(repoRoot, ".env");
  try {
    const contents = readFileSync(envFilePath, "utf8");
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      if (!/^DATABASE_URL\s*=/.test(line)) continue;
      const [, rawValue = ""] = line.split("=", 2);
      const normalized = rawValue.trim().replace(/^["']|["']$/g, "");
      if (isPostgresUrl(normalized)) {
        return normalized;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function bootstrapPostgresTestDefaults() {
  if (process.env.RUN_SQLITE_TESTS === "1") {
    return false;
  }

  if (process.env.RUN_POSTGRES_TESTS !== "1") {
    process.env.RUN_POSTGRES_TESTS = "1";
  }

  if (process.env.WMS_TEST_ISOLATION !== "worker-schema") {
    process.env.WMS_TEST_ISOLATION = "worker-schema";
  }

  const currentDatabaseUrl = String(process.env.DATABASE_URL ?? "").trim();
  if (isPostgresUrl(currentDatabaseUrl)) {
    return true;
  }

  const repoRoot = path.resolve(__dirname, "..", "..");
  const authoritativeDatabaseUrl = readAuthoritativeDatabaseUrl(repoRoot);
  if (!authoritativeDatabaseUrl) {
    throw new Error(
      "No se pudo resolver una DATABASE_URL PostgreSQL autorizada. Usa npm run test:postgres o define DATABASE_URL a AWS Postgres.",
    );
  }

  process.env.DATABASE_URL = authoritativeDatabaseUrl;
  return true;
}

async function ensureSchemaExists(adminUrl: string, schema: string) {
  const prisma = new PrismaClient({
    datasources: { db: { url: adminUrl } },
  });

  try {
    await prisma.$executeRawUnsafe("CREATE SCHEMA " + JSON.stringify(schema));
  } finally {
    await prisma.$disconnect();
  }
}

async function setupWorkerSchemaIsolation() {
  if (!bootstrapPostgresTestDefaults()) return;
  if (process.env.RUN_POSTGRES_TESTS !== "1") return;
  if (process.env.WMS_TEST_ISOLATION !== "worker-schema") return;

  const baseDatabaseUrl = String(process.env.DATABASE_URL ?? "").trim();
  if (!/^postgres(ql)?:\/\//i.test(baseDatabaseUrl)) return;

  const runId = String(process.env.WMS_TEST_RUN_ID ?? "").trim() || "adhoc";
  const testPath = expect.getState().testPath;
  if (!testPath) {
    throw new Error("Vitest no proporcionó testPath; se cancela la prueba PostgreSQL para evitar compartir esquema.");
  }
  const repoRoot = path.resolve(__dirname, "..", "..");
  const relativeTestPath = path.relative(repoRoot, testPath).replaceAll("\\", "/").toLowerCase();
  if (relativeTestPath.startsWith("../") || path.isAbsolute(relativeTestPath)) {
    throw new Error("El archivo de prueba está fuera del repositorio; no se crea esquema PostgreSQL.");
  }
  const fileHash = createHash("sha256").update(relativeTestPath).digest("hex").slice(0, 16);
  const normalizedRunId = runId.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 24) || "adhoc";
  const schema = "t_" + normalizedRunId + "_f" + fileHash;

  const state = getIsolationState();
  if (state.initializedSchemas.has(schema)) {
    process.env.DATABASE_URL = withSchema(baseDatabaseUrl, schema);
    return;
  }

  const workerDatabaseUrl = withSchema(baseDatabaseUrl, schema);
  const adminUrl = withSchema(baseDatabaseUrl, "public");

  process.env.DATABASE_URL = workerDatabaseUrl;
  await ensureSchemaExists(adminUrl, schema);

  execFileSync(
    process.execPath,
    [
      path.join(repoRoot, "node_modules", "prisma", "build", "index.js"),
      "db",
      "push",
      "--skip-generate",
      "--accept-data-loss",
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        DATABASE_URL: workerDatabaseUrl,
      },
      stdio: "pipe",
    }
  );

  state.initializedSchemas.add(schema);
}

await setupWorkerSchemaIsolation();
