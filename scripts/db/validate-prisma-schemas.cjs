#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const prismaCli = path.join(repoRoot, "node_modules", "prisma", "build", "index.js");

const schemas = [
  {
    schema: "prisma/postgresql/schema.prisma",
    databaseUrl: process.env.DATABASE_URL || "postgresql://local:local@127.0.0.1:5432/wms?schema=public",
    label: "postgresql-default",
  },
];

for (const { schema, databaseUrl, label } of schemas) {
  console.log(`[prisma] validating ${label}: ${schema}`);
  const result = spawnSync(process.execPath, [prismaCli, "validate", "--schema", schema], {
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

  if ((result.status ?? 0) !== 0) {
    process.exit(result.status ?? 1);
  }
}
