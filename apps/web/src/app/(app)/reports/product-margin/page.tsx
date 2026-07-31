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
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Product Margin Analysis</h1>
      <p className="text-sm text-text-muted">
        This report analyzes the realized margins on approved Final Costings, helping you track overall profitability across your catalogue.
      </p>

      {!data ? (
        <div className="text-text-muted">Loading…</div>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="card p-5 border-l-4 border-l-gold">
              <div className="text-sm text-text-muted mb-1">Total Cost (COGS)</div>
              <div className="text-2xl font-bold tabular">{formatINR(data.summary.totalCost)}</div>
            </div>
            <div className="card p-5 border-l-4 border-l-gold">
              <div className="text-sm text-text-muted mb-1">Total Realized Profit</div>
              <div className="text-2xl font-bold tabular text-success">{formatINR(data.summary.totalProfit)}</div>
            </div>
            <div className="card p-5 border-l-4 border-l-gold bg-bg">
              <div className="text-sm font-semibold mb-1">Avg Profit Margin</div>
              <div className="text-3xl font-bold tabular">{formatPct(data.summary.avgProfitPct)}</div>
            </div>
          </div>

          <div className="card overflow-hidden mt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-muted border-b border-border bg-bg">
                  <th className="py-2 px-4 font-medium">Serial No.</th>
                  <th className="py-2 px-4 font-medium">Design</th>
                  <th className="py-2 px-4 font-medium">Approved Date</th>
                  <th className="py-2 px-4 font-medium text-right">Cost</th>
                  <th className="py-2 px-4 font-medium text-right">Net Amount</th>
                  <th className="py-2 px-4 font-medium text-right">Profit</th>
                  <th className="py-2 px-4 font-medium text-right">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {data.estimates.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-text-muted">No approved final costings found.</td>
                  </tr>
                ) : (
                  data.estimates.map((row) => (
                    <tr key={row.estimateId} className="border-b border-border last:border-0 hover:bg-bg/50">
                      <td className="py-2 px-4">
                        <Link href={`/costing/${row.estimateId}`} className="font-mono text-gold hover:underline">
                          {row.serialNo}
                        </Link>
                      </td>
                      <td className="py-2 px-4 font-medium">{row.designName}</td>
                      <td className="py-2 px-4 text-text-muted">
                        {row.approvedAt ? new Date(row.approvedAt).toLocaleDateString("en-IN") : "—"}
                      </td>
                      <td className="py-2 px-4 text-right tabular text-text-muted">{formatINR(row.cost)}</td>
                      <td className="py-2 px-4 text-right tabular">{formatINR(row.netAmount)}</td>
                      <td className="py-2 px-4 text-right tabular text-success font-medium">{formatINR(row.profit)}</td>
                      <td className="py-2 px-4 text-right tabular font-medium">{formatPct(row.profitPct)}</td>
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
