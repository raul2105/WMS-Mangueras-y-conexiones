import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export type OperationalDocumentLine = {
  sku: string;
  name: string;
  quantity: number;
  unit: string;
  detail?: string | null;
};

export type OperationalDocumentSnapshot = {
  title: string;
  folio: string;
  status: string;
  generatedAt: Date;
  warehouse: string;
  location?: string | null;
  responsible?: string | null;
  reference?: string | null;
  notes?: string | null;
  lines: OperationalDocumentLine[];
};

export function buildOperationalDocumentFilename(prefix: string, folio: string) {
  const safe = `${prefix}-${folio}`
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  return `${safe || prefix}.pdf`;
}

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: "Helvetica", fontSize: 9, color: "#172033" },
  header: { borderBottomWidth: 2, borderBottomColor: "#1d4ed8", paddingBottom: 10, marginBottom: 14 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#0f2b5b" },
  folio: { fontSize: 11, marginTop: 4, color: "#334155" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  field: { width: "48%", padding: 7, backgroundColor: "#f1f5f9", borderRadius: 3 },
  label: { fontSize: 7, color: "#64748b", textTransform: "uppercase", marginBottom: 2 },
  value: { fontSize: 9, color: "#172033" },
  tableHead: { flexDirection: "row", backgroundColor: "#0f2b5b", color: "#ffffff", padding: 6 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#cbd5e1", paddingVertical: 6 },
  sku: { width: "20%", fontSize: 8 },
  product: { width: "52%", fontSize: 8 },
  quantity: { width: "28%", textAlign: "right", fontSize: 8 },
  note: { marginTop: 14, padding: 8, backgroundColor: "#fff7ed", borderRadius: 3, color: "#7c2d12" },
  footer: { position: "absolute", bottom: 20, left: 28, right: 28, fontSize: 7, color: "#64748b", textAlign: "center" },
});

function formatDate(value: Date) {
  return value.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

export function OperationalDocumentPdf({ snapshot }: { snapshot: OperationalDocumentSnapshot }) {
  const fields = [
    ["Estado", snapshot.status],
    ["Almacén", snapshot.warehouse],
    ["Ubicación", snapshot.location || "—"],
    ["Responsable", snapshot.responsible || "—"],
    ["Fecha", formatDate(snapshot.generatedAt)],
    ["Referencia", snapshot.reference || "—"],
  ];

  return (
    <Document title={`${snapshot.title} ${snapshot.folio}`} author="WMS SCMayher">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{snapshot.title}</Text>
          <Text style={styles.folio}>Folio: {snapshot.folio}</Text>
        </View>
        <View style={styles.grid}>
          {fields.map(([label, value]) => (
            <View key={label} style={styles.field}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{value}</Text>
            </View>
          ))}
        </View>
        <View style={styles.tableHead}>
          <Text style={styles.sku}>SKU</Text><Text style={styles.product}>Material</Text><Text style={styles.quantity}>Cantidad</Text>
        </View>
        {snapshot.lines.map((line, index) => (
          <View key={`${line.sku}-${index}`} style={styles.row}>
            <Text style={styles.sku}>{line.sku}</Text>
            <View style={styles.product}><Text>{line.name}</Text>{line.detail ? <Text style={styles.label}>{line.detail}</Text> : null}</View>
            <Text style={styles.quantity}>{line.quantity.toLocaleString("es-MX")} {line.unit}</Text>
          </View>
        ))}
        {snapshot.notes ? <View style={styles.note}><Text>Notas: {snapshot.notes}</Text></View> : null}
        <Text style={styles.footer}>Documento generado por WMS SCMayher · Conserva este comprobante con el movimiento físico.</Text>
      </Page>
    </Document>
  );
}
