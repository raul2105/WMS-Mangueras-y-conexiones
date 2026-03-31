import prisma from "@/lib/prisma";

type AuditPayload = {
  entityType: string;
  entityId?: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
  actor?: string | null;
  source?: string | null;
};

function safeStringify(value: unknown) {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export async function createAuditLog(payload: AuditPayload) {
  await prisma.auditLog.create({
    data: {
      entityType: payload.entityType,
      entityId: payload.entityId ?? null,
      action: payload.action,
      before: safeStringify(payload.before),
      after: safeStringify(payload.after),
      actor: payload.actor ?? null,
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

