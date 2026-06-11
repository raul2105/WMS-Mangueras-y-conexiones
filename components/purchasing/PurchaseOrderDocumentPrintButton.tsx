"use client";

import { buttonStyles } from "@/components/ui/button";

export function PurchaseOrderDocumentPrintButton() {
  return (
    <button
      type="button"
      className={buttonStyles({ variant: "secondary", size: "md" })}
      onClick={() => window.print()}
    >
      Imprimir / Guardar PDF
    </button>
  );
}
