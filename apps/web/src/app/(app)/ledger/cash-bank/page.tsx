"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks";
import { formatINR, formatDate } from "@/lib/format";

interface CashBankLedgerEntry {
  id: string;
  createdAt: string;
  account: string;
  type: string;
  direction: string;
  amount: number;
  note: string | null;
}

interface CashBankResponse {
  items: CashBankLedgerEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export default function CashBankLedgerPage() {
  const [accountFilter, setAccountFilter] = useState<string>("ALL");
  const params = new URLSearchParams();
  if (accountFilter !== "ALL") params.set("account", accountFilter);
  
  const { data } = useApi<CashBankResponse>(`/api/ledger/cash-bank?${params}`);
  const items = data?.items ?? [];

  // Calculate running balance
  let runningBalance = 0;
  const withBalance = [...items].reverse().map(e => {
    runningBalance += e.direction === "IN" ? Number(e.amount) : -Number(e.amount);
    return { ...e, balance: runningBalance };
  }).reverse();

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mb-1.5">
          <span>Ledger</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900">Cash & Bank</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[19px] font-semibold text-slate-900 leading-tight">Cash & Bank Ledger</h1>
            <div className="text-[12px] text-slate-500 mt-0.5">
              Passbook view for all cash and bank transactions
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-3.5 border-b border-line">
        {["ALL", "CASH", "BANK"].map(tab => (
          <button
            key={tab}
            onClick={() => setAccountFilter(tab)}
            className={`px-3 py-2 text-[12px] font-medium border-b-2 transition-colors -mb-[1px] ${
              accountFilter === tab 
                ? "border-accent text-accent" 
                : "border-transparent text-mute hover:text-ink hover:border-line"
            }`}
          >
            {tab === "ALL" ? "All Accounts" : tab === "CASH" ? "Cash Only" : "Bank Only"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto bg-neu-bg rounded-md border border-line">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-neu-bg z-10 border-b border-line shadow-sm">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-mute">Date</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-mute">Particulars</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-mute">Account</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider font-semibold text-mute">In (Rs)</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider font-semibold text-mute">Out (Rs)</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider font-semibold text-mute">Balance (Rs)</th>
            </tr>
          </thead>
          <tbody>
            {withBalance.map((row) => (
              <tr key={row.id} className="border-b border-line hover:bg-bg transition-colors">
                <td className="px-3 py-2 text-ink2 tabular">{formatDate(row.createdAt)}</td>
                <td className="px-3 py-2 text-ink">
                  {row.type.replace(/_/g, " ")}
                  {row.note && <div className="text-[10px] text-mute">{row.note}</div>}
                </td>
                <td className="px-3 py-2">
                  <span className="console-pill neu">{row.account}</span>
                </td>
                <td className="px-3 py-2 text-right mono font-medium text-emerald-600">
                  {row.direction === "IN" ? formatINR(row.amount) : "—"}
                </td>
                <td className="px-3 py-2 text-right mono font-medium text-rose-600">
                  {row.direction === "OUT" ? formatINR(row.amount) : "—"}
                </td>
                <td className="px-3 py-2 text-right mono font-semibold text-ink">{formatINR(row.balance)}</td>
              </tr>
            ))}
            {withBalance.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-mute text-[12px]">
                  No transactions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
