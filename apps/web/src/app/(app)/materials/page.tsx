"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks";
import { apiFetch } from "@/lib/api";
import { formatWeight, formatDateTime } from "@/lib/format";

interface DustLot {
  id: string;
  lotNo: string;
  status: string;
  totalDustWeightG: string;
  recoveredPureGoldG: string | null;
  recoveryPct: string | null;
  createdAt: string;
}

export default function MaterialsPage() {
  const { data: dustLots, mutate } = useApi<DustLot[]>("/api/materials/dust-lots");
  const [creating, setCreating] = useState(false);

  async function createLot() {
    setCreating(true);
    try {
      await apiFetch("/api/materials/dust-lots", { method: "POST" });
      await mutate();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Materials &amp; Stock</h1>
        <button className="btn btn-primary" onClick={createLot} disabled={creating}>
          + New Dust Lot
        </button>
      </div>

      <p className="text-sm text-text-muted max-w-2xl">
        Gold and stone are tracked per job via the Job Card workflow (issue → receive → wastage
        reconciliation). This page covers dust lot despatch and refining recovery (FR-5.06–5.08). A
        dedicated store-level purchase/stock-take ledger (FR-4.05–4.08) is on the near-term roadmap —
        see the README.
      </p>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted border-b border-border bg-bg">
              <th className="py-2 px-4 font-medium">Lot No.</th>
              <th className="py-2 px-4 font-medium">Status</th>
              <th className="py-2 px-4 font-medium text-right">Dust Weight</th>
              <th className="py-2 px-4 font-medium text-right">Recovered</th>
              <th className="py-2 px-4 font-medium text-right">Recovery %</th>
              <th className="py-2 px-4 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {dustLots?.map((lot) => (
              <tr key={lot.id} className="border-b border-border last:border-0">
                <td className="py-2 px-4 font-mono">{lot.lotNo}</td>
                <td className="py-2 px-4">{lot.status}</td>
                <td className="py-2 px-4 text-right tabular">{formatWeight(lot.totalDustWeightG)}</td>
                <td className="py-2 px-4 text-right tabular">{formatWeight(lot.recoveredPureGoldG)}</td>
                <td className="py-2 px-4 text-right tabular">
                  {lot.recoveryPct ? `${Number(lot.recoveryPct).toFixed(2)}%` : "—"}
                </td>
                <td className="py-2 px-4 text-text-muted">{formatDateTime(lot.createdAt)}</td>
              </tr>
            ))}
            {dustLots?.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-text-muted">
                  No dust lots yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
