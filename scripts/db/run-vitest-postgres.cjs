#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");
require("dotenv/config");
const { assertPostgresEnv } = require("./assert-postgres-env.cjs");

const repoRoot = path.resolve(__dirname, "..", "..");
const vitestCli = path.join(repoRoot, "node_modules", "vitest", "vitest.mjs");
const args = process.argv.slice(2);
assertPostgresEnv();

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

