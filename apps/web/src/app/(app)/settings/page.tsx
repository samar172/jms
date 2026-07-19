"use client";

import { useState } from "react";
import { useApi, useKarats, useProcessStages, useStockLedgerEnabled } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { formatINR, formatDate } from "@/lib/format";

interface GoldRate {
  id: string;
  ratePerGram24k: string;
  effectiveFrom: string;
}

export default function SettingsPage() {
  const { data: rates, mutate } = useApi<GoldRate[]>("/api/masters/gold-rates");
  const { data: karats } = useKarats();
  const { data: stages } = useProcessStages();
  const { data: stockEnabled, mutate: mutateStockEnabled } = useStockLedgerEnabled();
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [togglingStock, setTogglingStock] = useState(false);

  async function toggleStockLedger() {
    setTogglingStock(true);
    try {
      await apiFetch("/api/settings/stock-ledger-enabled", {
        method: "PUT",
        body: { enabled: !stockEnabled?.enabled },
      });
      await mutateStockEnabled();
    } finally {
      setTogglingStock(false);
    }
  }

  async function addRate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/api/masters/gold-rates", {
        method: "POST",
        body: { ratePerGram24k: Number(rate), effectiveFrom: new Date().toISOString() },
      });
      setRate("");
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-semibold">Settings — Masters</h1>

      <section className="card p-5">
        <h2 className="font-semibold mb-3">Gold Rate (24K, ₹/gram)</h2>
        <form onSubmit={addRate} className="flex items-end gap-2 mb-4">
          <div>
            <label className="label">New rate, effective now</label>
            <input required type="number" step="0.01" className="input w-40" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <button className="btn btn-primary">Set Rate</button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </form>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted border-b border-border">
              <th className="py-1.5 font-medium">Rate</th>
              <th className="py-1.5 font-medium">Effective From</th>
            </tr>
          </thead>
          <tbody>
            {rates?.slice(0, 8).map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="py-1.5 tabular">{formatINR(Number(r.ratePerGram24k))}</td>
                <td className="py-1.5 text-text-muted">{formatDate(r.effectiveFrom)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold mb-3">Karat / Purity Factors</h2>
        <table className="w-full text-sm">
          <tbody>
            {karats?.map((k) => (
              <tr key={k.id} className="border-b border-border last:border-0">
                <td className="py-1.5">{k.code}</td>
                <td className="py-1.5 text-right tabular text-text-muted">{Number(k.purityFactor).toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold mb-3">Process Stages &amp; Wastage Tolerances</h2>
        <table className="w-full text-sm">
          <tbody>
            {stages?.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="py-1.5">{s.name}</td>
                <td className="py-1.5 text-right tabular text-text-muted">{Number(s.wastageTolerancePct).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold mb-1">Store Gold/Stone Stock Ledger</h2>
        <p className="text-sm text-text-muted mb-4">
          Tracks raw material sitting in the store itself (purchases, issues to karigars, returns),
          separate from what each karigar is holding. Off by default — turn it on only if you want
          to track store-level stock in the system.
        </p>
        <label className="flex items-center gap-3 cursor-pointer w-fit">
          <span className="text-sm font-medium">{stockEnabled?.enabled ? "Enabled" : "Disabled"}</span>
          <span
            onClick={toggleStockLedger}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              stockEnabled?.enabled ? "bg-gold" : "bg-border"
            } ${togglingStock ? "opacity-50" : ""}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                stockEnabled?.enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </span>
        </label>
      </section>

      <p className="text-xs text-text-muted">
        Categories, stone types, charge types, karigars and user management are managed via their
        respective API endpoints; a full admin UI for those is a near-term follow-up.
      </p>
    </div>
  );
}
