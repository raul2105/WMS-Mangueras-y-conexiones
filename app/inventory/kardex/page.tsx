import Link from "next/link";
import prisma from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Select } from "@/components/ui/select";
import { Table, TableEmptyRow, TableRow, TableWrap, Td, Th } from "@/components/ui/table";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  IN: "Entrada",
  OUT: "Salida",
  TRANSFER: "Traslado",
  ADJUSTMENT: "Ajuste",
};

const MOVEMENT_TYPE_COLORS: Record<string, "success" | "danger" | "accent" | "warning"> = {
  IN: "success",
  OUT: "danger",
  TRANSFER: "accent",
  ADJUSTMENT: "warning",
};

type SearchParams = {
  code?: string;
  location?: string;
  type?: "IN" | "OUT" | "TRANSFER" | "ADJUSTMENT";
  traceId?: string;
  reference?: string;
  from?: string;
  to?: string;
  page?: string;
};

export default async function KardexPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const code = String(sp.code ?? "").trim();
  const location = String(sp.location ?? "").trim();
  const traceId = String(sp.traceId ?? "").trim();
  const reference = String(sp.reference ?? "").trim();
  const type = sp.type;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const fromDate = sp.from ? new Date(`${sp.from}T00:00:00`) : null;
  const toDate = sp.to ? new Date(`${sp.to}T23:59:59`) : null;

  const where = {
    ...(type ? { type } : {}),
    ...(reference ? { reference: { contains: reference } } : {}),
    ...(traceId ? { traceId: { contains: traceId } } : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
    ...(code
      ? {
          product: {
            OR: [{ sku: { contains: code } }, { referenceCode: { contains: code } }],
          },
        }
      : {}),
    ...(location
      ? {
          OR: [
            { location: { code: { contains: location } } },
            { fromLocationCode: { contains: location } },
            { toLocationCode: { contains: location } },
          ],
        }
      : {}),
  };

  const [total, movements] = await Promise.all([
    prisma.inventoryMovement.count({ where }),
    prisma.inventoryMovement.findMany({
      where,
      include: {
        product: { select: { sku: true, name: true } },
        location: { select: { code: true } },
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function buildPageUrl(p: number) {
    const params = new URLSearchParams();
    if (code) params.set("code", code);
    if (location) params.set("location", location);
    if (traceId) params.set("traceId", traceId);
    if (reference) params.set("reference", reference);
    if (type) params.set("type", type);
    if (sp.from) params.set("from", sp.from);
    if (sp.to) params.set("to", sp.to);
    params.set("page", String(p));
    return `/inventory/kardex?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kardex"
        description="Movimientos por SKU, ubicación, tipo, referencia y rango de fechas."
        actions={
          <Link href="/inventory" className={buttonStyles({ variant: "secondary" })}>
            Inventario
          </Link>
        }
      />

      <SectionCard title="Filtros" description="Acota los movimientos para auditoría operativa.">
        <form className="grid grid-cols-1 gap-4 md:grid-cols-6" method="get">
          <Input name="code" defaultValue={code} rootClassName="md:col-span-2" label="SKU/Referencia" placeholder="CON-R1AT-04" />
          <Input name="location" defaultValue={location} label="Ubicación" placeholder="A-12-04" />
          <Select name="type" defaultValue={type ?? ""} label="Tipo" placeholder="Todos">
            <option value="IN">Entrada</option>
            <option value="OUT">Salida</option>
            <option value="TRANSFER">Traslado</option>
            <option value="ADJUSTMENT">Ajuste</option>
          </Select>
          <Input name="from" type="date" defaultValue={sp.from ?? ""} label="Desde" />
          <Input name="to" type="date" defaultValue={sp.to ?? ""} label="Hasta" />
          <Input name="traceId" defaultValue={traceId} rootClassName="md:col-span-2" label="Trace ID" placeholder="TRC-WIP-20260406-ABC123" />
          <Input name="reference" defaultValue={reference} rootClassName="md:col-span-2" label="Referencia" placeholder="Pedido/OT/OC" />
          <div className="md:col-span-2 flex items-end justify-end gap-3">
            <Link href="/inventory/kardex" className={buttonStyles({ variant: "secondary" })}>Limpiar</Link>
            <button type="submit" className={buttonStyles()}>Filtrar</button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Movimientos"
        description={`${total.toLocaleString("es-MX")} registros · página ${page} de ${totalPages || 1}`}
        actions={(() => {
          const exportParams = new URLSearchParams();
          if (code) exportParams.set("code", code);
          if (location) exportParams.set("location", location);
          if (traceId) exportParams.set("traceId", traceId);
          if (reference) exportParams.set("reference", reference);
          if (type) exportParams.set("type", type);
          if (sp.from) exportParams.set("from", sp.from);
          if (sp.to) exportParams.set("to", sp.to);
          return (
            <a href={`/api/export/kardex?${exportParams.toString()}`} className={buttonStyles({ variant: "secondary", size: "sm" })} download>
              Exportar CSV
            </a>
          );
        })()}
      >
        <TableWrap striped>
          <Table>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Tipo</Th>
                <Th>SKU</Th>
                <Th>Trace ID</Th>
                <Th>Producto</Th>
                <Th>Ubicación</Th>
                <Th className="text-right">Cantidad</Th>
                <Th>Referencia</Th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <TableRow key={movement.id}>
                  <Td className="whitespace-nowrap">{new Date(movement.createdAt).toLocaleString("es-MX")}</Td>
                  <Td>
                    <Badge variant={MOVEMENT_TYPE_COLORS[movement.type] ?? "neutral"}>
                      {MOVEMENT_TYPE_LABELS[movement.type] ?? movement.type}
                    </Badge>
                  </Td>
                  <Td className="font-mono text-xs text-[var(--text-primary)]">{movement.product.sku}</Td>
                  <Td className="font-mono text-xs">
                    {movement.traceId ? (
                      <Link href={`/trace/${encodeURIComponent(movement.traceId)}`} className="text-cyan-300 hover:underline">
                        {movement.traceId}
                      </Link>
                    ) : (
                      <span className="text-slate-500">--</span>
                    )}
                  </Td>
                  <Td>{movement.product.name}</Td>
                  <Td>
                    {movement.type === "TRANSFER"
                      ? `${movement.fromLocationCode ?? "--"} → ${movement.toLocationCode ?? "--"}`
                      : movement.location?.code ?? "--"}
                  </Td>
                  <Td className="text-right font-semibold text-[var(--text-primary)]">{movement.quantity}</Td>
                  <Td>{movement.reference ?? "--"}</Td>
                </TableRow>
              ))}
                {movements.length === 0 ? <TableEmptyRow colSpan={8}>No hay movimientos para los filtros seleccionados.</TableEmptyRow> : null}
            </tbody>
          </Table>
        </TableWrap>

        {totalPages > 1 && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {page > 1 && (
              <Link href={buildPageUrl(page - 1)} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                Anterior
              </Link>
            )}
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
              return (
                <Link
                  key={p}
                  href={buildPageUrl(p)}
                  className={buttonStyles({ variant: p === page ? "primary" : "secondary", size: "sm" })}
                >
                  {p}
                </Link>
              );
            })}
            {page < totalPages && (
              <Link href={buildPageUrl(page + 1)} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                Siguiente
              </Link>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
