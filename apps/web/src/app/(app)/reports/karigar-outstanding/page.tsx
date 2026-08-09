"use client";

import { useApi } from "@/lib/hooks";
import { formatWeight } from "@/lib/format";

export default function KarigarOutstandingReport() {
  const { data } = useApi<{ karigarId: string; karigarName: string; balance: number; lastIssueDate: string | null }[]>("/api/reports/karigar-outstanding");

  return (
    <div>
      <div className="mb-3.5">
        <div className="text-[11px] text-mute mb-1">
          <a href="/reports" className="hover:text-accent">Finance</a>
        </div>
        <h1 className="text-[19px] font-semibold text-ink">Karigar Outstanding</h1>
        <p className="text-xs text-ink2 mt-0.5">
          Karigars with an active outstanding balance of fine gold (24K equivalent). Negative balances indicate the karigar has returned more gold than issued (tolerances/rounding) and the ledger needs adjusting.
        </p>
      </div>

      <div className="console-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="console-table">
            <thead>
              <tr>
                <th>Karigar</th>
                <th>Last Issue Date</th>
                <th className="num">Outstanding Balance (24K)</th>
              </tr>
            </thead>
            <tbody>
              {!data ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-mute">Loading…</td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-mute">No outstanding balances found.</td>
                </tr>
              ) : (
                data.map((row) => (
                  <tr key={row.karigarId}>
                    <td className="font-medium text-ink">{row.karigarName}</td>
                    <td className="text-ink2">
                      {row.lastIssueDate ? new Date(row.lastIssueDate).toLocaleDateString("en-IN") : "—"}
                    </td>
                    <td className="num mono font-bold" style={{ color: row.balance > 0 ? "var(--color-err-tx)" : "var(--color-ok-tx)" }}>
                      {formatWeight(row.balance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
