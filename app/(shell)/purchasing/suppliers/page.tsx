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
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">Proveedores</h1>
          <p className="mt-1 text-[var(--text-secondary)]">Catálogo de proveedores y productos vinculados.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/purchasing" className="btn-secondary">← Compras</Link>
          <Link href="/purchasing/suppliers/new" className="btn-primary">+ Nuevo Proveedor</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <div className="op-panel text-center">
          <p className="text-3xl font-bold text-[var(--text-accent)]">{totalCount}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Total proveedores</p>
        </div>
        <div className="op-panel text-center">
          <p className="text-3xl font-bold text-[var(--status-success-text)]">{activeCount}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Activos</p>
        </div>
        <div className="op-panel text-center">
          <p className="text-3xl font-bold text-[var(--text-muted)]">{totalCount - activeCount}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Inactivos</p>
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="op-panel py-12 text-center">
          <p className="mb-4 text-[var(--text-muted)]">No hay proveedores registrados.</p>
          <Link href="/purchasing/suppliers/new" className="btn-primary">+ Agregar primer proveedor</Link>
        </div>
      ) : (
        <div className="op-panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
                <th className="py-3 text-left">Código</th>
                <th className="py-3 text-left">Nombre</th>
                <th className="py-3 text-left">RFC</th>
                <th className="py-3 text-left">Email</th>
                <th className="py-3 text-right">Productos</th>
                <th className="py-3 text-right">OCs</th>
                <th className="py-3 text-center">Estado</th>
                <th className="py-3"></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id} className="border-b border-[var(--border-soft)] hover:bg-[var(--table-hover)]">
                  <td className="py-3 font-mono text-xs text-[var(--text-accent)]">{supplier.code}</td>
                  <td className="py-3 font-medium text-[var(--text-primary)]">{supplier.name}</td>
                  <td className="py-3 text-[var(--text-secondary)]">{supplier.taxId ?? "—"}</td>
                  <td className="py-3 text-xs text-[var(--text-secondary)]">{supplier.email ?? "—"}</td>
                  <td className="py-3 text-right text-[var(--text-primary)]">{supplier._count.products}</td>
                  <td className="py-3 text-right text-[var(--text-primary)]">{supplier._count.purchaseOrders}</td>
                  <td className="py-3 text-center">
                    <span
                      className={`inline-flex rounded-[var(--radius-sm)] border px-2 py-0.5 text-xs font-bold ${
                        supplier.isActive
                          ? "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]"
                          : "border-[var(--status-neutral-border)] bg-[var(--status-neutral-bg)] text-[var(--status-neutral-text)]"
                      }`}
                    >
                      {supplier.isActive ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <Link href={`/purchasing/suppliers/${supplier.id}`} className="text-xs text-[var(--text-accent)] hover:underline">
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
            className={`btn-secondary ${safePage <= 1 ? "pointer-events-none opacity-40" : ""}`}
          >
            ← Anterior
          </Link>
          <span className="text-[var(--text-muted)]">Página {safePage} de {totalPages}</span>
          <Link
            href={buildHref(Math.min(totalPages, safePage + 1))}
            className={`btn-secondary ${safePage >= totalPages ? "pointer-events-none opacity-40" : ""}`}
          >
            Siguiente →
          </Link>
        </div>
      )}
    </div>
  );
}
