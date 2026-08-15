"use client";

export default function PurchasingError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="op-panel mx-auto mt-12 max-w-xl space-y-4 border-[var(--status-danger-border)] text-center">
      <p className="text-2xl" aria-hidden="true">⚠️</p>
      <h2 className="text-xl font-bold text-[var(--status-danger-text)]">Error en Compras</h2>
      <p className="text-sm text-[var(--text-secondary)]">
        {error.message || "Ocurrió un error inesperado al cargar el módulo de compras."}
      </p>
      <button onClick={reset} className="btn-primary px-6 py-2 text-sm">Reintentar</button>
    </div>
  );
}
