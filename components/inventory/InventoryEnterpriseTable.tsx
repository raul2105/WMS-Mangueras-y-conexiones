import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import {
  Table,
  TableEmptyRow,
  TableRow,
  TableWrap,
  Td,
  Th,
} from "@/components/ui/table";

export type InventoryRow = {
  id: string;
  sku: string;
  referenceCode: string | null;
  name: string;
  type: string;
  brand: string | null;
  categoryName: string;
  subcategory: string;
  stock: number;
  available: number;
  topLocations: string;
  score: number;
};

type Props = {
  rows: InventoryRow[];
  safePage: number;
  totalPages: number;
  totalRows: number;
  footer: React.ReactNode;
};

export function InventoryEnterpriseTable({
  rows,
  safePage,
  totalPages,
  totalRows,
  footer,
}: Props) {
  return (
    <SectionCard
      title="Stock por producto"
      description="Disponibilidad consolidada por producto y ubicación."
      actions={
        <div className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)]">
          Pagina {safePage} de {totalPages} ·{" "}
          {totalRows.toLocaleString("es-MX")} SKUs
        </div>
      }
      footer={footer}
      contentClassName="space-y-0 px-0 py-0"
    >
      {rows.length === 0 ? (
        <TableWrap dense striped hoverable>
          <Table>
            <tbody>
              <TableEmptyRow colSpan={9}>
                No hay coincidencias con los filtros actuales.
              </TableEmptyRow>
            </tbody>
          </Table>
        </TableWrap>
      ) : (
        <>
          <div
            className="grid gap-3 md:hidden"
            data-mobile-card-list="inventory"
          >
            {rows.map((row) => (
              <article
                key={row.id}
          className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <Link
                      href={`/inventory/${row.id}`}
                      className="block font-mono text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--accent)]"
                    >
                      {row.sku}
                    </Link>
                    <Link
                      href={`/inventory/${row.id}`}
                      className="block text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--accent)]"
                    >
                      {row.name}
                    </Link>
                    <p className="text-xs text-[var(--text-muted)]">
                      {row.referenceCode ?? "--"} · {row.type}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[var(--text-muted)]">
                      Disponible
                    </p>
                    <Badge variant={row.available > 0 ? "success" : "neutral"} size="md">
                      {row.available.toLocaleString("es-MX")}
                    </Badge>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">
                      Categoria
                    </dt>
                    <dd className="text-[var(--text-secondary)]">
                      {row.categoryName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">Marca</dt>
                    <dd className="text-[var(--text-secondary)]">
                      {row.brand ?? "--"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">
                      Stock total
                    </dt>
                    <dd className="font-semibold text-[var(--text-primary)]">
                      {row.stock.toLocaleString("es-MX")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">
                      Subcategoria
                    </dt>
                    <dd className="text-[var(--text-secondary)]">
                      {row.subcategory}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4">
                  <p className="text-xs text-[var(--text-muted)]">
                    Ubicaciones principales
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {row.topLocations}
                  </p>
                </div>
              </article>
            ))}
          </div>

          <div className="hidden md:block">
            <TableWrap dense striped hoverable label="Inventario por producto">
              <Table className="min-w-[980px]">
                <thead>
                  <tr>
                    <Th className="pl-5">SKU</Th>
                    <Th>Referencia</Th>
                    <Th>Producto</Th>
                    <Th>Tipo</Th>
                    <Th>Marca</Th>
                    <Th>Categoria</Th>
                    <Th>Ubicaciones</Th>
                    <Th className="text-right">Stock total</Th>
                    <Th className="pr-5 text-right">Disponible</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <Td className="pl-5 align-top">
                        <Link
                          href={`/inventory/${row.id}`}
                          className="block font-mono text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--accent)]"
                        >
                          {row.sku}
                        </Link>
                      </Td>
                      <Td className="align-top font-mono text-xs text-[var(--text-muted)]">
                        {row.referenceCode ?? "--"}
                      </Td>
                      <Td className="align-top">
                        <div className="space-y-1.5">
                          <Link
                            href={`/inventory/${row.id}`}
                            className="block text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--accent)]"
                          >
                            {row.name}
                          </Link>
                          <p className="text-xs text-[var(--text-muted)]">
                            {row.subcategory}
                          </p>
                        </div>
                      </Td>
                      <Td className="align-top text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        {row.type}
                      </Td>
                      <Td className="align-top">{row.brand ?? "--"}</Td>
                      <Td className="align-top">{row.categoryName}</Td>
                      <Td className="align-top">
                        <p className="text-sm text-[var(--text-secondary)]">
                          {row.topLocations}
                        </p>
                      </Td>
                      <Td className="align-top text-right font-semibold text-[var(--text-primary)]">
                        {row.stock.toLocaleString("es-MX")}
                      </Td>
                      <Td className="pr-5 align-top text-right">
                        <Badge variant={row.available > 0 ? "success" : "neutral"} size="md">
                          {row.available.toLocaleString("es-MX")}
                        </Badge>
                      </Td>
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </div>
        </>
      )}
    </SectionCard>
  );
}
