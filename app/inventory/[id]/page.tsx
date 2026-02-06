import prisma from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

type WarehouseGroup = {
  id: string;
  name: string;
  code: string;
  rows: {
    id: string;
    code: string;
    name: string;
    quantity: number;
    reserved: number;
    available: number;
  }[];
};

export default async function InventoryDetailPage({ params }: PageProps) {
  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      inventory: {
        include: {
          location: {
            include: { warehouse: true },
          },
        },
      },
    },
  });

  if (!product) {
    notFound();
  }

  const grouped = new Map<string, WarehouseGroup>();
  const unassigned: WarehouseGroup = {
    id: "unassigned",
    name: "Sin almacen",
    code: "--",
    rows: [],
  };

  for (const inv of product.inventory) {
    if (!inv.location || !inv.location.warehouse) {
      unassigned.rows.push({
        id: inv.id,
        code: inv.location?.code ?? "--",
        name: inv.location?.name ?? "Sin ubicacion",
        quantity: inv.quantity ?? 0,
        reserved: inv.reserved ?? 0,
        available: inv.available ?? 0,
      });
      continue;
    }

    const warehouse = inv.location.warehouse;
    if (!grouped.has(warehouse.id)) {
      grouped.set(warehouse.id, {
        id: warehouse.id,
        name: warehouse.name,
        code: warehouse.code,
        rows: [],
      });
    }

    grouped.get(warehouse.id)?.rows.push({
      id: inv.id,
      code: inv.location.code,
      name: inv.location.name,
      quantity: inv.quantity ?? 0,
      reserved: inv.reserved ?? 0,
      available: inv.available ?? 0,
    });
  }

  const warehouses = Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name));
  if (unassigned.rows.length > 0) {
    warehouses.push(unassigned);
  }

  const totals = product.inventory.reduce(
    (acc, row) => {
      acc.quantity += row.quantity ?? 0;
      acc.reserved += row.reserved ?? 0;
      acc.available += row.available ?? 0;
      return acc;
    },
    { quantity: 0, reserved: 0, available: 0 }
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{product.name}</h1>
          <p className="text-slate-400 mt-1">
            {product.sku} {product.referenceCode ? `| ${product.referenceCode}` : ""}
          </p>
        </div>
        <Link href="/inventory" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
          ← Inventario
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass p-4 rounded-xl">
          <span className="text-xs text-slate-400 uppercase font-bold">Cantidad</span>
          <p className="text-2xl font-bold text-white mt-1">{totals.quantity}</p>
        </div>
        <div className="glass p-4 rounded-xl">
          <span className="text-xs text-slate-400 uppercase font-bold">Reservado</span>
          <p className="text-2xl font-bold text-amber-300 mt-1">{totals.reserved}</p>
        </div>
        <div className="glass p-4 rounded-xl">
          <span className="text-xs text-slate-400 uppercase font-bold">Disponible</span>
          <p className="text-2xl font-bold text-cyan-300 mt-1">{totals.available}</p>
        </div>
      </div>

      {warehouses.map((warehouse) => (
        <div key={warehouse.id} className="glass-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">
              {warehouse.name} <span className="text-slate-400">({warehouse.code})</span>
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-white/10">
                  <th className="text-left py-3">Ubicacion</th>
                  <th className="text-left py-3">Nombre</th>
                  <th className="text-right py-3">Cantidad</th>
                  <th className="text-right py-3">Reservado</th>
                  <th className="text-right py-3">Disponible</th>
                </tr>
              </thead>
              <tbody>
                {warehouse.rows.map((row) => (
                  <tr key={row.id} className="border-b border-white/5">
                    <td className="py-3 font-mono text-slate-200">{row.code}</td>
                    <td className="py-3 text-slate-300">{row.name}</td>
                    <td className="py-3 text-right text-slate-200">{row.quantity}</td>
                    <td className="py-3 text-right text-amber-200">{row.reserved}</td>
                    <td className="py-3 text-right text-cyan-200">{row.available}</td>
                  </tr>
                ))}
                {warehouse.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      No hay inventario en este almacen.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {warehouses.length === 0 && (
        <div className="glass-card text-center py-12">
          <span className="text-6xl block mb-4">📦</span>
          <p className="text-slate-400 text-lg">No hay inventario registrado para este producto.</p>
        </div>
      )}
    </div>
  );
}
