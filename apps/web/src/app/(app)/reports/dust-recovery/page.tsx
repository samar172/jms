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
    <div>
      <div className="mb-3.5">
        <div className="text-[11px] text-mute mb-1">
          <a href="/reports" className="hover:text-accent">Finance</a>
        </div>
        <h1 className="text-[19px] font-semibold text-ink">Dust Collection &amp; Recovery</h1>
        <p className="text-xs text-ink2 mt-0.5">
          Dust lots sent to refiners and the actual recovery percentage of pure gold from the sweeps.
        </p>
      </div>

      {!data ? (
        <div className="text-mute text-sm">Loading…</div>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-2.5 mb-3.5">
            <div className="console-panel px-3.5 py-2.5">
              <div className="text-[10.5px] uppercase tracking-wide text-mute mb-1.5">Total Dust Sent</div>
              <div className="text-xl font-bold mono text-ink">{formatWeight(data.summary.totalDustSent)}</div>
            </div>
            <div className="console-panel px-3.5 py-2.5">
              <div className="text-[10.5px] uppercase tracking-wide text-mute mb-1.5">Pure Gold Recovered</div>
              <div className="text-xl font-bold mono text-accent">{formatWeight(data.summary.totalGoldRecovered)}</div>
            </div>
            <div className="console-panel px-3.5 py-2.5" style={{ background: "var(--color-accent-bg)" }}>
              <div className="text-[10.5px] uppercase tracking-wide text-mute mb-1.5">Avg Recovery Rate</div>
              <div className="text-xl font-bold mono text-ink">{formatPct(data.summary.avgRecoveryPct)}</div>
            </div>
          </div>

          <div className="console-panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="console-table">
                <thead>
                  <tr>
                    <th>Lot No.</th>
                    <th>Created Date</th>
                    <th>Status</th>
                    <th className="num">Dust Weight</th>
                    <th className="num">Pure Gold Recovered</th>
                    <th className="num">Recovery %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lots.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-mute">No dust lots found.</td>
                    </tr>
                  ) : (
                    data.lots.map((lot) => (
                      <tr key={lot.id}>
                        <td className="rid">{lot.lotNo}</td>
                        <td className="text-ink2">
                          {new Date(lot.createdAt).toLocaleDateString("en-IN")}
                        </td>
                        <td>
                          <span className="console-pill neu">{lot.status}</span>
                        </td>
                        <td className="num mono">{formatWeight(lot.dustWeightG)}</td>
                        <td className="num mono text-accent">
                          {lot.status === "RECEIVED" ? formatWeight(lot.recoveredPureGoldG) : "—"}
                        </td>
                        <td className="num mono font-medium">
                          {lot.status === "RECEIVED" ? formatPct(lot.recoveryPct) : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
