import { useId, type ReactNode, type SelectHTMLAttributes } from "react";
import { FieldShell } from "@/components/ui/field-shell";
import { ChevronDownIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export type SelectOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  options?: SelectOption[];
  placeholder?: string;
  rootClassName?: string;
  selectClassName?: string;
};

export function Select({
  id,
  label,
  hint,
  error,
  options,
  placeholder,
  required,
  className,
  rootClassName,
  selectClassName,
  children,
  "aria-describedby": ariaDescribedBy,
  ...props
}: Props) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;
  const describedBy = [ariaDescribedBy, hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldShell
      id={selectId}
      label={label}
      hint={hint ? <span id={hintId}>{hint}</span> : undefined}
      error={error ? <span id={errorId}>{error}</span> : undefined}
      required={required}
      rootClassName={rootClassName}
    >
      <div className={cn("relative", className)}>
        <select
          id={selectId}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn("field h-10 appearance-none pr-9", selectClassName)}
          {...props}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options ? options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>) : children}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
      </div>
    </FieldShell>
  );
}
