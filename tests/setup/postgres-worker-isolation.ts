import { execFileSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

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

async function ensureSchemaExists(adminUrl: string, schema: string) {
  const prisma = new PrismaClient({
    datasources: { db: { url: adminUrl } },
  });

  try {
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  } finally {
    await prisma.$disconnect();
  }
}

async function setupWorkerSchemaIsolation() {
  if (process.env.RUN_POSTGRES_TESTS !== "1") return;
  if (process.env.WMS_TEST_ISOLATION !== "worker-schema") return;

  const baseDatabaseUrl = String(process.env.DATABASE_URL ?? "").trim();
  if (!/^postgres(ql)?:\/\//i.test(baseDatabaseUrl)) return;

  const runId = String(process.env.WMS_TEST_RUN_ID ?? "").trim() || "adhoc";
  const poolId = String(process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? "0").trim() || "0";
  const schema = `t_${runId}_w${poolId}`.replace(/[^a-zA-Z0-9_]/g, "_");

  const state = getIsolationState();
  if (state.initializedSchemas.has(schema)) {
    process.env.DATABASE_URL = withSchema(baseDatabaseUrl, schema);
    return;
  }

  const workerDatabaseUrl = withSchema(baseDatabaseUrl, schema);
  const adminUrl = withSchema(baseDatabaseUrl, "public");

  process.env.DATABASE_URL = workerDatabaseUrl;
  await ensureSchemaExists(adminUrl, schema);

  const repoRoot = path.resolve(__dirname, "..", "..");
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
