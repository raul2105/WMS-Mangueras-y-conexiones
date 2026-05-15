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

  try {
    const rows = await prisma.$queryRawUnsafe(
      "SELECT nspname FROM pg_namespace WHERE nspname LIKE $1 ESCAPE '\\'",
      `t_${runId}_w%`
    );
    for (const row of rows) {
      if (!row?.nspname) continue;
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${row.nspname}" CASCADE`);
    }
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

  try {
    await cleanupIsolatedSchemas();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[test] failed to cleanup isolated schemas for ${runId}: ${message}`);
  }

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  process.exit(result.status ?? 0);
}

void main();

