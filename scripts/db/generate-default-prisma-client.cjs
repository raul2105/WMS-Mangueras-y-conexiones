#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const prismaCli = path.join(repoRoot, "node_modules", "prisma", "build", "index.js");
const env = { ...process.env };

// CI may run `npm ci` without DATABASE_URL; Prisma config still requires it.
if (!env.DATABASE_URL) {
  env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public";
}

const result = spawnSync(process.execPath, [prismaCli, "generate", "--schema", "prisma/postgresql/schema.prisma"], {
  cwd: repoRoot,
  env,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
