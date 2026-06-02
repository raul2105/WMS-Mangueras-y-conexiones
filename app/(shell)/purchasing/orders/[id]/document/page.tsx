import Link from "next/link";
import prisma from "@/lib/prisma";
import { pageGuard } from "@/components/rbac/PageGuard";
import { PurchaseOrderDocumentPrintButton } from "@/components/purchasing/PurchaseOrderDocumentPrintButton";
import {
  loadLatestPurchaseOrderDocument,
  parsePurchaseOrderDocumentSnapshot,
} from "@/lib/purchasing/purchase-order-document-service";
import { getSupplierDisplayLines } from "@/lib/purchasing/purchase-order-pdf";

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

export const dynamic = "force-dynamic";

export default async function PurchaseOrderDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await pageGuard("purchasing.manage");
  const { id } = await params;

  const documentRecord = await loadLatestPurchaseOrderDocument({ purchaseOrderId: id, prismaClient: prisma });

  if (!documentRecord) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Documento oficial de OC</h1>
            <p className="text-sm text-slate-400">Revisión del documento oficial congelado.</p>
          </div>
          <Link href={`/purchasing/orders/${id}`} className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
            ← Volver a la OC
          </Link>
        </div>
        <div className="glass-card border border-amber-500/30 text-amber-100 text-sm">
          No existe un documento oficial persistido para esta OC. Revisión requerida.
        </div>
      </div>
    );
  }

  let snapshot;
  try {
    snapshot = parsePurchaseOrderDocumentSnapshot(documentRecord.snapshotJson);
  } catch {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Documento oficial de OC</h1>
            <p className="text-sm text-slate-400">No fue posible leer el snapshot persistido.</p>
          </div>
          <Link href={`/purchasing/orders/${id}`} className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
            ← Volver a la OC
          </Link>
        </div>
        <div className="glass-card border border-red-500/30 text-red-100 text-sm">
          El snapshot oficial está corrupto o es inválido. Revisión requerida.
        </div>
      </div>
    );
  }

  const supplierLines = getSupplierDisplayLines(snapshot.supplier);

  return (
    <div className="max-w-5xl mx-auto space-y-6 print:max-w-none print:space-y-4">
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Orden de Compra oficial</h1>
          <p className="text-sm text-slate-400">
            Vista congelada para revisión de la orden {snapshot.purchaseOrder.folio} v{snapshot.documentVersion}
          </p>
        </div>
        <div className="flex gap-3">
          <Link href={`/purchasing/orders/${id}`} className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
            ← Volver
          </Link>
          <PurchaseOrderDocumentPrintButton />
          <a href={`/api/purchasing/orders/${id}/pdf`} className="btn-primary">
            Descargar PDF
          </a>
        </div>
      </div>

      <div className="glass-card print:shadow-none print:border print:border-black/20">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Orden de Compra</p>
            <h2 className="text-3xl font-bold font-mono mt-1">{snapshot.purchaseOrder.folio}</h2>
            <p className="text-sm text-slate-400 mt-1">
              Fecha de emisión {new Date(snapshot.generatedAt).toLocaleString("es-MX")} · Versión v{snapshot.documentVersion}
            </p>
          </div>
          <div className="text-right text-sm text-slate-300">
            <p className="font-semibold text-slate-200">{supplierLines.primary}</p>
            {supplierLines.secondary ? <p>{supplierLines.secondary}</p> : null}
            <p className="text-xs text-slate-500">Código: {snapshot.supplier.code}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4 mt-4">
          <div className="space-y-1 text-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Fecha esperada / entrega solicitada</p>
            <p>{formatDate(snapshot.purchaseOrder.expectedDate)}</p>
          </div>
          <div className="space-y-1 text-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Estado</p>
            <p>{snapshot.purchaseOrder.status}</p>
          </div>
          <div className="space-y-1 text-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Moneda</p>
            <p>{snapshot.totals.currency}</p>
          </div>
          <div className="space-y-1 text-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Creada</p>
            <p>{new Date(snapshot.purchaseOrder.createdAt).toLocaleString("es-MX")}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 mt-4">
          <div className="space-y-1 text-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Comprador</p>
            <p className="text-slate-200">WMS Mangueras y Conexiones</p>
            <p className="text-slate-400">RFC: Por definir</p>
            <p className="text-slate-400">Dirección: Por definir</p>
            <p className="text-slate-400">Contacto: Por definir</p>
          </div>
          <div className="space-y-1 text-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Proveedor</p>
            <p className="text-slate-200">{supplierLines.primary}</p>
            {supplierLines.secondary ? <p className="text-slate-400">{supplierLines.secondary}</p> : null}
            <p className="text-slate-400">RFC: {snapshot.supplier.taxId ?? "—"}</p>
            <p className="text-slate-400">Correo: {snapshot.supplier.email ?? "—"}</p>
            <p className="text-slate-400">Teléfono: {snapshot.supplier.phone ?? "—"}</p>
            <p className="text-slate-400">Dirección: {snapshot.supplier.address ?? "—"}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 mt-4">
          <div className="space-y-1 text-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Entrega y términos</p>
            <p className="text-slate-200">Dirección de entrega: Por definir</p>
            <p className="text-slate-200">Términos de pago: Por definir</p>
          </div>
          <div className="space-y-1 text-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Notas</p>
            <p className="text-slate-200 mt-1">{snapshot.purchaseOrder.notes ?? "—"}</p>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-slate-400">
                <th className="py-2 text-left">SKU</th>
                <th className="py-2 text-left">Producto</th>
                <th className="py-2 text-right">Cantidad</th>
                <th className="py-2 text-center">Unidad</th>
                <th className="py-2 text-right">Precio unitario</th>
                <th className="py-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.lines.map((line) => (
                <tr key={line.productId} className="border-b border-white/5">
                  <td className="py-2 font-mono text-cyan-400 text-xs">{line.sku}</td>
                  <td className="py-2 text-slate-200">{line.name}</td>
                  <td className="py-2 text-right">{line.qtyOrdered}</td>
                  <td className="py-2 text-center text-slate-400">{line.unitLabel}</td>
                  <td className="py-2 text-right">{money(line.unitPrice, line.currency)}</td>
                  <td className="py-2 text-right">{money(line.subtotal, line.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex justify-end">
          <div className="w-full max-w-xs rounded-lg border border-white/10 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Subtotal</span>
              <span>{money(snapshot.totals.subtotal, snapshot.totals.currency)}</span>
            </div>
            <div className="mt-2 flex justify-between text-base font-semibold">
              <span>Total</span>
              <span>{money(snapshot.totals.total, snapshot.totals.currency)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
