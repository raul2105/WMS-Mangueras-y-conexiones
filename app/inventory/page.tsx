import Link from "next/link";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { buildProductSearchWhere, scoreProductSearch, sumInventoryAvailable, sumInventoryQuantity } from "@/lib/product-search";
import { buttonStyles } from "@/components/ui/button";
import { InventoryEnterpriseTable } from "@/components/inventory/InventoryEnterpriseTable";
import { InventoryFiltersToolbar } from "@/components/inventory/InventoryFiltersToolbar";
import { InventoryPaginationBar } from "@/components/inventory/InventoryPaginationBar";
import { ArrowDownIcon, ArrowUpIcon, InventoryIcon, MenuIcon, SwapIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type PageProps = {
  searchParams: Promise<{
    q?: string;
    type?: string;
    stock?: string;
    warehouse?: string;
    location?: string;
    page?: string;
  }>;
};

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function buildInventoryRelationFilter(selectedWarehouse: string, selectedLocation: string): Prisma.InventoryWhereInput {
  return {
    ...(selectedWarehouse ? { location: { warehouse: { code: selectedWarehouse } } } : {}),
    ...(selectedLocation ? { location: { code: selectedLocation } } : {}),
  };
}

function buildProductWhere({
  query,
  selectedType,
  stockFilter,
  inventoryFilter,
}: {
  query: string;
  selectedType: string;
  stockFilter: string;
  inventoryFilter: Prisma.InventoryWhereInput;
}): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {
    ...(query ? buildProductSearchWhere(query) : {}),
    ...(selectedType ? { type: selectedType } : {}),
  };

  const hasInventoryFilter = Object.keys(inventoryFilter).length > 0;
  if (stockFilter === "in") {
    where.inventory = { some: { ...inventoryFilter, available: { gt: 0 } } };
  } else if (stockFilter === "out") {
    where.inventory = { none: { ...inventoryFilter, available: { gt: 0 } } };
  } else if (hasInventoryFilter) {
    where.inventory = { some: inventoryFilter };
  }

  return where;
}

export default async function InventoryHomePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const query = sp.q?.trim() ?? "";
  const selectedType = sp.type?.trim() ?? "";
  const stockFilter = sp.stock?.trim() ?? "";
  const selectedWarehouse = sp.warehouse?.trim() ?? "";
  const selectedLocation = sp.location?.trim() ?? "";
  const currentPage = parsePage(sp.page);
  const inventoryFilter = buildInventoryRelationFilter(selectedWarehouse, selectedLocation);

  const where = buildProductWhere({
    query,
    selectedType,
    stockFilter,
    inventoryFilter,
  });
  const whereWithoutType = buildProductWhere({
    query,
    selectedType: "",
    stockFilter,
    inventoryFilter,
  });

  const [totalRows, products, typeGroups, warehouses, locations] = await Promise.all([
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
        description: true,
        type: true,
        brand: true,
        subcategory: true,
        category: { select: { name: true } },
        inventory: {
          where: inventoryFilter,
          select: {
            quantity: true,
            available: true,
            location: { select: { code: true, warehouse: { select: { code: true } } } },
          },
        },
        technicalAttributes: query
          ? { take: 12, select: { keyNormalized: true, valueNormalized: true } }
          : undefined,
      },
    }),
    prisma.product.groupBy({
      by: ["type"],
      where: whereWithoutType,
      _count: { id: true },
      orderBy: { type: "asc" },
    }),
    prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { code: true, name: true },
    }),
    prisma.location.findMany({
      where: {
        isActive: true,
        ...(selectedWarehouse ? { warehouse: { code: selectedWarehouse } } : {}),
      },
      orderBy: [{ warehouse: { code: "asc" } }, { code: "asc" }],
      select: { code: true, name: true, warehouse: { select: { code: true } } },
      take: 500,
    }),
  ]);

  const rows = products
    .map((product) => {
      const stock = sumInventoryQuantity(product.inventory);
      const available = sumInventoryAvailable(product.inventory);
      const score = query ? scoreProductSearch(product, query) : 0;
      const topLocations = product.inventory
        .filter((row) => (typeof row.available === "number" ? row.available : 0) > 0)
        .sort((a, b) => (b.available ?? 0) - (a.available ?? 0))
        .slice(0, 2)
        .map((row) => `${row.location.code} (${row.location.warehouse.code})`)
        .join(", ");

      return {
        id: product.id,
        sku: product.sku,
        referenceCode: product.referenceCode,
        name: product.name,
        type: product.type,
        brand: product.brand,
        categoryName: product.category?.name ?? "--",
        subcategory: product.subcategory ?? "--",
        stock,
        available,
        topLocations: topLocations || "--",
        score,
      };
    })
    .sort((a, b) => {
      if (query) {
        return b.score - a.score || b.available - a.available || a.name.localeCompare(b.name, "es");
      }
      return b.available - a.available || b.stock - a.stock || a.name.localeCompare(b.name, "es");
    });

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const typeOptions = typeGroups.map((row) => row.type).sort((a, b) => a.localeCompare(b));

  const buildHref = (page: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (selectedType) params.set("type", selectedType);
    if (stockFilter) params.set("stock", stockFilter);
    if (selectedWarehouse) params.set("warehouse", selectedWarehouse);
    if (selectedLocation) params.set("location", selectedLocation);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/inventory?${qs}` : "/inventory";
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventario"
        description="Busqueda operativa por SKU, referencia, nombre, marca y atributos."
        meta={`${totalRows.toLocaleString("es-MX")} resultados • Pagina ${safePage} de ${totalPages}`}
        actions={
          <>
            <Link href="/inventory/receive" className={buttonStyles()}>
              <ArrowDownIcon className="h-4 w-4" />
              Recepcion
            </Link>
            <Link href="/inventory/pick" className={buttonStyles({ variant: "secondary" })}>
              <ArrowUpIcon className="h-4 w-4" />
              Picking
            </Link>
            <Link href="/inventory/adjust" className={buttonStyles({ variant: "secondary" })}>
              <InventoryIcon className="h-4 w-4" />
              Ajuste
            </Link>
            <Link href="/inventory/transfer" className={buttonStyles({ variant: "secondary" })}>
              <SwapIcon className="h-4 w-4" />
              Transferir
            </Link>
            <Link href="/inventory/kardex" className={buttonStyles({ variant: "secondary" })}>
              <MenuIcon className="h-4 w-4" />
              Kardex
            </Link>
          </>
        }
      />

      <InventoryFiltersToolbar
        query={query}
        selectedType={selectedType}
        stockFilter={stockFilter}
        selectedWarehouse={selectedWarehouse}
        selectedLocation={selectedLocation}
        totalRows={totalRows}
        typeOptions={typeOptions}
        warehouseOptions={warehouses.map((warehouse) => ({
          value: warehouse.code,
          label: `${warehouse.code} - ${warehouse.name}`,
        }))}
        locationOptions={locations.map((location) => ({
          value: location.code,
          label: `${location.code} - ${location.name} (${location.warehouse.code})`,
        }))}
      />

      <InventoryEnterpriseTable
        rows={rows}
        safePage={safePage}
        totalPages={totalPages}
        totalRows={totalRows}
        footer={<InventoryPaginationBar safePage={safePage} totalPages={totalPages} totalRows={totalRows} pageSize={PAGE_SIZE} buildHref={buildHref} />}
      />
    </div>
  );
}
