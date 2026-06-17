import type { SessionContext } from "@/lib/auth/session-context";

export type AuthenticatedActor = {
  actorUserId: string | null;
  actorName: string | null;
  operatorName: string | null;
};

export function resolveAuthenticatedActor(
  sessionCtx: SessionContext,
  operatorAlias?: string | null,
): AuthenticatedActor {
  const actorUserId = sessionCtx.user?.id ?? null;
  const actorName = sessionCtx.user?.name ?? sessionCtx.user?.email ?? null;
  const alias = typeof operatorAlias === "string" ? operatorAlias.trim() : "";

  return {
    actorUserId,
    actorName,
    operatorName: alias || actorName,
  };
}
