import prisma from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

type SyncDb = PrismaClient | Prisma.TransactionClient;
const SYNC_EVENTS_DISABLED_IN_WEB = process.env.WMS_DISABLE_SYNC_EVENTS_IN_WEB === "true";

export type SyncEntityType = "INVENTORY" | "PRODUCT" | "ORDER" | "MOVEMENT";
export type SyncAction = "CREATE" | "UPDATE" | "DELETE";

interface EmitSyncEventPayload {
  entityType: SyncEntityType;
  entityId: string;
  action: SyncAction;
  payload: unknown;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

/**
 * Emit a sync event inside the given transaction (or standalone).
 * Non-blocking: errors are swallowed so warehouse operations are never interrupted.
 */
export async function emitSyncEvent(
  data: EmitSyncEventPayload,
  db: SyncDb = prisma,
): Promise<void> {
  if (SYNC_EVENTS_DISABLED_IN_WEB) {
    return;
  }

  try {
    await db.syncEvent.create({
      data: {
        entityType: data.entityType,
        entityId: data.entityId,
        action: data.action,
        payload: safeStringify(data.payload),
        status: "PENDING",
      },
    });
  } catch {
    // Never block warehouse operations due to sync failures.
  }
}

/**
 * Convenience wrapper: emit inside an existing Prisma transaction, non-blocking.
 */
export async function emitSyncEventSafe(
  data: EmitSyncEventPayload,
  db?: SyncDb,
): Promise<void> {
  try {
    await emitSyncEvent(data, db);
  } catch {
    // Double safety net — should never reach here.
  }
}

/**
 * Fetch pending sync events ordered by creation time.
 */
export async function getPendingSyncEvents(limit = 10) {
  return prisma.syncEvent.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

/**
 * Mark a batch of sync events as SENT.
 */
export async function markSyncEventsSent(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.syncEvent.updateMany({
    where: { id: { in: ids } },
    data: { status: "SENT", processedAt: new Date() },
  });
}

/**
 * Mark a single sync event as FAILED with error detail.
 */
export async function markSyncEventFailed(id: string, error: string) {
  await prisma.syncEvent.update({
    where: { id },
    data: {
      status: "FAILED",
      error,
      retryCount: { increment: 1 },
      processedAt: new Date(),
    },
  });
}

/**
 * Reset FAILED events back to PENDING for retry (max retryCount threshold).
 */
export async function retryFailedSyncEvents(maxRetries = 5) {
  await prisma.syncEvent.updateMany({
    where: {
      status: "FAILED",
      retryCount: { lt: maxRetries },
    },
    data: { status: "PENDING", processedAt: null },
  });
}

/**
 * Purge old SENT/ACKED events older than the given number of days.
 */
export async function purgeSyncEvents(olderThanDays = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);
  await prisma.syncEvent.deleteMany({
    where: {
      status: { in: ["SENT", "ACKED"] },
      createdAt: { lt: cutoff },
    },
  });
}
