"use client";

import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { NAV_ITEMS, type NavIcon, type NavItem, isNavItemActive } from "@/components/layout/nav-config";
import { cn } from "@/lib/cn";
import {
  AuditIcon,
  BoxIcon,
  ChevronRightIcon,
  DashboardIcon,
  InventoryIcon,
  ProductionIcon,
  PurchasingIcon,
  SalesIcon,
  WarehouseIcon,
} from "@/components/ui/icons";

const iconMap: Record<NavIcon, ComponentType<SVGProps<SVGSVGElement>>> = {
  dashboard: DashboardIcon,
  catalog: BoxIcon,
  warehouse: WarehouseIcon,
  inventory: InventoryIcon,
  sales: SalesIcon,
  purchasing: PurchasingIcon,
  production: ProductionIcon,
  audit: AuditIcon,
};

type Props = {
  pathname: string;
  collapsed?: boolean;
  mode?: "desktop" | "mobile";
  modules?: NavItem[];
  onNavigate?: () => void;
};

export default function SidebarNav({
  pathname,
  collapsed = false,
  mode = "desktop",
  modules = NAV_ITEMS,
  onNavigate,
}: Props) {
  return (
    <nav className="space-y-1 px-2 py-3" aria-label="Navegacion principal">
      {modules.map((item) => {
        const Icon = iconMap[item.icon];
        const active = isNavItemActive(pathname, item);
        const compact = mode === "desktop" && collapsed;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={compact ? item.label : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center rounded-lg border px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
              active
                ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                : "border-transparent text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]",
              compact ? "justify-center px-2" : "gap-3",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!compact ? (
              <>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {mode === "mobile" ? <ChevronRightIcon className="h-4 w-4 text-[var(--text-muted)]" /> : null}
              </>
            ) : (
              <span className="sr-only">{item.label}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

