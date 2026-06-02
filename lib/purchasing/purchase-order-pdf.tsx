import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PurchaseOrderDocumentSnapshot } from "@/lib/purchasing/purchase-order-document-service";

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

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8.8,
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 24,
    color: "#111827",
  },
  header: {
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#111827",
    borderBottomStyle: "solid",
  },
  title: {
    fontSize: 19,
    fontWeight: 700,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: "#4b5563",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  section: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 10.5,
    fontWeight: 700,
    marginBottom: 4,
  },
  card: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderStyle: "solid",
    borderRadius: 3,
    padding: 8,
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
    color: "#4b5563",
  },
  smallMuted: {
    color: "#6b7280",
    fontSize: 8,
  },
  lineTable: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderStyle: "solid",
  },
  lineHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    borderBottomStyle: "solid",
  },
  lineCell: {
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
    borderRightStyle: "solid",
    justifyContent: "flex-start",
  },
  lineBody: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    borderBottomStyle: "solid",
  },
  lineBodyLast: {
    borderBottomWidth: 0,
  },
  lineSku: {
    width: "16%",
  },
  lineProduct: {
    width: "34%",
  },
  lineQty: {
    width: "11%",
    textAlign: "right",
  },
  lineUnit: {
    width: "9%",
    textAlign: "center",
  },
  lineMoney: {
    width: "15%",
    textAlign: "right",
  },
  totals: {
    marginTop: 8,
    width: "100%",
    alignItems: "flex-end",
  },
  totalsBox: {
    width: 170,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderStyle: "solid",
    padding: 8,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  notes: {
    minHeight: 34,
  },
  footer: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    color: "#6b7280",
    fontSize: 8,
  },
  documentMetaGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  metaCard: {
    flexGrow: 1,
    flexBasis: 0,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderStyle: "solid",
    borderRadius: 3,
    padding: 8,
  },
  metaLabel: {
    fontSize: 8,
    color: "#6b7280",
    textTransform: "uppercase",
    marginBottom: 3,
  },
  metaValue: {
    fontSize: 9.5,
    color: "#111827",
  },
  supplierPrimary: {
    fontSize: 10,
    fontWeight: 700,
    color: "#111827",
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
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Orden de Compra</Text>
          <Text style={styles.subtitle}>WMS Mangueras y Conexiones</Text>
          <View style={styles.metaRow}>
            <Text>Folio: {snapshot.purchaseOrder.folio}</Text>
            <Text>Versión documento: v{snapshot.documentVersion}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text>Fecha de emisión: {new Date(snapshot.generatedAt).toLocaleString("es-MX")}</Text>
            <Text>Estado: {snapshot.purchaseOrder.status}</Text>
          </View>
        </View>

        <View style={styles.documentMetaGrid}>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Fecha esperada / entrega solicitada</Text>
            <Text style={styles.metaValue}>{formatDate(snapshot.purchaseOrder.expectedDate)}</Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Compra</Text>
            <Text style={styles.metaValue}>Orden congelada para uso oficial</Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Moneda</Text>
            <Text style={styles.metaValue}>{snapshot.totals.currency}</Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Versión documento</Text>
            <Text style={styles.metaValue}>v{snapshot.documentVersion}</Text>
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

        <View style={[styles.row, { marginTop: 10 }]}>
          <View style={[styles.section, styles.column]}>
            <Text style={styles.sectionTitle}>Entrega y términos</Text>
            <View style={styles.card}>
              <Text>Dirección de entrega: Por definir</Text>
              <Text>Términos de pago: Por definir</Text>
              <Text>Moneda: {snapshot.totals.currency}</Text>
            </View>
          </View>
          <View style={[styles.section, styles.column]}>
            <Text style={styles.sectionTitle}>Notas</Text>
            <View style={[styles.card, styles.notes]}>
              <Text>{snapshot.purchaseOrder.notes ?? "—"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Líneas</Text>
          <View style={styles.lineTable}>
            <View style={styles.lineHeader}>
              <Text style={[styles.lineCell, styles.lineSku]}>SKU</Text>
              <Text style={[styles.lineCell, styles.lineProduct]}>Producto</Text>
              <Text style={[styles.lineCell, styles.lineQty]}>Cantidad</Text>
              <Text style={[styles.lineCell, styles.lineUnit]}>Unidad</Text>
              <Text style={[styles.lineCell, styles.lineMoney]}>Precio unitario</Text>
              <Text style={[styles.lineCell, styles.lineMoney]}>Importe</Text>
            </View>
            {snapshot.lines.map((line, index) => (
              <View
                key={`${line.productId}-${index}`}
                style={index === snapshot.lines.length - 1 ? [styles.lineBody, styles.lineBodyLast] : styles.lineBody}
              >
                <Text style={[styles.lineCell, styles.lineSku]}>{line.sku}</Text>
                <Text style={[styles.lineCell, styles.lineProduct]}>{line.name}</Text>
                <Text style={[styles.lineCell, styles.lineQty]}>{line.qtyOrdered}</Text>
                <Text style={[styles.lineCell, styles.lineUnit]}>{line.unitLabel}</Text>
                <Text style={[styles.lineCell, styles.lineMoney]}>{money(line.unitPrice, line.currency)}</Text>
                <Text style={[styles.lineCell, styles.lineMoney]}>{money(line.subtotal, line.currency)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.totals}>
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text>Subtotal</Text>
              <Text>{money(snapshot.totals.subtotal, snapshot.totals.currency)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text>Total</Text>
              <Text>{money(snapshot.totals.total, snapshot.totals.currency)}</Text>
            </View>
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
