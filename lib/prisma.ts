import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

function resolveSqliteDbPath(databaseUrl: string | undefined): string | null {
  if (!databaseUrl?.startsWith("file:")) {
    return null;
  }

  let rawPath = decodeURIComponent(databaseUrl.slice(5));
  if (!rawPath) {
    return null;
  }

  if (/^\/[A-Za-z]:\//.test(rawPath)) {
    rawPath = rawPath.slice(1);
  }

  rawPath = rawPath.replace(/\//g, path.sep);

  if (path.isAbsolute(rawPath)) {
    return path.normalize(rawPath);
  }

  return path.resolve(process.cwd(), "prisma", rawPath);
}

function createPrismaClient() {
  const releaseDatabasePath = process.env.WMS_DB_PATH ? path.resolve(process.env.WMS_DB_PATH) : null;
  if (releaseDatabasePath && !fs.existsSync(releaseDatabasePath)) {
    throw new Error(
      `SQLite database not found at ${releaseDatabasePath}. Run init-local.cmd before starting the release.`
    );
  }

  return new PrismaClient();
}

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prisma = globalThis.prisma ?? createPrismaClient();
const resolvedDatabasePath = resolveSqliteDbPath(process.env.DATABASE_URL);

const prismaReady = (async () => {
  if (!resolvedDatabasePath) {
    return prisma;
  }

  const busyTimeoutMs = Number.parseInt(process.env.SQLITE_BUSY_TIMEOUT_MS ?? "5000", 10);
  const timeoutValue = Number.isFinite(busyTimeoutMs) ? busyTimeoutMs : 5000;

  await prisma.$connect();
  await prisma.$queryRawUnsafe("PRAGMA foreign_keys = ON");
  await prisma.$queryRawUnsafe(`PRAGMA busy_timeout = ${timeoutValue}`);
  await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");
  await prisma.$queryRawUnsafe("PRAGMA synchronous = NORMAL");
  await prisma.$queryRawUnsafe("PRAGMA wal_autocheckpoint = 1000");

  return prisma;
})().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[prisma] SQLite initialization failed for ${resolvedDatabasePath ?? "unknown"}: ${message}`);
  throw error;
});

void prismaReady.catch(() => undefined);

export default prisma;
export { prismaReady, resolvedDatabasePath };

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}
