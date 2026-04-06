import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { FieldShell } from "@/components/ui/field-shell";
import { cn } from "@/lib/cn";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  rootClassName?: string;
  inputClassName?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
};

export function Input({
  id,
  label,
  hint,
  error,
  required,
  className,
  rootClassName,
  inputClassName,
  leading,
  trailing,
  "aria-describedby": ariaDescribedBy,
  ...props
}: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [ariaDescribedBy, hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldShell
      id={inputId}
      label={label}
      hint={hint ? <span id={hintId}>{hint}</span> : undefined}
      error={error ? <span id={errorId}>{error}</span> : undefined}
      required={required}
      rootClassName={rootClassName}
    >
      <div className={cn("relative", className)}>
        {leading ? <span className="pointer-events-none absolute inset-y-0 left-3 inline-flex items-center text-[var(--text-muted)]">{leading}</span> : null}
        <input
          id={inputId}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn("field h-10", leading ? "pl-9" : "", trailing ? "pr-9" : "", inputClassName)}
          {...props}
        />
        {trailing ? <span className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center text-[var(--text-muted)]">{trailing}</span> : null}
      </div>
    </FieldShell>
  );
}
