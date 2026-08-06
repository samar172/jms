"use client";

import { use, useState } from "react";
import { useApi } from "@/lib/hooks";
import { StatCard } from "@/components/StatCard";
import { Gem, Wallet, HandCoins, Scale } from "lucide-react";
import { formatWeight, formatINR, formatDateTime } from "@/lib/format";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { canSeeCost } from "@jms/shared";

interface Summary {
  goldHeldG: number;
  labourEarnedThisMonth: number;
  advancesPaid: number;
  netPayable: number;
}
interface LedgerEntry {
  id: string;
  type: string;
  fineGoldG: string | null;
  amount: string | null;
  note: string | null;
  createdAt: string;
}
interface Karigar {
  id: string;
  code: string;
  name: string;
  employmentType: string;
  specialization?: string;
}

export default function KarigarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { data: karigar } = useApi<Karigar>(`/api/masters/karigars/${id}`);
  const { data: summary, mutate: mutateSummary } = useApi<Summary>(`/api/labour/karigars/${id}/summary`);
  const { data: ledger, mutate: mutateLedger } = useApi<LedgerEntry[]>(`/api/labour/karigars/${id}/ledger`);
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const showCost = user ? canSeeCost(user.role) : false;

  if (!karigar) return <div className="text-text-muted">Loading…</div>;

  async function payAdvance() {
    setError(null);
    try {
      await apiFetch("/api/labour/advances", {
        method: "POST",
        body: { karigarId: id, amount: Number(advanceAmount) },
      });
      setAdvanceAmount("");
      await Promise.all([mutateSummary(), mutateLedger()]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gold-tint text-gold flex items-center justify-center text-2xl font-semibold">
          {karigar.name.charAt(0)}
        </div>
        <div>
          <h1 className="text-xl font-semibold">{karigar.name}</h1>
          <p className="text-sm text-text-muted">
            Karigar Code: {karigar.code} · {karigar.employmentType === "IN_HOUSE" ? "In-house" : "External"}
            {karigar.specialization ? ` · Specialisation: ${karigar.specialization}` : ""}
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Gem} label="Gold Held" value={formatWeight(summary?.goldHeldG)} />
        {showCost && (
          <>
            <StatCard icon={Wallet} label="Labour Earned (This Month)" value={formatINR(summary?.labourEarnedThisMonth ?? 0)} />
            <StatCard icon={HandCoins} label="Advances Paid" value={formatINR(summary?.advancesPaid ?? 0)} />
            <StatCard icon={Scale} label="Net Payable" value={formatINR(summary?.netPayable ?? 0)} tone="warning" />
          </>
        )}
      </div>

      {showCost && (
        <div className="card p-4 flex items-end gap-2">
          <div>
            <label className="label">Pay Advance (₹)</label>
            <input
              type="number"
              className="input w-40"
              value={advanceAmount}
              onChange={(e) => setAdvanceAmount(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={payAdvance} disabled={!advanceAmount}>
            Record Advance
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-border font-semibold">Metal &amp; Payable Ledger</div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted border-b border-border bg-bg">
              <th className="py-2 px-4 font-medium">Date</th>
              <th className="py-2 px-4 font-medium">Type</th>
              <th className="py-2 px-4 font-medium text-right">Gold (g)</th>
              {showCost && <th className="py-2 px-4 font-medium text-right">Amount</th>}
              <th className="py-2 px-4 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {ledger?.map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0">
                <td className="py-2 px-4 text-text-muted">{formatDateTime(e.createdAt)}</td>
                <td className="py-2 px-4">{e.type.replace(/_/g, " ")}</td>
                <td className="py-2 px-4 text-right tabular">{e.fineGoldG ? Number(e.fineGoldG).toFixed(3) : "—"}</td>
                {showCost && (
                  <td className="py-2 px-4 text-right tabular">{e.amount ? formatINR(Number(e.amount)) : "—"}</td>
                )}
                <td className="py-2 px-4 text-text-muted">{e.note ?? "—"}</td>
              </tr>
            ))}
            {ledger?.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-text-muted">
                  No ledger entries yet.
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
