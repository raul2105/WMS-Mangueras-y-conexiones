import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

const variants = {
  primary: "border-[var(--accent)] bg-[var(--accent)] text-white hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)]",
  secondary:
    "border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]",
  ghost: "border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]",
  danger: "border-[var(--danger-soft-hover)] bg-[var(--danger-soft)] text-[var(--danger-text)] hover:bg-[var(--danger-soft-hover)]",
} as const;

const sizes = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

type ButtonStyleInput = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
};

export function buttonStyles({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: ButtonStyleInput = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] border font-semibold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-55",
    sizes[size],
    variants[variant],
    fullWidth ? "w-full" : "",
    className,
  );
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
  leadingIcon,
  trailingIcon,
  children,
  ...props
}: Props) {
  return (
    <button className={buttonStyles({ variant, size, fullWidth, className })} {...props}>
      {leadingIcon ? <span className="shrink-0">{leadingIcon}</span> : null}
      {children ? <span>{children}</span> : null}
      {trailingIcon ? <span className="shrink-0">{trailingIcon}</span> : null}
    </button>
  );
}
