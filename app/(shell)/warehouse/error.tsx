"use client";

export default function WarehouseError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-xl mx-auto mt-12 glass-card border border-red-500/30 space-y-4 text-center">
      <p className="text-2xl">⚠️</p>
      <h2 className="text-xl font-bold text-red-300">Error en Almacenes</h2>
      <p className="text-slate-400 text-sm">{error.message || "Ocurrió un error inesperado al cargar los almacenes."}</p>
      <button onClick={reset} className="btn-primary text-sm px-6 py-2">Reintentar</button>
    </div>
  );
}
