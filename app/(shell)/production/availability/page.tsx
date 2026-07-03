import Link from "next/link";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { pageGuard } from "@/components/rbac/PageGuard";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonStyles } from "@/components/ui/button";
import { Table, TableRow, TableWrap, Td, Th } from "@/components/ui/table";
import { buildProductSearchWhere } from "@/lib/product-search";
import {
  buildCommercialRequestHref,
  buildCommercialSearchHref,
} from "@/lib/commercial-toolkit";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SearchParams = {
  q?: string;
  warehouse?: string;
  page?: string;
  productId?: string;
  sku?: string;
  source?: string;
  equivalentProductId?: string;
};

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function getCommercialStatus(available: number) {
  if (available <= 0) {
    return { label: "Sin disponibilidad", variant: "danger" as const };
  }
  if (available <= 5) {
    return { label: "Limitado", variant: "warning" as const };
  }
  return { label: "Disponible", variant: "success" as const };
}

export default async function ProductionAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await pageGuard("sales.view");
  const sp = await searchParams;
  const query = sp.q?.trim() ?? "";
  const selectedWarehouse = sp.warehouse?.trim() ?? "";
  const currentPage = parsePage(sp.page);
  const productId = sp.productId?.trim() ?? "";
  const sku = sp.sku?.trim() ?? "";
  const source = sp.source?.trim() ?? "";
  const equivalentProductId = sp.equivalentProductId?.trim() ?? "";
  const hasSearchContext = Boolean(query || productId || sku || equivalentProductId);

  const inventoryWhere: Prisma.InventoryWhereInput = selectedWarehouse
    ? { location: { warehouse: { code: selectedWarehouse } } }
    : {};
  const where: Prisma.ProductWhereInput = {
    ...(productId ? { id: productId } : sku ? { sku } : query ? buildProductSearchWhere(query) : {}),
    ...(!hasSearchContext
      ? { inventory: { some: { ...inventoryWhere, available: { gt: 0 } } } }
      : {}),
  };

  const [totalRows, products, warehouses] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        sku: true,
        referenceCode: true,
        name: true,
        type: true,
        brand: true,
        inventory: {
          where: inventoryWhere,
          select: {
            available: true,
            location: {
              select: {
                code: true,
                warehouse: { select: { code: true, name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { code: true, name: true },
    }),
  ]);

  const rows = products.map((product) => {
    const available = product.inventory.reduce((acc, row) => acc + row.available, 0);
    const byWarehouse = Object.values(
      product.inventory.reduce<Record<string, { warehouseCode: string; warehouseName: string; available: number }>>((acc, row) => {
        const warehouseCode = row.location.warehouse.code;
        const warehouseName = row.location.warehouse.name;
        const current = acc[warehouseCode] ?? {
          warehouseCode,
          warehouseName,
          available: 0,
        };
        current.available += row.available;
        acc[warehouseCode] = current;
        return acc;
      }, {}),
    );

    return {
      ...product,
      available,
      byWarehouse,
      status: getCommercialStatus(available),
    };
  });

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const buildHref = (page: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (selectedWarehouse) params.set("warehouse", selectedWarehouse);
    if (productId) params.set("productId", productId);
    if (sku) params.set("sku", sku);
    if (source) params.set("source", source);
    if (equivalentProductId) params.set("equivalentProductId", equivalentProductId);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/production/availability?${qs}` : "/production/availability";
  };

  const requestHref = query || sku
    ? buildCommercialRequestHref({
        productId,
        sku: sku || undefined,
        q: query || sku || undefined,
        source: "availability",
        equivalentProductId: equivalentProductId || undefined,
      })
    : "/production/requests/new";
  const hasResultRows = rows.length > 0;
  const showContextualEmptyActions = Boolean(query || sku || productId || equivalentProductId);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Disponibilidad comercial"
        description="Consulta rápida para promesa comercial."
        meta={hasResultRows ? `${totalRows.toLocaleString("es-MX")} resultados` : undefined}
      />

      <form className="surface grid gap-3 rounded-[var(--radius-lg)] p-4 md:grid-cols-[minmax(0,1.7fr)_minmax(14rem,1fr)_auto] md:items-end">
        <label className="space-y-1">
          <span className="text-sm text-[var(--text-muted)]">Producto requerido</span>
          <input
            name="q"
            defaultValue={query}
            className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-primary)] px-3 py-2.5 text-[var(--text-primary)]"
            placeholder="SKU, referencia, nombre o marca..."
          />
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="sku" value={sku} />
          <input type="hidden" name="source" value={source} />
          <input type="hidden" name="equivalentProductId" value={equivalentProductId} />
        </label>
        <label className="space-y-1">
          <span className="text-sm text-[var(--text-muted)]">Almacén</span>
          <select
            name="warehouse"
            defaultValue={selectedWarehouse}
            className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-primary)] px-3 py-2.5 text-[var(--text-primary)]"
          >
            <option value="">Todos</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.code} value={warehouse.code}>
                {warehouse.code} - {warehouse.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <button type="submit" className={buttonStyles()}>
            Ver disponibilidad
          </button>
          <Link
            href="/production/availability"
            className={buttonStyles({ variant: "secondary" })}
          >
            Limpiar filtros
          </Link>
        </div>
      </form>

      {!hasResultRows ? (
        <EmptyState
          compact
          title={hasSearchContext ? "Sin disponibilidad para esa búsqueda" : "Sin resultados para mostrar"}
          description={
            hasSearchContext
              ? "Ajusta el producto o almacén, o revisa alternativas si necesitas una opción comercial."
              : "Usa la búsqueda para revisar la disponibilidad comercial por producto."
          }
          actions={
            showContextualEmptyActions ? (
              <>
                <Link
                  href={buildCommercialSearchHref("/production/equivalences", query || sku, {
                    productId: productId || undefined,
                    sku: sku || undefined,
                    source: "availability",
                    equivalentProductId: equivalentProductId || undefined,
                  })}
                  className={buttonStyles({ variant: "secondary", size: "sm" })}
                >
                  Revisar equivalencias
                </Link>
                <Link href={requestHref} className={buttonStyles({ size: "sm" })}>
                  Crear pedido
                </Link>
              </>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {rows.map((row) => (
              <article key={row.id} className="surface space-y-3 rounded-[var(--radius-lg)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <Link href={`/catalog/${row.id}`} className="text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--accent)]">
                      {row.name}
                    </Link>
                    <p className="font-mono text-xs text-[var(--text-muted)]">
                      {row.sku}
                      {row.referenceCode ? ` · ${row.referenceCode}` : ""}
                    </p>
                  </div>
                  <Badge variant={row.status.variant}>{row.status.label}</Badge>
                </div>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Disponible para vender</p>
                    <p className="text-lg font-semibold text-[var(--text-primary)]">{row.available.toLocaleString("es-MX")}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Dónde hay</p>
                    <div className="space-y-1 text-sm text-[var(--text-secondary)]">
                      {row.byWarehouse.length > 0 ? row.byWarehouse.map((warehouse) => (
                        <p key={warehouse.warehouseCode}>
                          {warehouse.warehouseCode} - {warehouse.warehouseName}: {warehouse.available.toLocaleString("es-MX")}
                        </p>
                      )) : <p>Sin stock disponible</p>}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={buildCommercialRequestHref({ productId: row.id, sku: row.sku, q: query || row.sku, source: "availability" })}
                    className={buttonStyles({ size: "sm" })}
                  >
                    Crear pedido
                  </Link>
                  <Link
                    href={buildCommercialSearchHref("/production/equivalences", row.sku, { productId: row.id, sku: row.sku, source: "availability" })}
                    className={buttonStyles({ variant: "secondary", size: "sm" })}
                  >
                    Revisar equivalencias
                  </Link>
                  <Link href={`/catalog/${row.id}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                    Ver producto
                  </Link>
                </div>
              </article>
            ))}
          </div>

          <TableWrap className="hidden md:block" dense label="Tabla comercial de disponibilidad">
            <Table>
            <thead>
              <TableRow>
                <Th>Producto / SKU / referencia</Th>
                <Th className="text-right">Disponible para vender</Th>
                <Th>Estado comercial</Th>
                <Th>Dónde hay</Th>
                <Th>Acción</Th>
              </TableRow>
            </thead>
            <tbody>
              {rows.map((row) => (
                <TableRow key={row.id} className="align-top">
                  <Td>
                    <div className="space-y-1">
                      <Link href={`/catalog/${row.id}`} className="font-semibold text-[var(--text-primary)] hover:text-[var(--accent)]">
                        {row.name}
                      </Link>
                      <p className="font-mono text-xs text-[var(--text-muted)]">{row.sku}</p>
                      {row.referenceCode ? <p className="text-xs text-[var(--text-muted)]">{row.referenceCode}</p> : null}
                    </div>
                  </Td>
                  <Td className="text-right font-semibold text-[var(--text-primary)]">
                    {row.available.toLocaleString("es-MX")}
                  </Td>
                  <Td>
                    <Badge variant={row.status.variant}>{row.status.label}</Badge>
                  </Td>
                  <Td className="text-sm">
                    <div className="space-y-1">
                      {row.byWarehouse.length > 0 ? row.byWarehouse.map((warehouse) => (
                        <p key={warehouse.warehouseCode}>
                          <span className="font-medium text-[var(--text-primary)]">
                            {warehouse.warehouseCode} - {warehouse.warehouseName}
                          </span>
                          <span className="text-[var(--text-muted)]">: {warehouse.available.toLocaleString("es-MX")}</span>
                        </p>
                      )) : <p className="text-[var(--text-muted)]">Sin stock disponible</p>}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      <Link href={buildCommercialRequestHref({ productId: row.id, sku: row.sku, q: query || row.sku, source: "availability" })} className={buttonStyles({ size: "sm" })}>
                        Crear pedido
                      </Link>
                      <Link href={buildCommercialSearchHref("/production/equivalences", row.sku, { productId: row.id, sku: row.sku, source: "availability" })} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                        Revisar equivalencias
                      </Link>
                      <Link href={`/catalog/${row.id}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                        Ver producto
                      </Link>
                    </div>
                  </Td>
                </TableRow>
              ))}
            </tbody>
            </Table>
          </TableWrap>
        </>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <Link href={buildHref(Math.max(1, safePage - 1))} className={`rounded-lg border border-white/10 px-4 py-2 ${safePage <= 1 ? "pointer-events-none opacity-40" : "text-slate-300 hover:text-white"}`}>
            ← Anterior
          </Link>
          <span className="text-slate-500">Pagina {safePage} de {totalPages}</span>
          <Link href={buildHref(Math.min(totalPages, safePage + 1))} className={`rounded-lg border border-white/10 px-4 py-2 ${safePage >= totalPages ? "pointer-events-none opacity-40" : "text-slate-300 hover:text-white"}`}>
            Siguiente →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
