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

/**
 * Critical mutations must be atomic with their audit record.  Callers should
 * invoke this inside the same Prisma transaction as the state change.
 */
export async function createAuditLogRequired(payload: AuditPayload, db: AuditDb = prisma) {
  return createAuditLog(payload, db);
}

export async function createAuditLogRequiredWithDb(payload: AuditPayload, db: AuditDb) {
  return createAuditLog(payload, db);
}

/**
 * Legacy name retained for existing callers.  It is intentionally no longer
 * best-effort: swallowing an audit failure makes a warehouse mutation
 * impossible to reconcile and violates the operational audit contract.
 */
export async function createAuditLogSafe(payload: AuditPayload) {
  return createAuditLogRequired(payload);
}

export async function createAuditLogSafeWithDb(payload: AuditPayload, db: AuditDb) {
  return createAuditLogRequiredWithDb(payload, db);
}

