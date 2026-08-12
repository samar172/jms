"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
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
}

export default function FinalCostingPage() {
  const [search, setSearch] = useState("");
  const params = new URLSearchParams({ type: "FINAL_COSTING" });
  if (search) params.set("search", search);
  const { data: finalCostings } = useApi<EstimateRow[]>(`/api/estimates?${params}`);

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mb-1.5">
          <span>Finance</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900">Final Costing</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[19px] font-semibold text-slate-900 leading-tight">Final Costing</h1>
            <div className="text-[12px] text-slate-500 mt-0.5">
              Jab ek estimate ke saare job cards close ho jaate hain, unka Actual Costing yahan Estimate jaise hi format mein ban jaata hai
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3.5">
        <input
          type="text"
          placeholder="Filter by job, customer…"
          className="console-field max-w-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="text-xs text-mute ml-2">
          {finalCostings?.length ?? 0} final costings
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-neu-bg rounded-md border border-line">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-neu-bg z-10 border-b border-line shadow-sm">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-mute">Job / Item</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-mute">Customer</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-mute">Status</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-mute">Date</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider font-semibold text-mute">Net Actual</th>
            </tr>
          </thead>
          <tbody>
            {finalCostings?.map((row) => (
              <tr key={row.id} className="border-b border-line hover:bg-bg transition-colors">
                <td className="px-3 py-2">
                  <Link href={`/costing/${row.id}`} className="block">
                    <span className="mono text-accent font-medium">{row.estimateNo ?? "Draft"}</span>
                    <div className="text-[11px] text-ink2 mt-0.5">{row.product.serialNo} · {row.product.designName}</div>
                  </Link>
                </td>
                <td className="px-3 py-2 text-ink2">{row.customer?.name ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className="console-pill neu">{row.status}</span>
                </td>
                <td className="px-3 py-2 text-ink2 tabular">{formatDate(row.createdAt)}</td>
                <td className="px-3 py-2 text-right mono font-medium text-ink">{formatINR(Number(row.netAmount))}</td>
              </tr>
            ))}
            {finalCostings?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-mute text-[12px]">
                  No final costings found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
