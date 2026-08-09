"use client";

import { useApi } from "@/lib/hooks";
import { formatINR, formatPct } from "@/lib/format";
import Link from "next/link";

interface MarginRow {
  estimateId: string;
  serialNo: string;
  designName: string;
  cost: number;
  profit: number;
  netAmount: number;
  profitPct: number;
  approvedAt: string | null;
}

interface ProductMarginReport {
  summary: {
    totalCost: number;
    totalProfit: number;
    avgProfitPct: number;
  };
  estimates: MarginRow[];
}

export default function ProductMarginReportPage() {
  const { data } = useApi<ProductMarginReport>("/api/reports/product-margin");

  return (
    <div>
      <div className="mb-3.5">
        <div className="text-[11px] text-mute mb-1">
          <Link href="/reports" className="hover:text-accent">Finance</Link>
        </div>
        <h1 className="text-[19px] font-semibold text-ink">Product Margin Analysis</h1>
        <p className="text-xs text-ink2 mt-0.5">
          Realized margins on approved Final Costings, helping you track overall profitability across your catalogue.
        </p>
      </div>

      {!data ? (
        <div className="text-mute text-sm">Loading…</div>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-2.5 mb-3.5">
            <div className="console-panel px-3.5 py-2.5">
              <div className="text-[10.5px] uppercase tracking-wide text-mute mb-1.5">Total Cost (COGS)</div>
              <div className="text-xl font-bold mono text-ink">{formatINR(data.summary.totalCost)}</div>
            </div>
            <div className="console-panel px-3.5 py-2.5">
              <div className="text-[10.5px] uppercase tracking-wide text-mute mb-1.5">Total Realized Profit</div>
              <div className="text-xl font-bold mono text-ok-tx">{formatINR(data.summary.totalProfit)}</div>
            </div>
            <div className="console-panel px-3.5 py-2.5" style={{ background: "var(--color-accent-bg)" }}>
              <div className="text-[10.5px] uppercase tracking-wide text-mute mb-1.5">Avg Profit Margin</div>
              <div className="text-xl font-bold mono text-ink">{formatPct(data.summary.avgProfitPct)}</div>
            </div>
          </div>

          <div className="console-panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="console-table">
                <thead>
                  <tr>
                    <th>Serial No.</th>
                    <th>Design</th>
                    <th>Approved Date</th>
                    <th className="num">Cost</th>
                    <th className="num">Net Amount</th>
                    <th className="num">Profit</th>
                    <th className="num">Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.estimates.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-mute">No approved final costings found.</td>
                    </tr>
                  ) : (
                    data.estimates.map((row) => (
                      <tr key={row.estimateId}>
                        <td>
                          <Link href={`/costing/${row.estimateId}`} className="rid">
                            {row.serialNo}
                          </Link>
                        </td>
                        <td className="font-medium text-ink">{row.designName}</td>
                        <td className="text-ink2">
                          {row.approvedAt ? new Date(row.approvedAt).toLocaleDateString("en-IN") : "—"}
                        </td>
                        <td className="num mono text-ink2">{formatINR(row.cost)}</td>
                        <td className="num mono">{formatINR(row.netAmount)}</td>
                        <td className="num mono text-ok-tx font-medium">{formatINR(row.profit)}</td>
                        <td className="num mono font-medium">{formatPct(row.profitPct)}</td>
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
