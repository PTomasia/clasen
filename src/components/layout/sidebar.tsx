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
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, sprint: 3 },
  { name: "Planos", href: "/planos", icon: FileText, sprint: 1 },
  { name: "Clientes", href: "/clientes", icon: Users, sprint: 2 },
  { name: "Perfil Ideal", href: "/icp", icon: UserCheck, sprint: 3 },
  { name: "Receitas Avulsas", href: "/receitas-avulsas", icon: DollarSign, sprint: 4 },
  { name: "Aquisição", href: "/aquisicao", icon: TrendingUp, sprint: 4 },
  { name: "Despesas", href: "/despesas", icon: Receipt, sprint: 5 },
];

const CURRENT_SPRINT = 4;

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
          "fixed lg:static inset-y-0 left-0 z-40 w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="p-6 border-b border-sidebar-border">
          <h1 className="text-xl font-bold tracking-tight font-[var(--font-heading)]">
            Clasen ADM
          </h1>
          <p className="text-sm text-sidebar-foreground/70 mt-1">
            Gestão da agência
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navigation.map((item) => {
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
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border">
          <p className="text-xs text-sidebar-foreground/50">
            Clasen Studio &copy; {new Date().getFullYear()}
          </p>
        </div>
      </aside>
    </>
  );
}
