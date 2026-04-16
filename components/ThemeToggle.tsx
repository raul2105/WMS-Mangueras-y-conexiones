// client component
"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "@/components/ui/icons";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { THEME_COOKIE_KEY, THEME_STORAGE_KEY, type ThemePreference } from "@/lib/ui-preferences";
type Theme = ThemePreference;

function getPreferredTheme(): Theme {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function getAppliedTheme(): Theme | null {
  const theme = document.documentElement.getAttribute("data-theme");
  return theme === "dark" || theme === "light" ? theme : null;
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
  document.cookie = `${THEME_COOKIE_KEY}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

type ThemeToggleProps = {
  compact?: boolean;
  className?: string;
};

export default function ThemeToggle({ compact = false, className }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return "dark";
    }

    return getAppliedTheme() ?? getPreferredTheme();
  });

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        buttonStyles({ variant: "secondary", size: "sm" }),
        compact ? "px-2.5" : "w-full justify-start gap-2",
        className,
      )}
      aria-label="Cambiar tema"
      title="Cambiar tema"
    >
      {theme === "dark" ? <MoonIcon className="h-4 w-4" /> : <SunIcon className="h-4 w-4" />}
      {!compact ? <span>{theme === "dark" ? "Modo oscuro" : "Modo claro"}</span> : null}
    </button>
  );
}
