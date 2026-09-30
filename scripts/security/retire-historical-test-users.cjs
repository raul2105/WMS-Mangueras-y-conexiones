#!/usr/bin/env node
// Retire only the 25 historical sales-service QA identities pinned by the
// 2026-09-30 read-only canonical metadata capture. Never delete their rows or
// relations. This script is intentionally not invoked by a package script.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");

const EXPECTED_ACCOUNT = "904891391424";
const EXPECTED_AWS_PROFILE = "Raul_ITsupport";
const EXPECTED_DB_HOST = "wms-web-dev-pg.cvb2fezndc4e.us-east-1.rds.amazonaws.com";
const EXPECTED_DB_NAME = "/wms";
const EXPECTED_SCHEMA = "public";
const EXPECTED_MANIFEST_SHA256 = "4bd244d04393598842a20b78ad65e9962583c8775a6bdbbe5913ed98b30b5c6e1";
const MANIFEST_PATH = path.resolve(__dirname, "../../output/aws-canonical-user-metadata-20260930.json");
const SALES_FIXTURE_PATH = path.resolve(__dirname, "../../tests/sales-request-service.test.ts");
const AUTHORIZATION_ENV = "WMS_HISTORICAL_TEST_USER_RETIRE_APPROVED";
const RUN_ID_ENV = "WMS_HISTORICAL_TEST_USER_RETIRE_RUN_ID";
const TARGET_COUNT = 25;
const REASON = "Retiro de identidades QA históricas del servicio de ventas; conservar cuenta y relaciones para auditoría.";
const SOURCE = "security/retire-historical-test-users";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateEnvironment() {
  assert(process.env[AUTHORIZATION_ENV] === "1", "Explicit retirement authorization is required");
  assert(process.env.AWS_PROFILE === EXPECTED_AWS_PROFILE, "AWS profile guard failed");
  assert(/^[-a-zA-Z0-9_]{8,80}$/.test(String(process.env[RUN_ID_ENV] ?? "")), "A unique retirement run ID is required");
  let database;
  try { database = new URL(process.env.DATABASE_URL ?? ""); } catch { throw new Error("Canonical database guard failed"); }
  assert(["postgres:", "postgresql:"].includes(database.protocol), "PostgreSQL is required");
  assert(database.hostname === EXPECTED_DB_HOST && database.pathname === EXPECTED_DB_NAME
    && database.searchParams.get("schema") === EXPECTED_SCHEMA
    && (!database.port || database.port === "5432"), "Canonical public database guard failed");
  const account = execFileSync("aws", ["sts", "get-caller-identity", "--query", "Account", "--output", "text", "--profile", EXPECTED_AWS_PROFILE], {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true,
  }).trim();
  assert(account === EXPECTED_ACCOUNT, "AWS account guard failed");
}

