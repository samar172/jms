"use client";

import { Search, Bell, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";

export function Topbar({ title }: { title?: string }) {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-surface px-6 py-3">
      <div className="flex items-center gap-3 flex-1">
        {title && <h1 className="text-base font-semibold">{title}</h1>}
        <div className="relative flex-1 max-w-sm ml-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            className="input pl-9 py-1.5 bg-bg"
            placeholder="Search serial number, design, karigar…"
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button className="relative text-text-muted hover:text-text">
          <Bell size={18} />
        </button>
        {user && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gold-tint text-gold flex items-center justify-center text-sm font-semibold">
              {user.name.charAt(0)}
            </div>
            <div className="text-sm hidden sm:block">
              <div className="font-medium leading-tight">{user.name}</div>
              <div className="text-xs text-text-muted leading-tight">{user.role.replace(/_/g, " ")}</div>
            </div>
          </div>
        )}
        <button
          className="text-text-muted hover:text-danger"
          title="Sign out"
          onClick={async () => {
            await logout();
            router.push("/login");
          }}
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
