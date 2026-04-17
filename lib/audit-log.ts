import prisma from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

type AuditPayload = {
  entityType: string;
  entityId?: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
  actor?: string | null;
  actorUserId?: string | null;
  source?: string | null;
};

type AuditDb = PrismaClient | Prisma.TransactionClient;

function safeStringify(value: unknown) {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export async function createAuditLog(payload: AuditPayload, db: AuditDb = prisma) {
  await db.auditLog.create({
    data: {
      entityType: payload.entityType,
      entityId: payload.entityId ?? null,
      action: payload.action,
      before: safeStringify(payload.before),
      after: safeStringify(payload.after),
      actor: payload.actor ?? null,
      actorUserId: payload.actorUserId ?? null,
      source: payload.source ?? null,
    },
  });
}

export async function createAuditLogSafe(payload: AuditPayload) {
  try {
    await createAuditLog(payload);
  } catch {
    // Never block warehouse operation due to audit failures.
  }
}

export async function createAuditLogSafeWithDb(payload: AuditPayload, db: AuditDb) {
  try {
    await createAuditLog(payload, db);
  } catch {
    // Never block warehouse operation due to audit failures.
  }
}

