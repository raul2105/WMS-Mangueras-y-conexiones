import type { HTMLAttributes, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type TableWrapProps = HTMLAttributes<HTMLDivElement> & {
  dense?: boolean;
  striped?: boolean;
  hoverable?: boolean;
};

export function TableWrap({ className, dense = false, striped = false, hoverable = true, ...props }: TableWrapProps) {
  return (
    <div
      className={cn(
        "table-shell overflow-x-auto [&_tbody_tr:last-child_td]:border-b-0",
        dense ? "[&_td]:py-2 [&_th]:py-2" : "",
        striped ? "[&_tbody_tr:nth-child(even)]:bg-[var(--bg-subtle)]" : "",
        hoverable ? "[&_tbody_tr:hover]:bg-[var(--bg-subtle)]" : "",
        className,
      )}
      {...props}
    />
  );
}

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full border-collapse text-sm", className)} {...props} />;
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "border-b border-[var(--border-default)] bg-[var(--bg-subtle)] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-[var(--border-default)] px-3 py-3 align-middle text-[var(--text-secondary)]", className)} {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors", className)} {...props} />;
}

type TableEmptyRowProps = TdHTMLAttributes<HTMLTableCellElement> & {
  colSpan: number;
};

export function TableEmptyRow({ className, colSpan, children, ...props }: TableEmptyRowProps) {
  return (
    <tr>
      <Td colSpan={colSpan} className={cn("py-10 text-center text-sm text-[var(--text-muted)]", className)} {...props}>
        {children}
      </Td>
    </tr>
  );
}
