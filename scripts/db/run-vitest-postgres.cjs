#!/usr/bin/env node

const { randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const { assertPostgresEnv } = require("./assert-postgres-env.cjs");

const repoRoot = path.resolve(__dirname, "..", "..");
const vitestCli = path.join(repoRoot, "node_modules", "vitest", "vitest.mjs");
const args = process.argv.slice(2);
const runId = process.env.WMS_TEST_RUN_ID || `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
const normalizedRunId = runId.replace(/[^a-zA-Z0-9_]/g, "_");
const forceSerial = process.env.WMS_POSTGRES_FORCE_SERIAL === "1";
const hasWorkerOverride = args.some((arg) => arg === "--maxWorkers" || arg.startsWith("--maxWorkers="));
const finalArgs = forceSerial && !hasWorkerOverride ? ["--maxWorkers=1", ...args] : args;
const { databaseUrl } = assertPostgresEnv();

function withSchema(url, schema) {
  const parsed = new URL(url);
  parsed.searchParams.set("schema", schema);
  return parsed.toString();
}

async function cleanupIsolatedSchemas() {
  const adminUrl = withSchema(databaseUrl, "public");
  const prisma = new PrismaClient({
    datasources: { db: { url: adminUrl } },
  });

  const schemaPattern = `^t_${normalizedRunId}_w[0-9]+$`;
  try {
    const rows = await prisma.$queryRawUnsafe(
      "SELECT nspname FROM pg_namespace WHERE nspname ~ $1",
      schemaPattern
    );
    const schemaNames = rows.map((row) => row?.nspname).filter(Boolean);
    for (const schemaName of schemaNames) {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    }
    const remaining = await prisma.$queryRawUnsafe(
      "SELECT nspname FROM pg_namespace WHERE nspname ~ $1",
      schemaPattern
    );
    if (remaining.length > 0) {
      throw new Error(`Persisten ${remaining.length} esquemas aislados despues de la limpieza`);
    }
    return schemaNames.length;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const result = spawnSync(process.execPath, [vitestCli, ...finalArgs], {
    cwd: repoRoot,
    env: {
      ...process.env,
      RUN_POSTGRES_TESTS: "1",
      WMS_TEST_ISOLATION: "worker-schema",
      WMS_TEST_RUN_ID: runId,
    },
    stdio: "inherit",
  });

  let cleanupError = null;
  try {
    const cleanedCount = await cleanupIsolatedSchemas();
    console.log(`[test] cleaned ${cleanedCount} isolated schemas for ${runId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[test] failed to cleanup isolated schemas for ${runId}: ${message}`);
    cleanupError = error;
  }

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (cleanupError) process.exit(1);
  process.exit(result.status ?? 1);
}

void main();

