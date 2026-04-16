"use client";

import { useEffect, useRef } from "react";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { CloseIcon, UserCircleIcon } from "@/components/ui/icons";
import type { NavItem } from "@/components/layout/nav-config";
import SidebarNav from "@/components/layout/SidebarNav";
import ThemeToggle from "@/components/ThemeToggle";

type Props = {
  open: boolean;
  pathname: string;
  modules: NavItem[];
  userName: string;
  userEmail: string;
  onClose: () => void;
};

export default function MobileNav({ open, pathname, modules, userName, userEmail, onClose }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  return (
    <div
      className={cn("fixed inset-0 z-50 md:hidden transition-[visibility] duration-150", open ? "visible" : "invisible")}
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      aria-labelledby="mobile-nav-title"
    >
      <button
        type="button"
        aria-label="Cerrar menu"
        className={cn(
          "absolute inset-0 bg-black/40 transition-opacity duration-150",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "relative h-full w-[86%] max-w-[20rem] border-r border-[var(--border-subtle)] bg-[var(--shell-bg)] p-3 shadow-xl transition-transform duration-150",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-2 flex items-center justify-between border-b border-[var(--border-subtle)] px-2 pb-3 pt-1">
          <div>
            <p id="mobile-nav-title" className="text-sm font-semibold text-[var(--text-primary)]">WMS ERP</p>
            <p className="text-xs text-[var(--text-muted)]">Navegacion principal</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Cerrar navegacion"
            onClick={onClose}
            className={cn(buttonStyles({ variant: "secondary", size: "sm" }), "px-2.5")}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <SidebarNav pathname={pathname} mode="mobile" modules={modules} onNavigate={onClose} />

        <div className="mt-3 space-y-2 border-t border-[var(--border-subtle)] p-2">
          <ThemeToggle className="w-full justify-start" />
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2.5 py-2">
            <UserCircleIcon className="h-4 w-4 text-[var(--text-muted)]" />
            <div className="leading-tight">
              <p className="text-xs font-medium text-[var(--text-primary)]">{userName}</p>
              <p className="text-[11px] text-[var(--text-muted)]">{userEmail}</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
