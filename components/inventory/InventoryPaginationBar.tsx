import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";

type Props = {
  safePage: number;
  totalPages: number;
  totalRows: number;
  pageSize: number;
  buildHref: (page: number) => string;
};

export function InventoryPaginationBar({ safePage, totalPages, totalRows, pageSize, buildHref }: Props) {
  if (totalPages <= 1) {
    return (
      <div className="flex w-full items-center justify-between gap-3 text-sm text-[var(--text-muted)]">
        <span>Mostrando {totalRows === 0 ? 0 : 1}-{Math.min(pageSize, totalRows)} de {totalRows}</span>
        <span>Una sola pagina</span>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <p className="text-sm text-[var(--text-muted)]">
        Mostrando {(safePage - 1) * pageSize + 1}-{Math.min(safePage * pageSize, totalRows)} de {totalRows.toLocaleString("es-MX")} registros
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={buildHref(Math.max(1, safePage - 1))}
          className={buttonStyles({ variant: "secondary", size: "sm", className: safePage <= 1 ? "pointer-events-none opacity-40" : "" })}
        >
          Anterior
        </Link>
        <div className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)]">
          Pagina {safePage} / {totalPages}
        </div>
        <Link
          href={buildHref(Math.min(totalPages, safePage + 1))}
          className={buttonStyles({ variant: "secondary", size: "sm", className: safePage >= totalPages ? "pointer-events-none opacity-40" : "" })}
        >
          Siguiente
        </Link>
      </div>
    </div>
  );
}