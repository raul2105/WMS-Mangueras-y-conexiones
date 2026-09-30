"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonStyles } from "@/components/ui/button";

type GeneratedProposal = { status: "PROPOSED" | "BLOCKED" | "NO_ACTION" };
type GenerateResponse = { proposals?: GeneratedProposal[]; error?: string };

export function ReplenishmentProposalRefresh() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshProposals() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/purchasing/replenishment/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const payload = await response.json() as GenerateResponse;
      if (!response.ok || !Array.isArray(payload.proposals)) {
        throw new Error(payload.error ?? "No se pudieron actualizar las propuestas de reabasto.");
      }

      const actionable = payload.proposals.filter((proposal) => proposal.status === "PROPOSED").length;
      const blocked = payload.proposals.filter((proposal) => proposal.status === "BLOCKED").length;
      const reviewed = payload.proposals.length;
      setMessage(
        `Revisión completada: ${reviewed} políticas, ${actionable} propuestas para decidir y ${blocked} bloqueadas.`,
      );
      router.replace("/purchasing?proposalPage=1");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron actualizar las propuestas de reabasto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" className={buttonStyles({ variant: "secondary", size: "sm" })} onClick={refreshProposals} disabled={busy}>
        {busy ? "Actualizando…" : "Actualizar propuestas"}
      </button>
      {message ? <p role="status" aria-live="polite" className="text-xs text-[var(--status-success-text)]">{message}</p> : null}
      {error ? <p role="alert" className="text-xs text-[var(--status-danger-text)]">{error}</p> : null}
    </div>
  );
}
