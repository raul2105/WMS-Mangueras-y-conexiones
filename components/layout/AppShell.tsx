"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { NAV_ITEMS, getActiveNavItem } from "@/components/layout/nav-config";
import SidebarNav from "@/components/layout/SidebarNav";
import AppTopbar from "@/components/layout/AppTopbar";
import MobileNav from "@/components/layout/MobileNav";
import ThemeToggle from "@/components/ThemeToggle";

type Props = {
  children: ReactNode;
};

const SIDEBAR_STORAGE_KEY = "wms-shell-sidebar-collapsed";

export default function AppShell({ children }: Props) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      // Ignore storage failures.
    }
  }, [sidebarCollapsed]);

  const activeModule = useMemo(() => getActiveNavItem(pathname), [pathname]);
  const desktopSidebarWidth = sidebarCollapsed ? "5rem" : "17rem";

  return (
    <div
      className="grid min-h-screen bg-[var(--bg-app)] md:grid-cols-[var(--sidebar-width)_1fr]"
      style={{ "--sidebar-width": desktopSidebarWidth } as CSSProperties}
    >
      <aside className="hidden border-r border-[var(--border-subtle)] bg-[var(--shell-bg)] md:flex md:h-screen md:flex-col md:sticky md:top-0">
        <div className="border-b border-[var(--border-subtle)] px-4 py-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
            {sidebarCollapsed ? "SCM" : "SCMAYER"}
          </p>
          {!sidebarCollapsed ? <p className="text-sm font-semibold text-[var(--text-primary)]">WMS ERP</p> : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNav pathname={pathname} collapsed={sidebarCollapsed} mode="desktop" modules={NAV_ITEMS} />
        </div>

        <div className="border-t border-[var(--border-subtle)] p-2">
          <ThemeToggle compact={sidebarCollapsed} className="w-full justify-start" />
        </div>
      </aside>

      <div className="min-w-0">
        <AppTopbar
          activeModule={activeModule}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        <main className="mx-auto min-w-0 max-w-[1600px] p-4 md:p-6 lg:p-8">{children}</main>
      </div>

      <MobileNav open={mobileNavOpen} pathname={pathname} modules={NAV_ITEMS} onClose={() => setMobileNavOpen(false)} />
    </div>
  );
}
