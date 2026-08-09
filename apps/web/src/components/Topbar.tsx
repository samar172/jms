"use client";

import { useState } from "react";
import { Menu, Search, Bell, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/hooks";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
}

const ENTITY_HREF: Record<string, (id: string) => string> = {
  JobStage: () => "/reconciliation",
  Order: (id) => `/orders/${id}`,
};

export function Topbar({ onMenuClick }: { title?: string; onMenuClick?: () => void }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [notifOpen, setNotifOpen] = useState(false);
  const { data: unread } = useApi<{ count: number }>("/api/notifications/unread-count");
  const { data: notifications, mutate: mutateNotifs } = useApi<NotificationRow[]>(
    notifOpen ? "/api/notifications" : null
  );

  async function openNotification(n: NotificationRow) {
    if (!n.isRead) {
      await apiFetch(`/api/notifications/${n.id}/read`, { method: "POST" });
      await mutateNotifs();
    }
    setNotifOpen(false);
    if (n.entityType && n.entityId && ENTITY_HREF[n.entityType]) {
      router.push(ENTITY_HREF[n.entityType](n.entityId));
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3.5 border-b border-line bg-panel px-3.5">
      <button
        className="text-ink2 hover:text-ink md:hidden shrink-0"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>
      <div className="hidden sm:flex items-center gap-1.5 font-bold text-[14px] text-ink shrink-0">
        <span className="w-[9px] h-[9px] rounded-[2px] bg-accent" />
        JMS
      </div>
      <button
        className="console-search w-full max-w-[340px] cursor-text"
        onClick={() => window.dispatchEvent(new Event("jms:open-search"))}
      >
        <Search size={13} />
        <span className="flex-1 text-left text-mute">Search customer, estimate, job, design…</span>
        <kbd className="hidden sm:inline border border-line bg-panel text-ink2 rounded-[3px] text-[10px] px-1">
          ⌘K
        </kbd>
      </button>
      <div className="flex-1" />
      <div className="relative">
        <button
          className="text-ink2 hover:text-ink hidden sm:inline-flex relative"
          onClick={() => setNotifOpen((v) => !v)}
        >
          <Bell size={16} />
          {!!unread?.count && (
            <span className="absolute -top-1.5 -right-1.5 bg-err-bg text-err-tx border border-err-bd rounded-full text-[9px] font-bold min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
              {unread.count > 9 ? "9+" : unread.count}
            </span>
          )}
        </button>
        {notifOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
            <div className="absolute right-0 top-8 z-50 w-[340px] bg-panel border border-line rounded-md shadow-xl overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-line text-[11px] font-bold uppercase text-ink2 tracking-wide">
                Notifications
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {notifications?.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => openNotification(n)}
                    className={`w-full text-left px-3.5 py-2.5 border-b border-line last:border-0 hover:bg-neu-bg ${!n.isRead ? "bg-accent-bg" : ""}`}
                  >
                    <div className="text-[12.5px] font-medium text-ink">{n.title}</div>
                    {n.body && <div className="text-[11px] text-ink2 mt-0.5">{n.body}</div>}
                    <div className="text-[10.5px] text-mute mt-1">{formatDateTime(n.createdAt)}</div>
                  </button>
                ))}
                {notifications?.length === 0 && (
                  <div className="px-3.5 py-6 text-center text-mute text-sm">No notifications.</div>
                )}
                {!notifications && <div className="px-3.5 py-6 text-center text-mute text-sm">Loading…</div>}
              </div>
            </div>
          </>
        )}
      </div>
      {user && (
        <div className="hidden sm:flex items-center gap-2">
          <div className="w-[26px] h-[26px] rounded-[5px] bg-accent text-white flex items-center justify-center text-[11px] font-semibold">
            {user.name.charAt(0)}
          </div>
          <div className="text-xs leading-tight">
            <div className="font-medium text-ink">{user.name}</div>
            <div className="text-mute">{user.role.replace(/_/g, " ")}</div>
          </div>
        </div>
      )}
      <button
        className="text-ink2 hover:text-err-tx"
        title="Sign out"
        onClick={async () => {
          await logout();
          router.push("/login");
        }}
      >
        <LogOut size={16} />
      </button>
    </header>
  );
}
