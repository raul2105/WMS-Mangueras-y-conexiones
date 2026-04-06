"use client";

import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { NavItem } from "@/components/layout/nav-config";
import { MenuIcon, PanelCloseIcon, PanelOpenIcon, UserCircleIcon } from "@/components/ui/icons";
import ThemeToggle from "@/components/ThemeToggle";

type Props = {
  activeModule: NavItem;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMobileNav: () => void;
};

export default function AppTopbar({
  activeModule,
  sidebarCollapsed,
  onToggleSidebar,
  onOpenMobileNav,
}: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--shell-bg)]/95 backdrop-blur-sm">
      <div className="flex h-16 items-center justify-between gap-3 px-4 md:px-5">
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          <button
            type="button"
            aria-label="Abrir navegacion"
            className={cn(buttonStyles({ variant: "secondary", size: "sm" }), "md:hidden")}
            onClick={onOpenMobileNav}
          >
            <MenuIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={sidebarCollapsed ? "Expandir sidebar" : "Colapsar sidebar"}
            className={cn(buttonStyles({ variant: "secondary", size: "sm" }), "hidden md:inline-flex")}
            onClick={onToggleSidebar}
          >
            {sidebarCollapsed ? <PanelOpenIcon className="h-4 w-4" /> : <PanelCloseIcon className="h-4 w-4" />}
          </button>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{activeModule.label}</p>
            <p className="hidden truncate text-xs text-[var(--text-muted)] md:block">{activeModule.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle compact />
          <div className="hidden items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2.5 py-1.5 md:flex">
            <UserCircleIcon className="h-4 w-4 text-[var(--text-muted)]" />
            <div className="leading-tight">
              <p className="text-xs font-medium text-[var(--text-primary)]">Usuario</p>
              <p className="text-[11px] text-[var(--text-muted)]">Admin</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

