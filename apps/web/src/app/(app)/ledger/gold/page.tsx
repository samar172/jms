"use client";

import { useApi } from "@/lib/hooks";
import { formatWeight, formatDate } from "@/lib/format";

interface GoldFlowEntry {
  id: string;
  date: string;
  type: string;
  party: string;
  particulars: string;
  weightIn: number;
  weightOut: number;
  balance: number;
  source: string;
}

export default function GoldLedgerPage() {
  const { data: goldFlow } = useApi<GoldFlowEntry[]>("/api/ledger/gold-flow");

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mb-1.5">
          <span>Ledger</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900">Gold</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[19px] font-semibold text-slate-900 leading-tight">Gold Ledger</h1>
            <div className="text-[12px] text-slate-500 mt-0.5">
              Passbook view for vault stock and karigar material flow
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-neu-bg rounded-md border border-line">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-neu-bg z-10 border-b border-line shadow-sm">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-mute">Date</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-mute">Particulars</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-mute">Party</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider font-semibold text-mute">In (g)</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider font-semibold text-mute">Out (g)</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider font-semibold text-mute">Balance (g)</th>
            </tr>
          </thead>
          <tbody>
            {goldFlow?.map((row) => (
              <tr key={row.id} className="border-b border-line hover:bg-bg transition-colors">
                <td className="px-3 py-2 text-ink2 tabular">{formatDate(row.date)}</td>
                <td className="px-3 py-2 text-ink">
                  {row.particulars}
                  <div className="text-[10px] text-mute">{row.source}</div>
                </td>
                <td className="px-3 py-2 text-ink2">{row.party}</td>
                <td className="px-3 py-2 text-right mono font-medium text-emerald-600">
                  {row.weightIn > 0 ? formatWeight(row.weightIn) : "—"}
                </td>
                <td className="px-3 py-2 text-right mono font-medium text-rose-600">
                  {row.weightOut > 0 ? formatWeight(row.weightOut) : "—"}
                </td>
                <td className="px-3 py-2 text-right mono font-semibold text-ink">{formatWeight(row.balance)}</td>
              </tr>
            ))}
            {goldFlow?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-mute text-[12px]">
                  No gold transactions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
