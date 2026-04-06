import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/cn";

type Props = {
  label: string;
  value: string;
  icon?: ReactNode;
  meta?: string;
  tone?: "default" | "accent" | "success" | "warning" | "danger" | "info";
};

const toneClass: Record<Exclude<NonNullable<Props["tone"]>, "info">, string> = {
  default: "text-[var(--text-primary)]",
  accent: "text-[var(--accent)]",
  success: "text-[var(--success)]",
  warning: "text-[var(--warning)]",
  danger: "text-[var(--danger)]",
};

export function StatCard({ label, value, icon, meta, tone = "default" }: Props) {
  const normalizedTone = tone === "info" ? "accent" : tone;

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
          <p className={cn("text-2xl font-semibold", toneClass[normalizedTone])}>{value}</p>
          {meta ? <p className="text-xs text-[var(--text-muted)]">{meta}</p> : null}
        </div>
        {icon ? <div className={cn("text-[var(--text-muted)]", normalizedTone !== "default" ? toneClass[normalizedTone] : "")}>{icon}</div> : null}
      </CardContent>
    </Card>
  );
}
