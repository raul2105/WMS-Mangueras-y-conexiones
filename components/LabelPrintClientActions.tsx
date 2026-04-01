"use client";

export default function LabelPrintClientActions() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn-primary"
    >
      Imprimir
    </button>
  );
}

