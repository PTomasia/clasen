"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Users,
  DollarSign,
  TrendingUp,
  Receipt,
  Menu,
  X,
  UserCheck,
  GitMerge,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type NavItem = { name: string; href: string; icon: typeof LayoutDashboard; sprint: number };
type NavGroup = { label: string; items: NavItem[] };

const navigation: NavGroup[] = [
  {
    label: "Operação",
    items: [
      { name: "Planos", href: "/planos", icon: FileText, sprint: 1 },
      { name: "Clientes", href: "/clientes", icon: Users, sprint: 2 },
      { name: "Conciliação", href: "/conciliacao", icon: GitMerge, sprint: 7 },
    ],
  },
  {
    label: "Análise",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, sprint: 3 },
      { name: "Perfil Ideal", href: "/icp", icon: UserCheck, sprint: 3 },
      { name: "Aquisição", href: "/aquisicao", icon: TrendingUp, sprint: 4 },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { name: "Receitas Avulsas", href: "/receitas-avulsas", icon: DollarSign, sprint: 4 },
      { name: "Despesas", href: "/despesas", icon: Receipt, sprint: 5 },
    ],
  },
];

const CURRENT_SPRINT = 6;

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-sidebar text-sidebar-foreground shadow-md"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:sticky lg:top-0 lg:h-screen inset-y-0 left-0 z-40 w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <svg
              aria-hidden
              viewBox="0 0 36 36"
              className="size-8 shrink-0"
              fill="none"
            >
              <circle cx="18" cy="18" r="17" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1" />
              <path
                d="M24.5 13.4a8 8 0 1 0 0 9.2"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                fill="none"
              />
              <circle cx="18" cy="18" r="1.6" fill="currentColor" />
            </svg>
            <div>
              <h1
                className="text-xl tracking-tight leading-none"
                style={{ fontFamily: "var(--font-heading), serif" }}
              >
                Clasen ADM
              </h1>
              <p className="text-[11px] uppercase tracking-[0.18em] text-sidebar-foreground/60 mt-1.5">
                Gestão da agência
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
          {navigation.map((group) => {
            const renderedItems = group.items.map((item) => {
              const isActive = pathname === item.href;
              const isAvailable = item.sprint <= CURRENT_SPRINT;

              if (!isAvailable) {
                return (
                  <div
                    key={item.name}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/40 cursor-not-allowed"
                  >
                    <item.icon size={18} />
                    <span className="text-sm">{item.name}</span>
                    <span className="ml-auto text-xs bg-sidebar-accent/50 px-1.5 py-0.5 rounded text-sidebar-foreground/50">
                      em breve
                    </span>
                  </div>
                );
              }

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <item.icon size={18} />
                  <span>{item.name}</span>
                </Link>
              );
            });

            return (
              <div key={group.label}>
                <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/40">
                  {group.label}
                </p>
                <div className="space-y-1">{renderedItems}</div>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border space-y-2">
          <a
            href="mailto:pedro.tomasia@gmail.com?subject=Clasen ADM — feedback"
            className="flex items-center justify-between text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
          >
            <span>Enviar feedback</span>
            <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M5 11l6-6M11 5H6.5M11 5v4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <p className="text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/40">
            Clasen Studio · {new Date().getFullYear()}
          </p>
        </div>
      </aside>
    </>
  );
}
