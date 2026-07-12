"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  LayoutDashboard,
  Gem,
  Camera,
  ClipboardList,
  Boxes,
  Calculator,
  Users,
  BarChart3,
  Settings,
} from "lucide-react";
import type { Role } from "@jms/shared";
import { useAuth } from "@/lib/auth-context";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[]; // omit = everyone
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Gem },
  { href: "/visual-search", label: "Visual Search", icon: Camera },
  { href: "/job-cards", label: "Job Cards", icon: ClipboardList },
  { href: "/materials", label: "Materials & Stock", icon: Boxes, roles: ["SUPER_ADMIN", "MANAGER", "STORE", "COSTING", "AUDITOR"] },
  { href: "/costing", label: "Costing", icon: Calculator, roles: ["SUPER_ADMIN", "MANAGER", "COSTING", "AUDITOR"] },
  { href: "/karigars", label: "Karigars", icon: Users },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["SUPER_ADMIN"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const items = NAV_ITEMS.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col bg-sidebar text-white min-h-screen">
      <div className="px-5 py-6">
        <div className="text-lg font-semibold tracking-tight">
          <span className="text-gold">JMS</span>
        </div>
        <div className="text-xs text-white/50 mt-0.5">Manufacturing &amp; Costing</div>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {items.map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                active ? "bg-gold text-white font-medium" : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-4 text-[11px] text-white/40 border-t border-white/10">
        v1.0 · Phase 1–5 build
      </div>
    </aside>
  );
}
