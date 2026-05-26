import { NextResponse } from "next/server";
import { getSnapshot, clearSnapshot } from "@/lib/perf-snapshot";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  await requirePermission("audit.view");
  if (process.env.NODE_ENV === "production" && process.env.PERF_SNAPSHOT_ENABLED !== "true") {
    return NextResponse.json({ error: "disabled in production" }, { status: 404 });
  }
  return NextResponse.json(getSnapshot());
}

export async function DELETE() {
  await requirePermission("audit.view");
  if (process.env.NODE_ENV === "production" && process.env.PERF_SNAPSHOT_ENABLED !== "true") {
    return NextResponse.json({ error: "disabled in production" }, { status: 404 });
  }
  clearSnapshot();
  return NextResponse.json({ cleared: true });
}
