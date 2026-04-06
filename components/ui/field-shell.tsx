import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type FieldShellProps = {
  id: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  rootClassName?: string;
  labelClassName?: string;
  hintClassName?: string;
  errorClassName?: string;
  children: ReactNode;
};

export function FieldShell({
  id,
  label,
  hint,
  error,
  required = false,
  rootClassName,
  labelClassName,
  hintClassName,
  errorClassName,
  children,
}: FieldShellProps) {
  return (
    <div className={cn("space-y-1.5", rootClassName)}>
      {label ? (
        <label htmlFor={id} className={cn("block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]", labelClassName)}>
          <span>{label}</span>
          {required ? <span className="ml-1 text-[var(--danger)]">*</span> : null}
        </label>
      ) : null}
      {children}
      {hint ? <p className={cn("text-xs text-[var(--text-muted)]", hintClassName)}>{hint}</p> : null}
      {error ? <p className={cn("text-xs text-[var(--danger)]", errorClassName)}>{error}</p> : null}
    </div>
  );
}
