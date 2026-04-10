import prisma, { prismaReady, resolvedDatabasePath } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const service = "wms-scmayher";
  const version = process.env.npm_package_version ?? "unknown";
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
        db: "down",
        dbInfo,
        error: message,
        timestamp,
      },
      { status: 503 }
    );
  }
}
