import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

const geistSans = { variable: 'font-sans' };
const geistMono = { variable: 'font-mono' };

export const metadata: Metadata = {
  title: "WMS Rigentec",
  description: "Sistema de Control de Inventario y Ensamble",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex bg-slate-900`}
      >
        {/* Sidebar */}
        <aside className="w-64 fixed h-full glass border-r border-white/10 hidden md:flex flex-col z-50">
          <div className="p-6">
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
              RIGENTEC
            </h1>
            <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">WMS PRO</p>
          </div>

          <nav className="flex-1 px-4 space-y-2 mt-4">
            <Link href="/" className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-all group">
              <span className="w-5 h-5 bg-slate-500/20 rounded flex items-center justify-center group-hover:bg-cyan-500/20 group-hover:text-cyan-400">📊</span>
              Dashboard
            </Link>
            <Link href="/catalog" className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-all group">
              <span className="w-5 h-5 bg-slate-500/20 rounded flex items-center justify-center group-hover:bg-cyan-500/20 group-hover:text-cyan-400">📦</span>
              Catálogo
            </Link>
            <Link href="/warehouse" className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-all group">
              <span className="w-5 h-5 bg-slate-500/20 rounded flex items-center justify-center group-hover:bg-cyan-500/20 group-hover:text-cyan-400">🏭</span>
              Almacenes
            </Link>
            <Link href="/inventory" className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-all group">
              <span className="w-5 h-5 bg-slate-500/20 rounded flex items-center justify-center group-hover:bg-cyan-500/20 group-hover:text-cyan-400">📊</span>
              Inventario
            </Link>
            <Link href="/production" className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-all group">
              <span className="w-5 h-5 bg-slate-500/20 rounded flex items-center justify-center group-hover:bg-cyan-500/20 group-hover:text-cyan-400">🔧</span>
              Ensamble
            </Link>
          </nav>

          <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-3 px-4 py-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-400 to-blue-600"></div>
              <div>
                <p className="text-sm font-medium text-white">Usuario</p>
                <p className="text-xs text-slate-400">Admin</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 md:ml-64 p-8 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
