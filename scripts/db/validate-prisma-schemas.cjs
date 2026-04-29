#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const prismaCli = path.join(repoRoot, "node_modules", "prisma", "build", "index.js");
const databaseUrl = process.env.DATABASE_URL || "postgresql://local:local@127.0.0.1:5432/wms?schema=public";

if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
  console.error("[prisma] DATABASE_URL debe apuntar a PostgreSQL. SQLite no es un runtime valido para este proyecto.");
  process.exit(1);
}

console.log("[prisma] validating postgresql-canonical: prisma/postgresql/schema.prisma");
const result = spawnSync(process.execPath, [prismaCli, "validate", "--schema", "prisma/postgresql/schema.prisma"], {
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
