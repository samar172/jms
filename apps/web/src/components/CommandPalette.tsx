"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface SearchResults {
  customers: { id: string; name: string; contact: string | null }[];
  products: { id: string; serialNo: string; designName: string; status: string }[];
  jobCards: { id: string; status: string; product: { serialNo: string; designName: string } }[];
  karigars: { id: string; name: string; code: string }[];
  orders: { id: string; orderNo: string; status: string; product: { serialNo: string; designName: string } }[];
  estimates: { id: string; type: string; version: number; status: string; product: { serialNo: string; designName: string } }[];
}

interface FlatResult {
  key: string;
  group: string;
  label: string;
  sub: string;
  href: string;
}

function flatten(results: SearchResults | null): FlatResult[] {
  if (!results) return [];
  return [
    ...results.customers.map((c) => ({ key: `c-${c.id}`, group: "Customers", label: c.name, sub: c.contact ?? "", href: `/customers/${c.id}` })),
    ...results.orders.map((o) => ({ key: `o-${o.id}`, group: "Orders", label: o.orderNo, sub: `${o.product.designName} · ${o.status.replace(/_/g, " ")}`, href: `/orders/${o.id}` })),
    ...results.estimates.map((e) => ({ key: `e-${e.id}`, group: "Estimates", label: `${e.product.serialNo} · v${e.version}`, sub: `${e.type.replace(/_/g, " ")} · ${e.status}`, href: `/costing/${e.id}` })),
    ...results.jobCards.map((j) => ({ key: `j-${j.id}`, group: "Job Cards", label: j.product.serialNo, sub: `${j.product.designName} · ${j.status}`, href: `/job-cards/${j.id}` })),
    ...results.karigars.map((k) => ({ key: `k-${k.id}`, group: "Karigars", label: k.name, sub: k.code, href: `/karigars/${k.id}` })),
    ...results.products.map((p) => ({ key: `p-${p.id}`, group: "Products", label: p.serialNo, sub: `${p.designName} · ${p.status.replace(/_/g, " ")}`, href: `/products/${p.serialNo}` })),
  ];
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape") {
        close();
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("jms:open-search", onOpenEvent);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("jms:open-search", onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!query.trim()) return;
    const t = setTimeout(() => {
      apiFetch<SearchResults>(`/api/search?q=${encodeURIComponent(query.trim())}`)
        .then(setResults)
        .catch(() => setResults(null));
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const flat = query.trim() ? flatten(results) : [];

  function close() {
    setOpen(false);
    setQuery("");
    setResults(null);
    setActiveIndex(0);
  }

  function go(href: string) {
    close();
    router.push(href);
  }

  if (!open) return null;

  const groups = [...new Set(flat.map((f) => f.group))];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={close}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-[560px] bg-panel border border-line rounded-md shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3.5 py-3 border-b border-line">
          <Search size={15} className="text-mute" />
          <input
            ref={inputRef}
            className="flex-1 outline-none text-[13px] bg-transparent text-ink"
            placeholder="Search customer, estimate, job, design, karigar, order…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && flat[activeIndex]) {
                go(flat[activeIndex].href);
              }
            }}
          />
          <kbd className="border border-line rounded-[3px] text-[10px] px-1 text-mute">Esc</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {query.trim() && flat.length === 0 && (
            <div className="px-3.5 py-6 text-center text-mute text-sm">No matches for &quot;{query}&quot;</div>
          )}
          {groups.map((group) => (
            <div key={group}>
              <div className="px-3.5 pt-2.5 pb-1 text-[10px] uppercase tracking-wide text-mute font-semibold">{group}</div>
              {flat
                .filter((f) => f.group === group)
                .map((f) => {
                  const idx = flat.indexOf(f);
                  return (
                    <button
                      key={f.key}
                      className={`w-full text-left px-3.5 py-2 flex items-center justify-between gap-2 ${idx === activeIndex ? "bg-accent-bg" : "hover:bg-neu-bg"}`}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => go(f.href)}
                    >
                      <span className="text-[12.5px] text-ink font-medium truncate">{f.label}</span>
                      <span className="text-[11px] text-mute truncate shrink-0">{f.sub}</span>
                    </button>
                  );
                })}
            </div>
          ))}
          {!query.trim() && <div className="px-3.5 py-6 text-center text-mute text-sm">Start typing to search everything…</div>}
        </div>
      </div>
    </div>
  );
}
