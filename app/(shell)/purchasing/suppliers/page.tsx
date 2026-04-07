import Link from "next/link";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const currentPage = parsePage(sp.page);

  const [totalCount, activeCount, suppliers] = await Promise.all([
    prisma.supplier.count(),
    prisma.supplier.count({ where: { isActive: true } }),
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        code: true,
        name: true,
        taxId: true,
        email: true,
        isActive: true,
        _count: { select: { products: true, purchaseOrders: true } },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const buildHref = (page: number) => (page > 1 ? `/purchasing/suppliers?page=${page}` : "/purchasing/suppliers");

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            Proveedores
          </h1>
          <p className="text-slate-400 mt-1">Catálogo de proveedores y productos vinculados.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/purchasing" className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">← Compras</Link>
          <Link href="/purchasing/suppliers/new" className="btn-primary">+ Nuevo Proveedor</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="glass-card text-center">
          <p className="text-3xl font-bold text-cyan-400">{totalCount}</p>
          <p className="text-sm text-slate-400 mt-1">Total proveedores</p>
        </div>
        <div className="glass-card text-center">
          <p className="text-3xl font-bold text-emerald-400">{activeCount}</p>
          <p className="text-sm text-slate-400 mt-1">Activos</p>
        </div>
        <div className="glass-card text-center">
          <p className="text-3xl font-bold text-slate-400">{totalCount - activeCount}</p>
          <p className="text-sm text-slate-400 mt-1">Inactivos</p>
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="glass-card text-center py-12">
          <p className="text-slate-500 mb-4">No hay proveedores registrados.</p>
          <Link href="/purchasing/suppliers/new" className="btn-primary">+ Agregar primer proveedor</Link>
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/10">
                <th className="text-left py-3">Código</th>
                <th className="text-left py-3">Nombre</th>
                <th className="text-left py-3">RFC</th>
                <th className="text-left py-3">Email</th>
                <th className="text-right py-3">Productos</th>
                <th className="text-right py-3">OCs</th>
                <th className="text-center py-3">Estado</th>
                <th className="py-3"></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-3 font-mono text-cyan-400 text-xs">{supplier.code}</td>
                  <td className="py-3 font-medium text-white">{supplier.name}</td>
                  <td className="py-3 text-slate-400">{supplier.taxId ?? "—"}</td>
                  <td className="py-3 text-slate-400 text-xs">{supplier.email ?? "—"}</td>
                  <td className="py-3 text-right text-slate-300">{supplier._count.products}</td>
                  <td className="py-3 text-right text-slate-300">{supplier._count.purchaseOrders}</td>
                  <td className="py-3 text-center">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${supplier.isActive ? "text-emerald-400 bg-emerald-500/20" : "text-red-400 bg-red-500/20"}`}>
                      {supplier.isActive ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <Link href={`/purchasing/suppliers/${supplier.id}`} className="text-xs text-cyan-400 hover:underline">
                      Ver →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <Link
            href={buildHref(Math.max(1, safePage - 1))}
            className={`px-4 py-2 glass rounded-lg ${safePage <= 1 ? "pointer-events-none opacity-40" : "text-slate-300 hover:text-white"}`}
          >
            ← Anterior
          </Link>
          <span className="text-slate-500">
            Página {safePage} de {totalPages}
          </span>
          <Link
            href={buildHref(Math.min(totalPages, safePage + 1))}
            className={`px-4 py-2 glass rounded-lg ${safePage >= totalPages ? "pointer-events-none opacity-40" : "text-slate-300 hover:text-white"}`}
          >
            Siguiente →
          </Link>
        </div>
      )}
    </div>
  );
}
