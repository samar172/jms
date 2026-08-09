"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { CommandPalette } from "@/components/CommandPalette";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-text-muted text-sm">
        Loading…
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="console flex min-h-screen bg-canvas">
      <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMenuClick={() => setMobileNavOpen((o) => !o)} />
        <main className="flex-1 p-3.5 sm:px-[18px] sm:py-3.5">{children}</main>
      </div>
      <CommandPalette />
    </div>
  );
}
