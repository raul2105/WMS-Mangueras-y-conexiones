import prisma, { prismaReady, resolvedDatabasePath } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const service = "wms-scmayher";
  const version = process.env.APP_VERSION ?? process.env.npm_package_version ?? "unknown";
  const environment = process.env.WMS_ENVIRONMENT ?? process.env.WMS_ENV ?? process.env.NODE_ENV ?? "unknown";
  const commitSha = process.env.WMS_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "unknown";
  const releaseId = process.env.WMS_RELEASE_ID ?? `${version}-${commitSha.slice(0, 12)}`;
  const timestamp = new Date().toISOString();
  const dbInfo =
    process.env.WMS_DB_PATH ??
    resolvedDatabasePath ??
    process.env.DATABASE_URL?.replace(/\/\/.*@/, "//***@") ??
    "unknown";

  try {
    await prismaReady;
    await prisma.$queryRaw`SELECT 1`;
    return Response.json(
      {
        ok: true,
        service,
        version,
        environment,
        commitSha,
        releaseId,
        db: "up",
        dbInfo,
        timestamp,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return Response.json(
      {
        ok: false,
        service,
        version,
        environment,
        commitSha,
        releaseId,
        db: "down",
        dbInfo,
        error: message,
        timestamp,
      },
      { status: 503 }
    );
  }
}
