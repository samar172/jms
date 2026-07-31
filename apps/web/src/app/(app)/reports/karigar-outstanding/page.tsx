"use client";

import { useApi } from "@/lib/hooks";
import { formatWeight } from "@/lib/format";

export default function KarigarOutstandingReport() {
  const { data } = useApi<{ karigarId: string; karigarName: string; balance: number; lastIssueDate: string | null }[]>("/api/reports/karigar-outstanding");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Karigar Outstanding</h1>
      <p className="text-sm text-text-muted">
        This report lists all karigars with an active outstanding balance of fine gold (24K equivalent). Negative balances indicate that the karigar has returned more gold than issued (due to tolerances/rounding) and the ledger needs adjusting.
      </p>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted border-b border-border bg-bg">
              <th className="py-2 px-4 font-medium">Karigar</th>
              <th className="py-2 px-4 font-medium">Last Issue Date</th>
              <th className="py-2 px-4 font-medium text-right">Outstanding Balance (24K)</th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-text-muted">Loading…</td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-text-muted">No outstanding balances found.</td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={row.karigarId} className="border-b border-border last:border-0">
                  <td className="py-2 px-4 font-medium">{row.karigarName}</td>
                  <td className="py-2 px-4 text-text-muted">
                    {row.lastIssueDate ? new Date(row.lastIssueDate).toLocaleDateString("en-IN") : "—"}
                  </td>
                  <td className={`py-2 px-4 text-right tabular font-bold ${row.balance > 0 ? "text-danger" : "text-success"}`}>
                    {formatWeight(row.balance)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
