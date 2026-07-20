"use client";

import { useRef, useState, type FormEvent } from "react";

type ReceivingLocation = {
  id: string;
  code: string;
  warehouseName: string;
};

type PendingLine = {
  id: string;
  sku: string;
  name: string;
  pending: number;
  unitLabel: string;
  step: number;
};

export function PurchaseReceiptForm({
  action,
  cancelHref,
  locations,
  lines,
}: {
  action: (formData: FormData) => void;
  cancelHref: string;
  locations: ReceivingLocation[];
  lines: PendingLine[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const confirmationSubmittedRef = useRef(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState<{
    location: string;
    total: number;
    lines: number;
    discrepancyLines: number;
    discrepancyUnits: number;
  } | null>(null);

  function receiveAllPending() {
    const form = formRef.current;
    if (!form) return;
    lines.forEach((line) => {
      const input = form.elements.namedItem(`qty_${line.id}`) as HTMLInputElement | null;
      if (input) input.value = String(line.pending);
    });
  }

  function openReview(event: FormEvent<HTMLFormElement>) {
    if (confirmationSubmittedRef.current) return;
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const locationId = String(data.get("locationId") ?? "");
    const location = locations.find((item) => item.id === locationId);
    const lineReview = lines.map((line) => {
      const good = Number(String(data.get(`qty_${line.id}`) ?? "0")) || 0;
      const discrepancy = ["dmg", "missing", "rejected", "surplus"]
        .map((field) => Number(String(data.get(`${field}_${line.id}`) ?? "0")) || 0)
        .reduce((sum, qty) => sum + qty, 0);
      return { good, discrepancy };
    });

    setReview({
      location: location ? `${location.warehouseName} — ${location.code}` : "Sin ubicación seleccionada",
      total: lineReview.reduce((sum, line) => sum + line.good, 0),
      lines: lineReview.filter((line) => line.good > 0).length,
      discrepancyLines: lineReview.filter((line) => line.discrepancy > 0).length,
      discrepancyUnits: lineReview.reduce((sum, line) => sum + line.discrepancy, 0),
    });
    setReviewOpen(true);
  }

  function confirmReceipt() {
    confirmationSubmittedRef.current = true;
    setReviewOpen(false);
    window.setTimeout(() => formRef.current?.requestSubmit(), 0);
  }

  return (
    <form ref={formRef} action={action} onSubmit={openReview} className="space-y-5">
      <section className="glass-card space-y-4">
        <div>
          <h2 className="border-b border-white/10 pb-2 text-base font-bold">Datos de recepción</h2>
          <p className="mt-2 text-sm text-slate-300">Selecciona la zona donde estás contando la mercancía.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm text-slate-300">Zona de recepción *</span>
            <select name="locationId" required className="glass w-full rounded-lg px-4 py-3">
              <option value="">Seleccionar zona de recepción…</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.warehouseName} — {location.code}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-300">Remisión / factura</span>
            <input name="referenceDoc" maxLength={100} placeholder="REM-2026-001" className="glass w-full rounded-lg px-4 py-3" />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-sm text-slate-300">Notas de recepción</span>
          <textarea name="notes" placeholder="Observaciones generales de transporte o entrega" className="glass min-h-[96px] w-full rounded-lg px-4 py-3" />
        </label>
      </section>

      <section className="glass-card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <h2 className="text-base font-bold">Artículos pendientes <span className="font-normal text-slate-300">({lines.length} líneas)</span></h2>
            <p className="mt-1 text-sm text-slate-300">Escribe lo contado físicamente. Ninguna línea se recibe hasta confirmar el resumen.</p>
          </div>
          <button type="button" onClick={receiveAllPending} className="rounded-lg border border-cyan-400/40 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            Recibir todo lo pendiente
          </button>
        </div>

        <div className="space-y-3">
          {lines.map((line) => (
            <article key={line.id} className="rounded-xl border border-white/10 bg-slate-950/20 p-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_7rem] sm:items-end">
                <div>
                  <p className="font-mono text-xs text-cyan-300">{line.sku}</p>
                  <p className="mt-1 text-sm font-medium text-white">{line.name}</p>
                </div>
                <p className="text-sm text-slate-300">Pendiente <span className="block text-lg font-semibold text-amber-300">{line.pending} {line.unitLabel}</span></p>
                <label className="space-y-1">
                  <span className="text-sm text-slate-300">En buen estado</span>
                  <input name={`qty_${line.id}`} type="number" min="0" max={line.pending} step={line.step} defaultValue="0" inputMode="decimal" className="glass w-full rounded-lg px-3 py-2 text-right" />
                </label>
              </div>
              <details className="mt-3 rounded-lg border border-white/10 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">Registrar diferencia de esta línea</summary>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <label className="text-xs text-slate-300">Dañado<input name={`dmg_${line.id}`} type="number" min="0" step={line.step} defaultValue="0" inputMode="decimal" className="glass mt-1 w-full rounded-lg px-2 py-2 text-right" /></label>
                  <label className="text-xs text-slate-300">Faltante<input name={`missing_${line.id}`} type="number" min="0" step={line.step} defaultValue="0" inputMode="decimal" className="glass mt-1 w-full rounded-lg px-2 py-2 text-right" /></label>
                  <label className="text-xs text-slate-300">Rechazado<input name={`rejected_${line.id}`} type="number" min="0" step={line.step} defaultValue="0" inputMode="decimal" className="glass mt-1 w-full rounded-lg px-2 py-2 text-right" /></label>
                  <label className="text-xs text-slate-300">Sobrante<input name={`surplus_${line.id}`} type="number" min="0" step={line.step} defaultValue="0" inputMode="decimal" className="glass mt-1 w-full rounded-lg px-2 py-2 text-right" /></label>
                </div>
                <label className="mt-3 block text-xs text-slate-300">Motivo de la diferencia<textarea name={`reason_${line.id}`} maxLength={500} placeholder="Ej. empaque dañado o faltante del proveedor" className="glass mt-1 min-h-20 w-full rounded-lg px-3 py-2" /></label>
              </details>
            </article>
          ))}
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <a href={cancelHref} className="rounded-lg border border-white/20 px-4 py-2 text-center text-slate-100 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">Cancelar</a>
        <button type="submit" className="btn-primary">Revisar recepción</button>
      </div>

      {reviewOpen && review ? (
        <div role="dialog" aria-modal="true" aria-labelledby="receipt-review-title" className="fixed inset-0 z-50 grid place-items-end bg-slate-950/75 p-4 sm:place-items-center">
          <div className="w-full max-w-md rounded-2xl border border-cyan-300/30 bg-slate-900 p-5 shadow-2xl">
            <h2 id="receipt-review-title" className="text-lg font-semibold text-white">Confirmar recepción</h2>
            <dl className="mt-4 space-y-2 text-sm text-slate-200">
              <div className="flex justify-between gap-4"><dt>Zona</dt><dd className="text-right font-medium">{review.location}</dd></div>
              <div className="flex justify-between gap-4"><dt>Líneas con recepción</dt><dd className="font-medium">{review.lines}</dd></div>
              <div className="flex justify-between gap-4"><dt>Total bueno</dt><dd className="font-medium">{review.total}</dd></div>
              <div className="flex justify-between gap-4"><dt>Líneas con diferencia</dt><dd className="font-medium">{review.discrepancyLines}</dd></div>
              <div className="flex justify-between gap-4"><dt>Unidades con diferencia</dt><dd className="font-medium">{review.discrepancyUnits}</dd></div>
            </dl>
            <p className="mt-4 text-sm text-slate-300">Al confirmar, las piezas en buen estado entrarán al inventario y se prepararán sus etiquetas.</p>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setReviewOpen(false)} className="rounded-lg border border-white/20 px-4 py-2 text-slate-100 hover:bg-white/10">Volver a revisar</button>
              <button type="button" onClick={confirmReceipt} className="btn-primary">Confirmar recepción</button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
