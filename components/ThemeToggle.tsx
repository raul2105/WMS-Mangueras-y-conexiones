// client component
"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "wms-theme";

type Theme = "dark" | "light";

function getPreferredTheme(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const preferred = getPreferredTheme();
    setTheme(preferred);
    applyTheme(preferred);
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  };

  // Render placeholder during SSR / before hydration to avoid mismatch
  if (!mounted) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg glass text-sm text-slate-300 w-32 h-9" />
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex items-center gap-2 px-3 py-2 rounded-lg glass text-sm text-slate-300 hover:text-white transition-colors"
      aria-label="Cambiar tema"
      title="Cambiar tema"
    >
      <span className="text-base">{theme === "dark" ? "☾" : "☀"}</span>
      {theme === "dark" ? "Modo oscuro" : "Modo claro"}
    </button>
  );
}
