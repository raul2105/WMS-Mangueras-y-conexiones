#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const vitestCli = path.join(repoRoot, "node_modules", "vitest", "vitest.mjs");
const args = process.argv.slice(2);
const databaseUrl = String(process.env.DATABASE_URL ?? "").trim();

if (!databaseUrl) {
  console.error("DATABASE_URL es requerido para test Postgres.");
  process.exit(1);
}

if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
  console.error("DATABASE_URL debe apuntar a PostgreSQL para test Postgres.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [vitestCli, ...args], {
  cwd: repoRoot,
  env: {
    ...process.env,
    RUN_POSTGRES_TESTS: "1",
  },
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);

