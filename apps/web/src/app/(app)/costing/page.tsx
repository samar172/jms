"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Download, MoreHorizontal, FileText, CheckCircle, XCircle } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { EstimateStatusPill } from "@/components/StatusPill";
import { formatINR, formatDate } from "@/lib/format";

interface EstimateRow {
  id: string;
  estimateNo: string | null;
  type: string;
  version: number;
  status: string;
  pieces: number;
  grossWeightG: string | null;
  netAmount: string;
  createdAt: string;
  product: { serialNo: string; designName: string };
  customer?: { name: string } | null;
  order?: { id: string; orderNo: string } | null;
}

export default function CostingListPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const { data: estimates } = useApi<EstimateRow[]>(`/api/estimates${params.toString() ? `?${params}` : ""}`);

  const estFilter = params.get("status") || "ALL";

  const allEstimates = estimates || [];
  
  // Filter logic
  const filteredEstimates = allEstimates.filter((e) => {
    if (estFilter === "DRAFT") return e.status === "DRAFT";
    if (estFilter === "SENT") return e.status === "SUBMITTED"; 
    if (estFilter === "APPROVED") return e.status === "APPROVED";
    if (estFilter === "REJECTED") return e.status === "SUPERSEDED"; 
    return true;
  });

  const totalPipelineValue = allEstimates.reduce((sum, e) => sum + Number(e.netAmount || 0), 0);

  const tabs = [
    { id: "ALL", label: "All", count: allEstimates.length },
    { id: "DRAFT", label: "Draft", count: allEstimates.filter((e) => e.status === "DRAFT").length },
    { id: "SENT", label: "Sent to Client", count: allEstimates.filter((e) => e.status === "SUBMITTED").length },
    { id: "APPROVED", label: "Approved", count: allEstimates.filter((e) => e.status === "APPROVED").length },
    { id: "REJECTED", label: "Rejected", count: allEstimates.filter((e) => e.status === "SUPERSEDED").length },
  ];

  const [rowMenuFor, setRowMenuFor] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full bg-white h-screen">
      <div className="bg-white px-6 pt-4 pb-0 shrink-0">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex items-center gap-1 text-[11px] text-slate-500 mb-1.5">
            <span>KundanERP</span>
            <span className="text-slate-300">/</span>
            <span>Sales / Estimates</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-700 font-medium">Estimates</span>
          </div>
          <div className="flex items-end justify-between pb-3">
            <div>
              <h1 className="text-[21px] font-semibold text-slate-900 leading-tight">Estimates</h1>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {allEstimates.length} estimates · <span className="font-medium text-slate-700">{formatINR(totalPipelineValue)}</span> total pipeline value
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button className="h-8 px-3 rounded border border-slate-200 text-slate-700 text-[12px] font-medium hover:bg-slate-50 flex items-center gap-1.5 shadow-sm">
                <Download size={14} className="text-slate-400" /> Export
              </button>
              <Link href="/costing/new" className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] font-medium flex items-center gap-1.5 hover:bg-blue-900 transition-colors shadow-sm">
                <Plus size={14} /> New Estimate
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-6">
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
                  className={`pb-2.5 text-[12px] font-medium transition-colors border-b-[2px] ${
                    active ? "border-blue-800 text-blue-800" : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t.label}
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${active ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 bg-slate-50 overflow-auto">
        <div className="max-w-[1400px] mx-auto p-4 md:p-6">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <div className="relative w-[320px]">
              <input
                type="text"
                placeholder="Filter by estimate no., item, party…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-8 px-2.5 text-[12px] border border-slate-200 rounded text-slate-900 focus:outline-none focus:border-blue-800"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-500 font-medium">Showing {filteredEstimates.length} of {allEstimates.length}</span>
              <button className="h-8 px-3 rounded border border-slate-200 text-[11px] font-medium text-slate-700 bg-white hover:bg-slate-50 shadow-sm flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                Filters
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
            <table className="w-full border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="w-9 px-3 py-2.5"><input type="checkbox" className="w-3.5 h-3.5 accent-blue-800" /></th>
                  <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Estimate No.</th>
                  <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Item</th>
                  <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Party</th>
                  <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Date</th>
                  <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider font-semibold text-slate-500">Pcs</th>
                  <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider font-semibold text-slate-500">GW (g)</th>
                  <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider font-semibold text-slate-500">Net Amount</th>
                  <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Status</th>
                  <th className="w-9"></th>
                </tr>
              </thead>
              <tbody onClick={() => setRowMenuFor(null)}>
                {filteredEstimates.length ? filteredEstimates.map(e => (
                  <tr key={e.id} className="border-b border-slate-100 cursor-pointer h-10 hover:bg-slate-50 transition-colors" onClick={() => router.push(`/costing/${e.id}`)}>
                    <td className="px-3" onClick={ev => ev.stopPropagation()}><input type="checkbox" className="w-3.5 h-3.5 accent-blue-800" /></td>
                    <td className="px-3 text-[12px] mono text-blue-800 font-medium hover:underline">{e.estimateNo ?? e.id.split("-").pop()}</td>
                    <td className="px-3 text-[12px] text-slate-900 font-medium">
                      {e.product.designName}
                      {e.version > 1 && <span className="ml-1.5 text-[9px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded font-normal">v{e.version}</span>}
                    </td>
                    <td className="px-3 text-[12px] text-slate-600">{e.customer?.name ?? "—"}</td>
                    <td className="px-3 text-[12px] text-slate-600 tabular">{formatDate(e.createdAt).split(",")[0]}</td>
                    <td className="px-3 text-[12px] text-right tabular">{e.pieces ?? 1}</td>
                    <td className="px-3 text-[12px] text-right tabular mono text-slate-700">{e.grossWeightG ? Number(e.grossWeightG).toFixed(3) : "—"}</td>
                    <td className="px-3 text-[12px] text-right tabular mono font-semibold text-slate-900">{formatINR(Number(e.netAmount))}</td>
                    <td className="px-3"><EstimateStatusPill status={e.status} /></td>
                    <td className="px-3 text-right relative" onClick={ev => { ev.stopPropagation(); setRowMenuFor(rowMenuFor === e.id ? null : e.id); }}>
                      <button className="w-6 h-6 grid place-items-center rounded hover:bg-slate-200">
                        <MoreHorizontal size={14} className="text-slate-500" />
                      </button>
                      {rowMenuFor === e.id && (
                        <div className="absolute right-2 top-8 z-30 w-40 bg-white border border-slate-200 rounded-md shadow-lg py-1 text-left">
                          <button onClick={() => router.push(`/costing/${e.id}`)} className="w-full text-left px-3 h-7 text-[11px] font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                            <FileText size={12} className="text-slate-400" /> View Details
                          </button>
                          {e.status !== 'APPROVED' && (
                            <button className="w-full text-left px-3 h-7 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 flex items-center gap-2">
                              <CheckCircle size={12} className="text-emerald-500" /> Approve
                            </button>
                          )}
                          {e.status !== 'SUPERSEDED' && (
                            <button className="w-full text-left px-3 h-7 text-[11px] font-medium text-rose-700 hover:bg-rose-50 flex items-center gap-2">
                              <XCircle size={12} className="text-rose-500" /> Reject
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-500 text-[12px]">
                      {search ? "No estimates match these filters" : "No estimates found"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
