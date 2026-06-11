import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const variants = {
  neutral: "border-[var(--border-muted)] bg-[var(--surface-secondary)] text-[var(--status-neutral)]",
  accent: "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]",
  success: "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]",
  warning: "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]",
  danger: "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]",
} as const;

type Variant = keyof typeof variants;

const sizes = {
  sm: "rounded-[var(--radius-sm)] px-2 py-0.5 text-[11px]",
  md: "rounded-[var(--radius-sm)] px-2.5 py-1 text-xs",
} as const;

type Size = keyof typeof sizes;

type Props = HTMLAttributes<HTMLSpanElement> & {
  variant?: Variant | "info";
  size?: Size;
};

export function Badge({ className, variant = "neutral", size = "sm", ...props }: Props) {
  const normalizedVariant = variant === "info" ? "accent" : variant;

  return (
    <span
      className={cn(
        "inline-flex items-center border font-semibold uppercase tracking-wide",
        sizes[size],
        variants[normalizedVariant],
        className,
      )}
      {...props}
    />
  );
}
