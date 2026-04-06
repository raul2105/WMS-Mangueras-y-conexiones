import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const variants = {
  neutral: "border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
  accent: "border-[color-mix(in_oklab,var(--accent)_35%,var(--border-default))] bg-[var(--accent-soft)] text-[var(--accent)]",
  success: "border-[color-mix(in_oklab,var(--success)_35%,var(--border-default))] bg-[var(--success-soft)] text-[var(--success)]",
  warning: "border-[color-mix(in_oklab,var(--warning)_35%,var(--border-default))] bg-[var(--warning-soft)] text-[var(--warning)]",
  danger: "border-[color-mix(in_oklab,var(--danger)_35%,var(--border-default))] bg-[var(--danger-soft)] text-[var(--danger)]",
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
