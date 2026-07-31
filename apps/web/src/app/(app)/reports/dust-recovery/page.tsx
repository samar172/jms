"use client";

import { useApi } from "@/lib/hooks";
import { formatWeight } from "@/lib/format";
import { formatPct } from "@/lib/format";

interface DustLot {
  id: string;
  lotNo: string;
  status: string;
  dustWeightG: number;
  recoveredPureGoldG: number;
  recoveryPct: number;
  createdAt: string;
}

interface DustRecoveryReport {
  summary: {
    totalDustSent: number;
    totalGoldRecovered: number;
    avgRecoveryPct: number;
  };
  lots: DustLot[];
}

export default function DustRecoveryReportPage() {
  const { data } = useApi<DustRecoveryReport>("/api/reports/dust-recovery");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dust Collection & Recovery</h1>
      <p className="text-sm text-text-muted">
        This report tracks dust lots sent to refiners and monitors the actual recovery percentage of pure gold from the sweeps.
      </p>

      {!data ? (
        <div className="text-text-muted">Loading…</div>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="card p-5 border-l-4 border-l-gold">
              <div className="text-sm text-text-muted mb-1">Total Dust Sent</div>
              <div className="text-2xl font-bold tabular">{formatWeight(data.summary.totalDustSent)}</div>
            </div>
            <div className="card p-5 border-l-4 border-l-gold">
              <div className="text-sm text-text-muted mb-1">Pure Gold Recovered</div>
              <div className="text-2xl font-bold tabular text-gold">{formatWeight(data.summary.totalGoldRecovered)}</div>
            </div>
            <div className="card p-5 border-l-4 border-l-gold bg-bg">
              <div className="text-sm font-semibold mb-1">Avg Recovery Rate</div>
              <div className="text-3xl font-bold tabular">{formatPct(data.summary.avgRecoveryPct)}</div>
            </div>
          </div>

          <div className="card overflow-hidden mt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-muted border-b border-border bg-bg">
                  <th className="py-2 px-4 font-medium">Lot No.</th>
                  <th className="py-2 px-4 font-medium">Created Date</th>
                  <th className="py-2 px-4 font-medium">Status</th>
                  <th className="py-2 px-4 font-medium text-right">Dust Weight</th>
                  <th className="py-2 px-4 font-medium text-right">Pure Gold Recovered</th>
                  <th className="py-2 px-4 font-medium text-right">Recovery %</th>
                </tr>
              </thead>
              <tbody>
                {data.lots.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-text-muted">No dust lots found.</td>
                  </tr>
                ) : (
                  data.lots.map((lot) => (
                    <tr key={lot.id} className="border-b border-border last:border-0">
                      <td className="py-2 px-4 font-mono">{lot.lotNo}</td>
                      <td className="py-2 px-4 text-text-muted">
                        {new Date(lot.createdAt).toLocaleDateString("en-IN")}
                      </td>
                      <td className="py-2 px-4">
                        <span className="pill pill-neutral">{lot.status}</span>
                      </td>
                      <td className="py-2 px-4 text-right tabular">{formatWeight(lot.dustWeightG)}</td>
                      <td className="py-2 px-4 text-right tabular text-gold">
                        {lot.status === "RECEIVED" ? formatWeight(lot.recoveredPureGoldG) : "—"}
                      </td>
                      <td className="py-2 px-4 text-right tabular font-medium">
                        {lot.status === "RECEIVED" ? formatPct(lot.recoveryPct) : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
