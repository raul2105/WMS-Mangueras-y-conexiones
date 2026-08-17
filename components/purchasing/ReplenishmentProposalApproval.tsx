"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonStyles } from "@/components/ui/button";

export function ReplenishmentProposalApproval({ proposalId }: { proposalId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/purchasing/replenishment/proposals/${proposalId}/approve`, { method: "POST" });
      const payload = (await response.json()) as { purchaseOrderId?: string; error?: string };
      if (!response.ok || !payload.purchaseOrderId) throw new Error(payload.error ?? "No se pudo convertir la propuesta");
      router.push(`/purchasing/orders/${payload.purchaseOrderId}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo convertir la propuesta");
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <button type="button" className={buttonStyles({ variant: "primary", size: "sm" })} onClick={approve} disabled={busy}>
        {busy ? "Convirtiendo…" : "Aprobar y crear OC"}
      </button>
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
      <Link href="/purchasing/orders" className="block text-xs font-semibold text-[var(--status-info)] hover:underline">
        Revisar órdenes
      </Link>
    </div>
  );
}
