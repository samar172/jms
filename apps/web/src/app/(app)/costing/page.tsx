"use client";

import { useMemo, useState, Fragment } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { EstimateStatusPill } from "@/components/StatusPill";
import { formatINR, formatDate } from "@/lib/format";

interface EstimateRow {
  id: string;
  estimateNo: string | null;
  type: string;
  version: number;
  status: string;
  netAmount: string;
  createdAt: string;
  product: { serialNo: string; designName: string };
  customer?: { name: string } | null;
  order?: { id: string; orderNo: string } | null;
}

// Lower = more relevant. An order-linked estimate is the closest thing this
// product has to a "final answer"; failing that, prefer whatever is furthest
// along the Draft → Submitted → Approved pipeline; Superseded sinks to the
// bottom since it's explicitly been replaced by something else.
function rowRank(e: EstimateRow): number {
  if (e.order) return 0;
  if (e.status === "APPROVED") return 1;
  if (e.status === "SUBMITTED") return 2;
  if (e.status === "DRAFT") return 3;
  return 4;
}

export default function CostingListPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const { data: estimates } = useApi<EstimateRow[]>(`/api/estimates${params.toString() ? `?${params}` : ""}`);

  const estFilter = params.get("status") || "ALL";

  // One design (Product) can rack up several estimates over time — different
  // prospective customers, rough vs. final costing, abandoned drafts. Flat-
  // listing all of them makes unrelated quotes look like duplicates/versions
  // of each other. Group by product and surface only the most relevant one;
  // the rest are one click away, not gone.
  const groups = useMemo(() => {
    if (!estimates) return [];
    
    // First, filter by status tab
    let filteredEstimates = estimates;
    if (estFilter !== "ALL") {
      filteredEstimates = estimates.filter((e) => {
        if (estFilter === "DRAFT") return e.status === "DRAFT";
        if (estFilter === "SENT") return e.status === "SUBMITTED"; // Map Sent to Submitted
        if (estFilter === "APPROVED") return e.status === "APPROVED";
        if (estFilter === "REJECTED") return e.status === "SUPERSEDED"; // Map Rejected to Superseded or add rejected
        return true;
      });
    }

    const byProduct = new Map<string, EstimateRow[]>();
    for (const e of filteredEstimates) {
      const list = byProduct.get(e.product.serialNo) ?? [];
      list.push(e);
      byProduct.set(e.product.serialNo, list);
    }
    return Array.from(byProduct.values())
      .map((rows) => {
        const sorted = [...rows].sort((a, b) => {
          const r = rowRank(a) - rowRank(b);
          return r !== 0 ? r : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        return { key: sorted[0].product.serialNo, primary: sorted[0], older: sorted.slice(1) };
      })
      .sort((a, b) => new Date(b.primary.createdAt).getTime() - new Date(a.primary.createdAt).getTime());
  }, [estimates, estFilter]);

  function toggle(key: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const tabs = [
    { id: "ALL", label: "All" },
    { id: "DRAFT", label: "Draft" },
    { id: "SENT", label: "Sent to Client" },
    { id: "APPROVED", label: "Approved" },
    { id: "REJECTED", label: "Rejected" },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mb-1.5">
          <span>Sales</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900">Estimates</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[19px] font-semibold text-slate-900 leading-tight">Estimates</h1>
            <div className="text-[12px] text-slate-500 mt-0.5">
              {estimates ? `${estimates.length} estimates` : "Loading..."}
            </div>
          </div>
          <Link href="/costing/new" className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] font-medium flex items-center gap-1.5 hover:bg-blue-700 transition-colors">
            <Plus size={14} /> New Estimate
          </Link>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-slate-200 mb-3.5">
        {tabs.map((t) => {
          const active = estFilter === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                const p = new URLSearchParams(window.location.search);
                if (t.id === "ALL") p.delete("status");
                else p.set("status", t.id);
                router.push(`${window.location.pathname}?${p.toString()}`);
              }}
              className={`pb-2 text-[12px] font-medium border-b-2 transition-colors -mb-[1px] ${
                active ? "border-blue-800 text-blue-800" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mb-3.5">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="Filter by estimate no., design, customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-[12px] border border-slate-200 rounded outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white border border-slate-200 rounded-md">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Estimate No.</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Design (Item)</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Party</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Type</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Date</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider font-semibold text-slate-500">Net Amount</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ key, primary, older }) => {
              const isOpen = expanded.has(key);
              return (
                <Fragment key={key}>
                  <EstimateRowView e={primary} onOpen={() => router.push(`/costing/${primary.id}`)} />
                  {older.length > 0 && (
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <td colSpan={7} className="px-3 py-1.5 text-center">
                        <button
                          type="button"
                          className="text-[11px] text-blue-800 font-medium hover:underline"
                          onClick={() => toggle(key)}
                        >
                          {isOpen ? "Hide" : "Show"} {older.length} earlier estimate{older.length > 1 ? "s" : ""} for this design
                        </button>
                      </td>
                    </tr>
                  )}
                  {isOpen &&
                    older.map((e) => (
                      <EstimateRowView key={e.id} e={e} muted onOpen={() => router.push(`/costing/${e.id}`)} />
                    ))}
                </Fragment>
              );
            })}
            {groups.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500 text-[12px]">
                  {search ? "No estimates match your search." : "No estimates found."}
                </td>
              </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EstimateRowView({ e, onOpen, muted }: { e: EstimateRow; onOpen: () => void; muted?: boolean }) {
  return (
    <tr onClick={onOpen} className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer h-10 ${muted ? "opacity-60" : ""}`}>
      <td className="px-3">
        <Link href={`/costing/${e.id}`} className="text-[12px] mono text-blue-800 font-medium hover:underline" onClick={(ev) => ev.stopPropagation()}>
          {e.estimateNo ?? e.id.split("-").pop() ?? "—"}
        </Link>
        {e.version > 1 && <span className="ml-1.5 text-[10px] bg-slate-100 text-slate-500 px-1 rounded">v{e.version}</span>}
      </td>
      <td className="px-3">
        <div className="text-[12px] text-slate-900">{e.product.designName}</div>
        <div className="text-[10px] text-slate-400 mono">{e.product.serialNo}</div>
      </td>
      <td className="px-3 text-[12px] text-slate-900">{e.customer?.name ?? "—"}</td>
      <td className="px-3 text-[11px] text-slate-500">{e.type === "ROUGH_ESTIMATE" ? "Rough" : "Final"}</td>
      <td className="px-3 text-[12px] text-slate-600 tabular">{formatDate(e.createdAt).split(",")[0]}</td>
      <td className="px-3 text-[12px] text-slate-900 text-right tabular mono font-medium">{formatINR(Number(e.netAmount))}</td>
      <td className="px-3">
        <EstimateStatusPill status={e.status} />
      </td>
    </tr>
  );
}
