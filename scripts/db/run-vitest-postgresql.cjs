#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const vitestCli = path.join(repoRoot, "node_modules", "vitest", "vitest.mjs");
const args = process.argv.slice(2);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl || !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
  console.error("[test] DATABASE_URL debe apuntar a PostgreSQL. SQLite no es un runtime valido para pruebas del WMS.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [vitestCli, ...args], {
  cwd: repoRoot,
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
  },
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