function loadPinnedManifest() {
  const bytes = fs.readFileSync(MANIFEST_PATH);
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  assert(digest === EXPECTED_MANIFEST_SHA256, "Read-only canonical manifest fingerprint changed");
  const manifest = JSON.parse(bytes.toString("utf8"));
  assert(manifest.readOnly === true && Array.isArray(manifest.users) && manifest.users.length === 30,
    "Canonical metadata manifest shape changed");
  const fixtures = fs.readFileSync(SALES_FIXTURE_PATH, "utf8");
  const users = manifest.users;
  const targets = users.slice(5);
  assert(targets.length === TARGET_COUNT, "Historical QA identity count changed");
  for (const user of targets) {
    assert(user.id && user.email && user.isActive === true && user.createdAt, "Historical identity metadata is incomplete");
    assert(user.email.endsWith("@scmayher.com") && fixtures.includes(`email: "${user.email}"`), "Identity is not a static sales-service fixture");
    assert(user.userRoles?.length === 1 && user.userRoles[0].role?.isActive === true, "Fixture role metadata is not exact");
    assert(["MANAGER", "SALES_EXECUTIVE", "WAREHOUSE_OPERATOR"].includes(user.userRoles[0].role.code), "Unexpected fixture role");
  }
  return { digest, users, targets };
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function publicTableFingerprints(tx) {
  const tables = await tx.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  const proof = {};
  for (const { table_name: tableName } of tables) {
    if (tableName === "User" || tableName === "AuditLog") continue;
    const table = `public.${quoteIdent(tableName)}`;
    const result = await tx.$queryRawUnsafe(
      `SELECT COUNT(*)::text AS row_count,
              md5(COALESCE(string_agg(md5(row_to_json(t)::text), ',' ORDER BY row_to_json(t)::text), '')) AS fingerprint
       FROM ${table} AS t`,
    );
    proof[tableName] = { rowCount: result[0].row_count, fingerprint: result[0].fingerprint };
  }
  return proof;
}

async function userForeignKeyCounts(tx, allUserIds, targetUserIds) {
  const constraints = await tx.$queryRaw`
    SELECT tc.table_name, tc.constraint_name, kcu.column_name, kcu.ordinal_position
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_schema = kcu.constraint_schema AND tc.constraint_name = kcu.constraint_name AND tc.table_name = kcu.table_name
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_schema = ccu.constraint_schema AND tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.constraint_schema = 'public'
      AND ccu.table_schema = 'public' AND ccu.table_name = 'User'
    ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position
  `;
  const grouped = new Map();
  for (const row of constraints) {
    const key = `${row.table_name}:${row.constraint_name}`;
    if (!grouped.has(key)) grouped.set(key, { table: row.table_name, constraint: row.constraint_name, columns: [] });
    grouped.get(key).columns.push(row.column_name);
  }
  const proof = {};
  for (const { table, constraint, columns } of grouped.values()) {
    const where = columns.map((column) => `${quoteIdent(column)} = ANY($1::text[])`).join(" AND ");
    const query = `SELECT COUNT(*)::text AS count FROM public.${quoteIdent(table)} WHERE ${where}`;
    const [allRefs, targetRefs] = await Promise.all([
      tx.$queryRawUnsafe(query, allUserIds),
      tx.$queryRawUnsafe(query, targetUserIds),
    ]);
    proof[`${table}.${constraint}`] = {
      allCanonicalUserRefs: allRefs[0].count,
      historicalFixtureRefs: targetRefs[0].count,
    };
  }
  return proof;
}

function verifyUnchanged(before, after, name) {
  const beforeKeys = Object.keys(before).sort();
  const afterKeys = Object.keys(after).sort();
  assert(JSON.stringify(beforeKeys) === JSON.stringify(afterKeys), `${name} relation/table inventory changed`);
  for (const key of beforeKeys) {
    assert(JSON.stringify(before[key]) === JSON.stringify(after[key]), `${name} changed outside permitted rows`);
  }
}

function verifyUserForeignKeyCounts(before, after) {
  const beforeKeys = Object.keys(before).sort();
  const afterKeys = Object.keys(after).sort();
  assert(JSON.stringify(beforeKeys) === JSON.stringify(afterKeys), "User foreign-key inventory changed");
  for (const key of beforeKeys) {
    const isAuditActorFk = key.startsWith("AuditLog.");
    const expectedAllRefs = (BigInt(before[key].allCanonicalUserRefs) + (isAuditActorFk ? BigInt(TARGET_COUNT) : 0n)).toString();
    assert(after[key].allCanonicalUserRefs === expectedAllRefs, "Unexpected change in canonical-user foreign-key counts");
    assert(after[key].historicalFixtureRefs === before[key].historicalFixtureRefs, "Historical fixture relations changed");
  }
}

async function main() {
  validateEnvironment();
  const { digest, users: manifestUsers, targets } = loadPinnedManifest();
  const prisma = new PrismaClient();
  try {
    const proof = await prisma.$transaction(async (tx) => {
      const allUsers = await tx.user.findMany({
        include: { userRoles: { include: { role: true } } },
      });
      assert(allUsers.length === 30, "Canonical user count changed; retirement aborted");
      const adminIdentity = manifestUsers[0];
      const admin = allUsers.find((user) => user.id === adminIdentity.id);
      assert(admin?.email === adminIdentity.email && admin.isActive === true
        && admin.userRoles.length === 1 && admin.userRoles[0].role.code === "SYSTEM_ADMIN"
        && admin.userRoles[0].role.isActive === true, "Trusted active system administrator was not found");

      for (const seed of manifestUsers.slice(0, 5)) {
        const actual = allUsers.find((user) => user.id === seed.id);
        assert(actual?.email === seed.email && actual.isActive === true
          && actual.userRoles.length === 1 && actual.userRoles[0].role.code === seed.userRoles[0].role.code
          && actual.userRoles[0].role.isActive === true, "Seed identity or role changed; retirement aborted");
      }
      const actualTargets = targets.map((expected) => {
        const actual = allUsers.find((user) => user.id === expected.id);
        const role = expected.userRoles[0].role.code;
        assert(actual?.email === expected.email && actual.isActive === true
          && actual.createdAt.toISOString() === new Date(expected.createdAt).toISOString()
          && actual.passwordHash === "test-hash"
          && actual.userRoles.length === 1 && actual.userRoles[0].role.code === role
          && actual.userRoles[0].role.isActive === true, "A target is not the exact active historical fixture; all changes aborted");
        return { expected, actual, role };
      });
      assert(allUsers.every((user) => manifestUsers.some((entry) => entry.id === user.id)), "An unmanifested user exists; retirement aborted");

      const userIds = allUsers.map((user) => user.id);
      const targetIds = targets.map((user) => user.id);
      const [fingerprintsBefore, foreignKeysBefore] = await Promise.all([
        publicTableFingerprints(tx),
        userForeignKeyCounts(tx, userIds, targetIds),
      ]);
      const changed = [];
      for (const { expected, actual, role } of actualTargets) {
        const result = await tx.user.updateMany({
          where: {
            id: expected.id,
            email: expected.email,
            createdAt: actual.createdAt,
            isActive: true,
            passwordHash: "test-hash",
          },
          data: { isActive: false },
        });
        assert(result.count === 1, "Concurrent target update detected; retirement transaction aborted");
        await tx.auditLog.create({
          data: {
            entityType: "USER",
            entityId: expected.id,
            action: "USER_DEACTIVATE",
            actor: admin.name,
            actorUserId: admin.id,
            source: SOURCE,
            before: JSON.stringify({ id: expected.id, email: expected.email, isActive: true, role, createdAt: actual.createdAt.toISOString() }),
            after: JSON.stringify({ id: expected.id, email: expected.email, isActive: false, role, reason: REASON, runId: process.env[RUN_ID_ENV] }),
          },
        });
        changed.push({ id: expected.id, email: expected.email, role, beforeActive: true, afterActive: false });
      }

      const currentUsers = await tx.user.findMany({
        include: { userRoles: { include: { role: true } } },
      });
      assert(currentUsers.length === 30, "User count changed during retirement");
      for (const seed of manifestUsers.slice(0, 5)) {
        const current = currentUsers.find((user) => user.id === seed.id);
        assert(current?.email === seed.email && current.isActive === true
          && current.userRoles.length === 1 && current.userRoles[0].role.code === seed.userRoles[0].role.code,
        "A seed identity or role changed during retirement");
      }
      for (const target of targets) {
        const current = currentUsers.find((user) => user.id === target.id);
        assert(current?.email === target.email && current.isActive === false
          && current.userRoles.length === 1 && current.userRoles[0].role.code === target.userRoles[0].role.code,
        "A target's identity/role did not persist as expected");
      }
      const [fingerprintsAfter, foreignKeysAfter, addedAuditRows] = await Promise.all([
        publicTableFingerprints(tx),
        userForeignKeyCounts(tx, userIds, targetIds),
        tx.auditLog.count({ where: {
          actorUserId: admin.id, action: "USER_DEACTIVATE", source: SOURCE,
          entityId: { in: targetIds }, after: { contains: process.env[RUN_ID_ENV] },
        } }),
      ]);
      verifyUnchanged(fingerprintsBefore, fingerprintsAfter, "Non-User/AuditLog public tables");
      verifyUserForeignKeyCounts(foreignKeysBefore, foreignKeysAfter);
      assert(addedAuditRows === TARGET_COUNT, "Audit event count differs from target count");
      return {
        runId: process.env[RUN_ID_ENV],
        sourceManifest: { path: "output/aws-canonical-user-metadata-20260930.json", sha256: digest, rows: manifestUsers.length },
        actor: { id: admin.id, email: admin.email, role: "SYSTEM_ADMIN" },
        users: { before: 30, after: 30, seedsPreserved: 5, historicalTargetsRetired: changed.length, identities: changed },
        auditsAdded: addedAuditRows,
        userForeignKeyCountsBefore: foreignKeysBefore,
        userForeignKeyCountsAfter: foreignKeysAfter,
        otherPublicTableFingerprintsBefore: fingerprintsBefore,
        otherPublicTableFingerprintsAfter: fingerprintsAfter,
      };
    }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 60000 });
    process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`Historical test-user retirement aborted (${error?.code ?? error?.name ?? "error"}); details suppressed.\n`);
  process.exitCode = 1;
});
