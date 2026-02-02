import Link from "next/link";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function InventoryHomePage() {
  const products = await prisma.product.findMany({
    orderBy: { updatedAt: "desc" },
    include: { inventory: true },
  });

  const rows = products.map((p) => {
    const stock = p.inventory.reduce((acc, r) => acc + (typeof r.quantity === "number" ? r.quantity : 0), 0);
    return { id: p.id, sku: p.sku, referenceCode: p.referenceCode, name: p.name, type: p.type, stock };
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Inventario</h1>
          <p className="text-slate-400 mt-1">Entradas (recepción) y salidas (picking) con trazabilidad.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/inventory/receive" className="btn-primary">+ Recepción</Link>
          <Link href="/inventory/pick" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">- Picking</Link>
        </div>
      </div>

      <div className="glass-card">
        <h2 className="text-lg font-bold mb-4">Stock por producto</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/10">
                <th className="text-left py-3">SKU</th>
                <th className="text-left py-3">Referencia</th>
                <th className="text-left py-3">Nombre</th>
                <th className="text-left py-3">Tipo</th>
                <th className="text-right py-3">Stock</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-3 font-mono text-slate-200">{r.sku}</td>
                  <td className="py-3 font-mono text-slate-400">{r.referenceCode ?? "--"}</td>
                  <td className="py-3 text-slate-200">{r.name}</td>
                  <td className="py-3 text-slate-400">{r.type}</td>
                  <td className="py-3 text-right font-bold text-white">{r.stock}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">No hay productos todavía.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
