"use client";

import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { NavItem } from "@/components/layout/nav-config";
import { MenuIcon, PanelCloseIcon, PanelOpenIcon, UserCircleIcon } from "@/components/ui/icons";
import ThemeToggle from "@/components/ThemeToggle";
import { signOut } from "next-auth/react";

type Props = {
  activeModule: NavItem;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMobileNav: () => void;
  userName: string;
  userEmail: string;
};

export default function AppTopbar({
  activeModule,
  sidebarCollapsed,
  onToggleSidebar,
  onOpenMobileNav,
  userName,
  userEmail,
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
              <p className="text-xs font-medium text-[var(--text-primary)]">{userName}</p>
              <p className="text-[11px] text-[var(--text-muted)]">{userEmail}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className={cn(buttonStyles({ variant: "secondary", size: "sm" }))}
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <span className="hidden text-xs md:inline">Salir</span>
            <svg className="h-4 w-4 md:ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
