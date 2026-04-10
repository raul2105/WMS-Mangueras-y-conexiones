#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const prismaCli = path.join(repoRoot, "node_modules", "prisma", "build", "index.js");

const result = spawnSync(process.execPath, [prismaCli, "generate", "--schema", "prisma/schema.prisma"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    DATABASE_URL: "file:./dev.db",
  },
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
