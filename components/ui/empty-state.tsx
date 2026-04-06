import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
  className?: string;
};

export function EmptyState({ title, description, actions, icon, compact = false, className }: Props) {
  return (
    <section
      className={cn(
        "surface flex flex-col items-center justify-center gap-2 text-center",
        compact ? "px-4 py-5" : "px-6 py-10",
        className,
      )}
    >
      {icon ? <div className="text-[var(--text-muted)]">{icon}</div> : null}
      <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
      {description ? <p className="max-w-[48ch] text-sm text-[var(--text-muted)]">{description}</p> : null}
      {actions ? <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
    </section>
  );
}
