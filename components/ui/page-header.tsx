import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  title: string;
  description?: string;
  eyebrow?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, eyebrow, meta, actions, className }: Props) {
  return (
    <header className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="space-y-1.5">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)] md:text-3xl">{title}</h1>
        {description ? <p className="text-sm text-[var(--text-muted)] md:text-base">{description}</p> : null}
        {meta ? <div className="text-xs text-[var(--text-muted)]">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
