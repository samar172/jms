"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import Link from "next/link";

export function Drawer({
  open,
  onClose,
  id,
  name,
  fullHref,
  children,
}: {
  open: boolean;
  onClose: () => void;
  id: string;
  name: string;
  fullHref: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/25 z-40 transition-opacity ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-[440px] bg-panel border-l border-line shadow-xl z-50 flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between px-4 py-3 border-b border-line">
          <div>
            <div className="mono text-accent font-bold text-[13px]">{id}</div>
            <div className="text-[15px] font-bold text-ink mt-0.5">{name}</div>
          </div>
          <button className="text-mute hover:text-ink" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3.5">{children}</div>
        <div className="px-4 py-2.5 border-t border-line">
          <Link href={fullHref} className="console-btn primary w-full justify-center" onClick={onClose}>
            Open Full Record
          </Link>
        </div>
      </div>
    </>
  );
}

export function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[10.5px] uppercase tracking-wide text-mute font-bold mb-1.5">{title}</div>
      {children}
    </div>
  );
}

export function DrawerKV({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <div className="grid grid-cols-2 gap-y-2 gap-x-3.5">
      {items.map(([k, v]) => (
        <div key={k}>
          <div className="text-[11px] text-mute mb-0.5">{k}</div>
          <div className="text-[12.5px] font-semibold text-ink">{v}</div>
        </div>
      ))}
    </div>
  );
}
