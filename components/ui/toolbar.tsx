import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ToolbarProps = HTMLAttributes<HTMLDivElement> & {
  align?: "start" | "between" | "end";
};

const alignClass = {
  start: "justify-start",
  between: "justify-between",
  end: "justify-end",
} as const;

export function Toolbar({ className, align = "between", ...props }: ToolbarProps) {
  return <div className={cn("toolbar", alignClass[align], className)} {...props} />;
}

type ToolbarGroupProps = HTMLAttributes<HTMLDivElement> & {
  grow?: boolean;
};

export function ToolbarGroup({ className, grow = false, ...props }: ToolbarGroupProps) {
  return <div className={cn("flex flex-wrap items-center gap-2", grow ? "flex-1" : "", className)} {...props} />;
}
