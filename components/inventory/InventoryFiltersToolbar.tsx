import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BoxIcon, ChevronRightIcon } from "@/components/ui/icons";
import { SectionCard } from "@/components/ui/section-card";
import { Select } from "@/components/ui/select";
import { Toolbar, ToolbarGroup } from "@/components/ui/toolbar";

type Option = {
  value: string;
  label: string;
};

type Props = {
  query: string;
  selectedType: string;
  stockFilter: string;
  selectedWarehouse: string;
  selectedLocation: string;
  totalRows: number;
  typeOptions: string[];
  warehouseOptions: Option[];
  locationOptions: Option[];
};

export function InventoryFiltersToolbar({
  query,
  selectedType,
  stockFilter,
  selectedWarehouse,
  selectedLocation,
  totalRows,
  typeOptions,
  warehouseOptions,
  locationOptions,
}: Props) {
  return (
    <SectionCard
      title="Filtros"
      description="Refina la vista por producto, disponibilidad y ubicación."
      contentClassName="space-y-4"
    >
      <div className="space-y-4">
        <form className="space-y-4" method="get">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
            <Input
              name="q"
              defaultValue={query}
              label="Buscar producto"
              rootClassName="lg:col-span-4"
              placeholder="SKU, referencia, nombre, marca, categoria o atributo"
              leading={<BoxIcon className="h-4 w-4" />}
            />

            <Select name="type" defaultValue={selectedType} label="Tipo" placeholder="Todos">
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>

            <Select name="stock" defaultValue={stockFilter} label="Disponibilidad" placeholder="Todos">
              <option value="in">Con disponible</option>
              <option value="out">Sin disponible</option>
            </Select>

            <Select name="warehouse" defaultValue={selectedWarehouse} label="Almacen" placeholder="Todos">
              {warehouseOptions.map((warehouse) => (
                <option key={warehouse.value} value={warehouse.value}>
                  {warehouse.label}
                </option>
              ))}
            </Select>

            <Select name="location" defaultValue={selectedLocation} label="Ubicacion" placeholder="Todas">
              {locationOptions.map((location) => (
                <option key={location.value} value={location.value}>
                  {location.label}
                </option>
              ))}
            </Select>
          </div>

          <Toolbar className="items-center rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-subtle)] px-4 py-3" align="between">
            <ToolbarGroup className="gap-3">
              <p className="text-sm text-[var(--text-muted)]">
                {totalRows.toLocaleString("es-MX")} resultados
                {query ? ` para "${query}"` : " en inventario"}
              </p>
            </ToolbarGroup>
            <ToolbarGroup>
              <Link href="/inventory" className={buttonStyles({ variant: "ghost", size: "sm" })}>
                Limpiar
              </Link>
              <button type="submit" className={buttonStyles({ size: "sm" })}>
                Buscar
              </button>
            </ToolbarGroup>
          </Toolbar>
        </form>

        <form action="/trace" method="get" className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-subtle)] px-4 py-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <Input
              name="traceId"
              label="Trace ID"
              inputClassName="font-mono"
              placeholder="TRC-REC-20260331-ABC123"
            />
            <button type="submit" className={buttonStyles({ variant: "secondary", size: "sm", className: "md:mb-[1px]" })}>
              Resolver trace
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </SectionCard>
  );
}