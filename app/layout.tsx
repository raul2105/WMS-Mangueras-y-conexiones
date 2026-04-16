import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";
import { cookies } from "next/headers";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { THEME_COOKIE_KEY, THEME_STORAGE_KEY, normalizeThemePreference } from "@/lib/ui-preferences";

const plexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "WMS-SCMayher",
  description: "WMS-SCMayher - Sistema de control de inventario y ensamble",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialTheme = normalizeThemePreference(cookieStore.get(THEME_COOKIE_KEY)?.value);

  return (
    <html lang="es" suppressHydrationWarning data-theme={initialTheme} style={{ colorScheme: initialTheme }}>
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var cookieMatch = document.cookie.match(/(?:^|; )${THEME_COOKIE_KEY}=([^;]+)/);
                  var cookieTheme = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
                  var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
                  var theme = stored === 'dark' || stored === 'light'
                    ? stored
                    : (cookieTheme === 'dark' || cookieTheme === 'light'
                        ? cookieTheme
                        : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
                  document.documentElement.setAttribute('data-theme', theme);
                  document.documentElement.style.colorScheme = theme;
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${plexSans.variable} ${plexMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
