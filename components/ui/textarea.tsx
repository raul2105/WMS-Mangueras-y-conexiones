import { useId, type ReactNode, type TextareaHTMLAttributes } from "react";
import { FieldShell } from "@/components/ui/field-shell";
import { cn } from "@/lib/cn";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  rootClassName?: string;
  textareaClassName?: string;
};

export function Textarea({
  id,
  label,
  hint,
  error,
  required,
  className,
  rootClassName,
  textareaClassName,
  "aria-describedby": ariaDescribedBy,
  ...props
}: Props) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const hintId = hint ? `${textareaId}-hint` : undefined;
  const errorId = error ? `${textareaId}-error` : undefined;
  const describedBy = [ariaDescribedBy, hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldShell
      id={textareaId}
      label={label}
      hint={hint ? <span id={hintId}>{hint}</span> : undefined}
      error={error ? <span id={errorId}>{error}</span> : undefined}
      required={required}
      rootClassName={rootClassName}
    >
      <div className={className}>
        <textarea
          id={textareaId}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn("field min-h-[96px] resize-y", textareaClassName)}
          {...props}
        />
      </div>
    </FieldShell>
  );
}
