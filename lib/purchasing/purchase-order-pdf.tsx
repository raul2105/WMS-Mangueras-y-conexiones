import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PurchaseOrderDocumentSnapshot } from "@/lib/purchasing/purchase-order-document-service";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
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
    fontSize: 18,
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
    fontSize: 10,
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
    width: "10%",
  },
  lineProduct: {
    width: "24%",
  },
  lineQty: {
    width: "8%",
    textAlign: "right",
  },
  lineQtyWide: {
    width: "9%",
    textAlign: "right",
  },
  lineUnit: {
    width: "8%",
    textAlign: "center",
  },
  lineMoney: {
    width: "11%",
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
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Orden de Compra Oficial</Text>
          <Text style={styles.subtitle}>WMS Mangueras y Conexiones</Text>
          <View style={styles.metaRow}>
            <Text>Folio: {snapshot.purchaseOrder.folio}</Text>
            <Text>Versión: v{snapshot.documentVersion}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text>Generado: {new Date(snapshot.generatedAt).toLocaleString("es-MX")}</Text>
            <Text>Estado: {snapshot.purchaseOrder.status}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Proveedor</Text>
          <View style={styles.card}>
            <Text>{snapshot.supplier.businessName ?? snapshot.supplier.name}</Text>
            <Text style={styles.textMuted}>{snapshot.supplier.legalName ?? "—"}</Text>
            <Text style={styles.textMuted}>Código: {snapshot.supplier.code}</Text>
            <Text style={styles.textMuted}>RFC: {snapshot.supplier.taxId ?? "—"}</Text>
            <Text style={styles.textMuted}>Correo: {snapshot.supplier.email ?? "—"}</Text>
            <Text style={styles.textMuted}>Teléfono: {snapshot.supplier.phone ?? "—"}</Text>
            <Text style={styles.textMuted}>Dirección: {snapshot.supplier.address ?? "—"}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.section, styles.column]}>
            <Text style={styles.sectionTitle}>Datos de la OC</Text>
            <View style={styles.card}>
              <Text>Creada: {new Date(snapshot.purchaseOrder.createdAt).toLocaleString("es-MX")}</Text>
              <Text>Fecha esperada: {formatDate(snapshot.purchaseOrder.expectedDate)}</Text>
              <Text>Versión documento: v{snapshot.documentVersion}</Text>
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
              <Text style={[styles.lineCell, styles.lineQty]}>Ped.</Text>
              <Text style={[styles.lineCell, styles.lineQty]}>Rec.</Text>
              <Text style={[styles.lineCell, styles.lineQty]}>Pend.</Text>
              <Text style={[styles.lineCell, styles.lineUnit]}>U.</Text>
              <Text style={[styles.lineCell, styles.lineMoney]}>P. Unit.</Text>
              <Text style={[styles.lineCell, styles.lineMoney]}>Subtotal</Text>
            </View>
            {snapshot.lines.map((line, index) => (
              <View
                key={`${line.productId}-${index}`}
                style={index === snapshot.lines.length - 1 ? [styles.lineBody, styles.lineBodyLast] : styles.lineBody}
              >
                <Text style={[styles.lineCell, styles.lineSku]}>{line.sku}</Text>
                <Text style={[styles.lineCell, styles.lineProduct]}>{line.name}</Text>
                <Text style={[styles.lineCell, styles.lineQty]}>{line.qtyOrdered}</Text>
                <Text style={[styles.lineCell, styles.lineQty]}>{line.qtyReceived}</Text>
                <Text style={[styles.lineCell, styles.lineQty]}>{line.pendingQty}</Text>
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
      </Page>
    </Document>
  );
}
