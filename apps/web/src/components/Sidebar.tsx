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
  BookOpen,
  Package,
  Wrench,
  ShieldCheck,
  Send,
  Scale,
  Diamond,
  History,
  UserCog,
} from "lucide-react";
import type { Role } from "@jms/shared";
import { useAuth } from "@/lib/auth-context";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[]; // omit = everyone
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Sales",
    items: [
      { href: "/costing", label: "Estimates & Costing", icon: Calculator, roles: ["SUPER_ADMIN", "MANAGER", "COSTING", "AUDITOR"] },
      { href: "/orders", label: "Orders", icon: Package },
    ],
  },
  {
    label: "Manufacturing",
    items: [
      { href: "/job-cards", label: "Job Cards", icon: ClipboardList },
      { href: "/karigars", label: "Karigars", icon: Users },
      { href: "/assembly", label: "Assembly", icon: Wrench },
      { href: "/qc", label: "Quality Control", icon: ShieldCheck },
    ],
  },
  {
    label: "Material",
    items: [
      { href: "/materials", label: "Materials & Stock", icon: Boxes, roles: ["SUPER_ADMIN", "MANAGER", "STORE", "COSTING", "AUDITOR"] },
      { href: "/material-vouchers", label: "Material Issue / Return", icon: Send, roles: ["SUPER_ADMIN", "MANAGER", "STORE", "COSTING", "AUDITOR"] },
      { href: "/reconciliation", label: "Reconciliation", icon: Scale, roles: ["SUPER_ADMIN", "MANAGER", "STORE", "COSTING", "AUDITOR"] },
      { href: "/stone-ledger", label: "Stone Ledger", icon: Diamond, roles: ["SUPER_ADMIN", "MANAGER", "STORE", "COSTING", "AUDITOR"] },
    ],
  },
  {
    label: "Product",
    items: [
      { href: "/products", label: "Products", icon: Gem },
      { href: "/visual-search", label: "Visual Search", icon: Camera },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/ledger", label: "Ledger", icon: BookOpen, roles: ["SUPER_ADMIN", "MANAGER", "COSTING", "SALES", "AUDITOR"] },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/settings", label: "Settings", icon: Settings, roles: ["SUPER_ADMIN"] },
      { href: "/users", label: "Users & Roles", icon: UserCog, roles: ["SUPER_ADMIN"] },
      { href: "/audit-log", label: "Audit Log", icon: History, roles: ["SUPER_ADMIN", "MANAGER", "AUDITOR"] },
    ],
  },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();

  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => !item.roles || (user && item.roles.includes(user.role))),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-[212px] shrink-0 flex-col bg-panel border-r border-line transition-transform duration-200 ease-in-out overflow-y-auto py-2.5",
          "md:static md:z-auto md:translate-x-0 md:flex md:min-h-screen",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-3.5 pt-2.5 pb-1 text-[10px] tracking-wide uppercase text-mute font-semibold">
              {group.label}
            </div>
            {group.items.map((item) => {
              const active = pathname?.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={clsx(
                    "flex items-center gap-2 px-3.5 py-1.5 text-[12.5px] border-l-2 transition-colors",
                    active
                      ? "bg-accent-bg text-accent border-accent font-semibold"
                      : "text-ink2 border-transparent hover:bg-neu-bg"
                  )}
                >
                  <Icon size={15} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </aside>
    </>
  );
}
