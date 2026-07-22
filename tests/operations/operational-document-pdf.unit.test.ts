import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { buildOperationalDocumentFilename, OperationalDocumentPdf } from "@/lib/operations/operational-document-pdf";

describe("operational document PDFs", () => {
  it("uses safe, traceable filenames", () => {
    expect(buildOperationalDocumentFilename("entrega", "PI-2026/0001")).toBe("entrega-PI-2026-0001.pdf");
  });

  it("renders a readable PDF with the operational folio", async () => {
    const pdf = await renderToBuffer(
      React.createElement(OperationalDocumentPdf, {
        snapshot: {
          title: "Comprobante de entrega",
          folio: "PI-2026-0001",
          status: "Entregado al cliente",
          generatedAt: new Date("2026-07-21T12:00:00Z"),
          warehouse: "WH-01 - Almacén Principal",
          location: "DESP-01 - Entregas",
          lines: [{ sku: "SKU-DE-TRAZABILIDAD-MUY-LARGO-001", name: "Manguera hidráulica", quantity: 2, unit: "m" }],
        },
      }) as Parameters<typeof renderToBuffer>[0],
    );
    expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.byteLength).toBeGreaterThan(800);
  });
});
