export const THEME_STORAGE_KEY = "wms-theme";
export const THEME_COOKIE_KEY = "wms-theme";
export const SIDEBAR_STORAGE_KEY = "wms-shell-sidebar-collapsed";
export const SIDEBAR_COOKIE_KEY = "wms-shell-sidebar-collapsed";

export type ThemePreference = "dark" | "light";

export function normalizeThemePreference(value: string | undefined): ThemePreference {
  return value === "light" ? "light" : "dark";
}

export function normalizeSidebarPreference(value: string | undefined): boolean {
  return value === "1";
}
