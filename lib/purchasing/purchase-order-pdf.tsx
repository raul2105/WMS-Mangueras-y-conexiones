import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";
import type { PurchaseOrderDocumentSnapshot } from "@/lib/purchasing/purchase-order-document-service";

/**
 * Generate a PO PDF from the frozen document snapshot and return the raw bytes as ArrayBuffer
 */
export async function buildPurchaseOrderPdf(input: {
  documentSnapshot: PurchaseOrderDocumentSnapshot;
  purchaseOrderFolio: string;
}): Promise<{ pdfArrayBuffer: ArrayBuffer; filename: string }> {
  const { documentSnapshot, purchaseOrderFolio } = input;
  const pdfBuffer = await renderToBuffer(
    React.createElement(PurchaseOrderPdfDocument, { snapshot: documentSnapshot }) as React.ReactElement<Record<string, unknown>>,
  );
  const filename = buildPurchaseOrderPdfFilename(purchaseOrderFolio);
  // Convert Buffer to ArrayBuffer properly
  const arrayBuffer = pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength);
  return { pdfArrayBuffer: arrayBuffer as ArrayBuffer, filename };
}

export function buildPurchaseOrderPdfFilename(folio: string): string {
  const normalizedFolio = String(folio ?? "").trim();
  const prefixedFolio = normalizedFolio.startsWith("OC-") ? normalizedFolio : `OC-${normalizedFolio}`;
  const safeBase = prefixedFolio
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");

  return `${safeBase || "OC-orden-compra"}.pdf`;
}

