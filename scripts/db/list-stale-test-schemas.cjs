#!/usr/bin/env node

require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const { assertPostgresEnv } = require("./assert-postgres-env.cjs");

const retentionArgIndex = process.argv.findIndex((arg) => arg === "--retention-days");
const retentionDays = retentionArgIndex >= 0 ? Number(process.argv[retentionArgIndex + 1]) : 30;
if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
  throw new Error("--retention-days debe ser un entero entre 1 y 3650");
}

const { databaseUrl } = assertPostgresEnv();
const parsedDatabaseUrl = new URL(databaseUrl);
parsedDatabaseUrl.searchParams.set("schema", "public");
const prisma = new PrismaClient({ datasources: { db: { url: parsedDatabaseUrl.toString() } } });

async function main() {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRawUnsafe(
    `SELECT
       n.nspname AS schema_name,
       pg_get_userbyid(n.nspowner) AS owner,
       to_timestamp((substring(n.nspname from '^t_run_([0-9]+)')::numeric) / 1000) AS created_at,
       regexp_replace(n.nspname, '_w[0-9]+$', '') AS run_prefix,
       count(c.oid)::int AS object_count,
       count(c.oid) FILTER (WHERE c.relkind IN ('r', 'p'))::int AS table_count,
       (COALESCE(sum(c.relpages), 0)::numeric * 8192)::text AS approx_bytes
     FROM pg_namespace n
     LEFT JOIN pg_class c ON c.relnamespace = n.oid
     WHERE n.nspname ~ '^t_run_[0-9]+_[a-z0-9]+_w[0-9]+$'
     GROUP BY n.nspname, n.nspowner
     ORDER BY created_at, n.nspname`
  );

  const candidates = rows.filter((row) => new Date(row.created_at) < cutoff);
  const groups = new Map();
  for (const row of candidates) {
    const current = groups.get(row.run_prefix) ?? { schemaCount: 0, objectCount: 0, tableCount: 0 };
    current.schemaCount += 1;
    current.objectCount += Number(row.object_count ?? 0);
    current.tableCount += Number(row.table_count ?? 0);
    groups.set(row.run_prefix, current);
  }

  const result = {
    generatedAt: new Date().toISOString(),
    retentionDays,
    cutoff: cutoff.toISOString(),
    totalMatchingSchemas: rows.length,
    candidateSchemaCount: candidates.length,
    candidateGroupCount: groups.size,
    candidateObjectCount: candidates.reduce((sum, row) => sum + Number(row.object_count ?? 0), 0),
    candidateTableCount: candidates.reduce((sum, row) => sum + Number(row.table_count ?? 0), 0),
    candidates,
    groups: Array.from(groups, ([runPrefix, values]) => ({ runPrefix, ...values })),
  };

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`cutoff=${result.cutoff}`);
    console.log(`matching=${result.totalMatchingSchemas}`);
    console.log(`candidates=${result.candidateSchemaCount}`);
    console.log(`groups=${result.candidateGroupCount}`);
    for (const row of candidates) {
      console.log(`${row.schema_name}\t${row.created_at.toISOString()}\t${row.object_count} objects\t${row.table_count} tables`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
