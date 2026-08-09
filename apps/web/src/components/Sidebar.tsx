"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { ChevronLeft } from "lucide-react";
import { NAV_CONFIG } from "@/lib/nav-config";
import { useAuth } from "@/lib/auth-context";

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("jms-sidebar-collapsed") === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("jms-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  const sections = NAV_CONFIG.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.roles || (user && item.roles.includes(user.role))),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-200 ease-in-out",
          "md:static md:z-auto md:translate-x-0 md:flex md:min-h-screen",
          open ? "translate-x-0" : "-translate-x-full",
          collapsed && "md:w-[70px]"
        )}
      >
        <div className={clsx("flex items-center gap-2 px-5 py-6", collapsed && "md:justify-center md:px-2")}>
          <span className="text-lg font-semibold tracking-tight text-sidebar-primary">JMS</span>
          {!collapsed && (
            <span className="text-xs text-sidebar-foreground/50 mt-0.5">Manufacturing &amp; Costing</span>
          )}
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3">
          {sections.map((section) => (
            <div key={section.section}>
              {!collapsed && (
                <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-sidebar-foreground/40 uppercase">
                  {section.section}
                </div>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = pathname?.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      title={collapsed ? item.title : undefined}
                      className={clsx(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                        collapsed && "md:justify-center md:px-0",
                        active
                          ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      )}
                    >
                      <Icon size={18} className="shrink-0" />
                      {!collapsed && <span className="truncate">{item.title}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="hidden border-t border-sidebar-border px-3 py-2 md:block">
          <button
            onClick={toggleCollapsed}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <ChevronLeft size={16} className={clsx("transition-transform", collapsed && "rotate-180")} />
            {!collapsed && "Collapse"}
          </button>
        </div>
        {!collapsed && (
          <div className="border-t border-sidebar-border px-5 py-3 text-[11px] text-sidebar-foreground/40 md:border-t-0">
            v1.0 · Phase 1–5 build
          </div>
        )}
      </aside>
    </>
  );
}