export function getSupplierDisplayLines(supplier: PurchaseOrderDocumentSnapshot["supplier"]) {
  const primary = supplier.businessName || supplier.legalName || supplier.name || "—";
  const secondary = supplier.legalName && supplier.legalName !== primary
    ? supplier.legalName
    : supplier.name && supplier.name !== primary && supplier.name !== supplier.legalName
      ? supplier.name
      : null;

  return { primary, secondary };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatSingleLineText(value: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "—";
  return normalized.replace(/\s+/g, "\u00A0");
}

export function getPurchaseOrderPdfLineTypography(line: Pick<PurchaseOrderDocumentSnapshot["lines"][number], "sku" | "name">) {
  const sku = String(line.sku ?? "").trim();
  const name = String(line.name ?? "").trim();
  const nameLength = name.length;

  const skuFontSize = clamp(6.9 - Math.max(0, sku.length - 18) * 0.03, 5.6, 6.9);
  const productFontSize = clamp(8.0 - Math.max(0, nameLength - 52) * 0.025, 6.7, 8.0);

  return {
    skuFontSize,
    skuLineHeight: 1,
    productFontSize,
    productLineHeight: 1.02,
    rowMinHeight: nameLength > 135 ? 36 : nameLength > 90 ? 30 : nameLength > 55 ? 26 : 22,
  };
}

export function injectSoftBreaks(value: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "—";

  const withSeparatorBreaks = normalized.replace(/([/._-])/g, "$1\u200B");

  if (withSeparatorBreaks.includes(" ")) {
    return withSeparatorBreaks;
  }

  return withSeparatorBreaks.replace(/(.{8})(?=.)/g, "$1\u200B");
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8.2,
    paddingTop: 22,
    paddingHorizontal: 18,
    paddingBottom: 20,
    color: "#0f172a",
    backgroundColor: "#f8fafc",
  },
  header: {
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#94a3b8",
    borderBottomStyle: "solid",
  },
  headerAccent: {
    width: 64,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#1d4ed8",
    marginBottom: 8,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 6,
  },
  headerTitleBlock: {
    flexGrow: 1,
    flexBasis: 0,
  },
  headerTitleRight: {
    flexGrow: 0,
    flexShrink: 0,
    alignItems: "flex-end",
  },
  headerFolio: {
    fontSize: 10.5,
    fontWeight: 700,
    color: "#0f172a",
    textAlign: "right",
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: "#0f172a",
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 10,
    color: "#475569",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    color: "#475569",
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 9.8,
    fontWeight: 700,
    marginBottom: 5,
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  card: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderStyle: "solid",
    borderRadius: 4,
    padding: 9,
    backgroundColor: "#ffffff",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  column: {
    flexGrow: 1,
    flexBasis: 0,
  },
  textMuted: {
    color: "#475569",
  },
  smallMuted: {
    color: "#64748b",
    fontSize: 7.8,
  },
  lineTable: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderStyle: "solid",
    borderRadius: 4,
    overflow: "hidden",
  },
  lineHeader: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    borderBottomWidth: 1,
    borderBottomColor: "#94a3b8",
    borderBottomStyle: "solid",
  },
  lineCell: {
    paddingVertical: 4.5,
    paddingHorizontal: 4,
    borderRightWidth: 1,
    borderRightColor: "#dbe3ea",
    borderRightStyle: "solid",
    justifyContent: "flex-start",
    overflow: "hidden",
  },
  lineBody: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    borderBottomStyle: "solid",
    alignItems: "stretch",
    backgroundColor: "#ffffff",
  },
  lineBodyLast: {
    borderBottomWidth: 0,
  },
  lineBodyAlt: {
    backgroundColor: "#f8fafc",
  },
  lineSku: {
    width: "15%",
  },
  lineProduct: {
    width: "34%",
  },
  lineQty: {
    width: "10%",
    textAlign: "right",
  },
  lineUnit: {
    width: "8%",
    textAlign: "center",
  },
  lineMoney: {
    width: "16.5%",
    textAlign: "right",
  },
  lineHeaderText: {
    fontSize: 8.2,
    fontWeight: 700,
    color: "#0f172a",
    lineHeight: 1.1,
  },
  lineQtyHeaderText: {
    fontSize: 7.4,
    fontWeight: 700,
    color: "#0f172a",
    lineHeight: 1,
  },
  lineSkuText: {
    fontFamily: "Courier",
    fontSize: 5.8,
    lineHeight: 0.98,
    color: "#0f172a",
  },
  lineProductText: {
    fontSize: 7.8,
    lineHeight: 1.0,
    color: "#0f172a",
  },
  lineQtyText: {
    fontSize: 7.8,
    lineHeight: 1,
    color: "#0f172a",
  },
  lineUnitText: {
    fontSize: 7.6,
    lineHeight: 1,
    color: "#0f172a",
  },
  lineMoneyText: {
    fontSize: 7.6,
    lineHeight: 1,
    color: "#0f172a",
  },
  totalsBox: {
    width: 170,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderStyle: "solid",
    borderRadius: 4,
    padding: 9,
    backgroundColor: "#ffffff",
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
    color: "#0f172a",
  },
  signatureSection: {
    marginTop: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 20,
  },
  signatureBlock: {
    flexGrow: 1,
    flexBasis: 0,
    alignItems: "center",
    paddingTop: 34,
  },
  signatureLine: {
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: "#475569",
    borderTopStyle: "solid",
    marginBottom: 7,
  },
  signatureLabel: {
    fontSize: 8.6,
    fontWeight: 700,
    color: "#0f172a",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  footer: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    color: "#64748b",
    fontSize: 7.8,
  },
  documentInfoBand: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderStyle: "solid",
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#ffffff",
  },
  documentInfoItem: {
    flexGrow: 1,
    flexBasis: 0,
    paddingVertical: 8.5,
    paddingHorizontal: 10,
  },
  documentInfoDivider: {
    width: 1,
    backgroundColor: "#dbe3ea",
  },
  documentInfoLabel: {
    fontSize: 6.7,
    fontWeight: 700,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  documentInfoValue: {
    fontSize: 8.7,
    color: "#0f172a",
    lineHeight: 1.05,
  },
  documentBottomBand: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: 10,
    marginBottom: 2,
    gap: 18,
  },
  documentNotesSection: {
    flexGrow: 1,
    flexBasis: 0,
  },
  documentNotesCard: {
    minHeight: 58,
  },
  documentTotalsSection: {
    flexGrow: 0,
    flexShrink: 0,
    width: 170,
    alignItems: "flex-end",
  },
  documentTotalsRowLast: {
    marginBottom: 0,
  },
  documentTotalsEmphasis: {
    paddingTop: 3,
    marginTop: 1,
    borderTopWidth: 1,
    borderTopColor: "#cbd5e1",
    borderTopStyle: "solid",
    backgroundColor: "#eff6ff",
  },
  documentTotalsLabel: {
    fontSize: 8,
    color: "#0f172a",
  },
  documentTotalsValue: {
    fontSize: 8,
    color: "#0f172a",
    fontWeight: 700,
  },
  supplierPrimary: {
    fontSize: 10,
    fontWeight: 700,
    color: "#0f172a",
  },
});

