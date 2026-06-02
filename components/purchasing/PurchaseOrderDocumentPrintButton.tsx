"use client";

export function PurchaseOrderDocumentPrintButton() {
  return (
    <button
      type="button"
      className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white"
      onClick={() => window.print()}
    >
      Imprimir / Guardar PDF
    </button>
  );
}