function money(value: number, currency: string) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("es-MX");
}

export function PurchaseOrderPdfDocument({ snapshot }: { snapshot: PurchaseOrderDocumentSnapshot }) {
  const supplierLines = getSupplierDisplayLines(snapshot.supplier);
  const subtotal = snapshot.totals.subtotal;
  const iva = Number((subtotal * 0.16).toFixed(2));
  const total = Number((subtotal + iva).toFixed(2));
  return (
    <Document>
      <Page size="LETTER" orientation="portrait" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerAccent} />
          <View style={styles.headerTop}>
            <View style={styles.headerTitleBlock}>
              <Text style={styles.title}>Orden de Compra</Text>
            </View>
            <View style={styles.headerTitleRight}>
              <Text style={styles.headerFolio}>Folio: {snapshot.purchaseOrder.folio}</Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            <Text>Fecha de emisión: {new Date(snapshot.generatedAt).toLocaleString("es-MX")}</Text>
            <Text>Versión documento: v{snapshot.documentVersion}</Text>
          </View>
        </View>

        <View style={[styles.row, { marginTop: 10 }]}>
          <View style={[styles.section, styles.column]}>
            <Text style={styles.sectionTitle}>Comprador</Text>
            <View style={styles.card}>
              <Text style={styles.supplierPrimary}>WMS Mangueras y Conexiones</Text>
              <Text style={styles.textMuted}>RFC: Por definir</Text>
              <Text style={styles.textMuted}>Dirección: Por definir</Text>
              <Text style={styles.textMuted}>Contacto: Por definir</Text>
            </View>
          </View>
          <View style={[styles.section, styles.column]}>
            <Text style={styles.sectionTitle}>Proveedor</Text>
            <View style={styles.card}>
              <Text style={styles.supplierPrimary}>{supplierLines.primary}</Text>
              {supplierLines.secondary ? <Text style={styles.textMuted}>{supplierLines.secondary}</Text> : null}
              <Text style={styles.textMuted}>Código: {snapshot.supplier.code}</Text>
              <Text style={styles.textMuted}>RFC: {snapshot.supplier.taxId ?? "—"}</Text>
              <Text style={styles.textMuted}>Correo: {snapshot.supplier.email ?? "—"}</Text>
              <Text style={styles.textMuted}>Teléfono: {snapshot.supplier.phone ?? "—"}</Text>
              <Text style={styles.textMuted}>Dirección: {snapshot.supplier.address ?? "—"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.documentInfoBand}>
          <View style={styles.documentInfoItem}>
            <Text style={styles.documentInfoLabel}>Fecha esperada</Text>
            <Text style={styles.documentInfoValue}>{formatDate(snapshot.purchaseOrder.expectedDate)}</Text>
          </View>
          <View style={styles.documentInfoDivider} />
          <View style={styles.documentInfoItem}>
            <Text style={styles.documentInfoLabel}>Moneda</Text>
            <Text style={styles.documentInfoValue}>{snapshot.totals.currency}</Text>
          </View>
          <View style={styles.documentInfoDivider} />
          <View style={styles.documentInfoItem}>
            <Text style={styles.documentInfoLabel}>Dirección de entrega</Text>
            <Text style={styles.documentInfoValue}>{snapshot.purchaseOrder.deliveryAddressSnapshot ?? "—"}</Text>
          </View>
          <View style={styles.documentInfoDivider} />
          <View style={styles.documentInfoItem}>
            <Text style={styles.documentInfoLabel}>Términos de pago</Text>
            <Text style={styles.documentInfoValue}>{snapshot.supplier.paymentTerms ?? "—"}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Líneas</Text>
          <View style={styles.lineTable}>
            <View style={styles.lineHeader}>
              <Text style={[styles.lineCell, styles.lineSku, styles.lineHeaderText]}>SKU</Text>
              <Text style={[styles.lineCell, styles.lineProduct, styles.lineHeaderText]}>Producto</Text>
              <Text style={[styles.lineCell, styles.lineQty, styles.lineQtyHeaderText]}>Cantidad</Text>
              <Text style={[styles.lineCell, styles.lineUnit, styles.lineHeaderText]}>Unidad</Text>
              <Text style={[styles.lineCell, styles.lineMoney, styles.lineHeaderText]}>Precio unitario</Text>
              <Text style={[styles.lineCell, styles.lineMoney, styles.lineHeaderText]}>Importe</Text>
            </View>
            {snapshot.lines.map((line, index) => (
              (() => {
                const typography = getPurchaseOrderPdfLineTypography(line);
                return (
                  <View
                    key={`${line.productId}-${index}`}
                    wrap={false}
                    style={[
                      styles.lineBody,
                      ...(index % 2 === 1 ? [styles.lineBodyAlt] : []),
                      ...(index === snapshot.lines.length - 1 ? [styles.lineBodyLast] : []),
                      { minHeight: typography.rowMinHeight },
                    ]}
                  >
                    <Text
                      style={[
                        styles.lineCell,
                        styles.lineSku,
                        styles.lineSkuText,
                        { fontSize: typography.skuFontSize, lineHeight: typography.skuLineHeight },
                      ]}
                    >
                      {formatSingleLineText(line.sku)}
                    </Text>
                    <Text
                      style={[
                        styles.lineCell,
                        styles.lineProduct,
                        styles.lineProductText,
                        { fontSize: typography.productFontSize, lineHeight: typography.productLineHeight },
                      ]}
                    >
                      {injectSoftBreaks(line.name)}
                    </Text>
                    <Text style={[styles.lineCell, styles.lineQty, styles.lineQtyText]}>{line.qtyOrdered}</Text>
                    <Text style={[styles.lineCell, styles.lineUnit, styles.lineUnitText]}>{formatSingleLineText(line.unitLabel)}</Text>
                    <Text style={[styles.lineCell, styles.lineMoney, styles.lineMoneyText]}>{money(line.unitPrice, line.currency)}</Text>
                    <Text style={[styles.lineCell, styles.lineMoney, styles.lineMoneyText]}>{money(line.subtotal, line.currency)}</Text>
                  </View>
                );
              })()
            ))}
          </View>
        </View>

        <View style={styles.documentBottomBand}>
          <View style={styles.documentNotesSection}>
            <Text style={styles.sectionTitle}>Notas</Text>
            <View style={[styles.card, styles.documentNotesCard]}>
              <Text>{snapshot.purchaseOrder.notes ?? "—"}</Text>
            </View>
          </View>
          <View style={styles.documentTotalsSection}>
            <View style={styles.totalsBox}>
              <View style={styles.totalsRow}>
                <Text style={styles.documentTotalsLabel}>Subtotal</Text>
                <Text style={styles.documentTotalsValue}>{money(subtotal, snapshot.totals.currency)}</Text>
              </View>
              <View style={styles.totalsRow}>
                <Text style={styles.documentTotalsLabel}>IVA</Text>
                <Text style={styles.documentTotalsValue}>{money(iva, snapshot.totals.currency)}</Text>
              </View>
              <View style={[styles.totalsRow, styles.documentTotalsEmphasis, styles.documentTotalsRowLast]}>
                <Text style={styles.documentTotalsLabel}>Total</Text>
                <Text style={styles.documentTotalsValue}>{money(total, snapshot.totals.currency)}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.signatureSection}>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Director general</Text>
          </View>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Encargado de almacén</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>Documento generado automáticamente desde WMS.</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
          <Text>Esta orden de compra está sujeta a validación administrativa.</Text>
        </View>
      </Page>
    </Document>
  );
}
