"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { EstimateStatusPill } from "@/components/StatusPill";
import { formatINR, formatDate } from "@/lib/format";

interface EstimateRow {
  id: string;
  type: string;
  version: number;
  status: string;
  netAmount: string;
  createdAt: string;
  product: { serialNo: string; designName: string };
}

export default function CostingListPage() {
  const { data: estimates } = useApi<EstimateRow[]>("/api/estimates");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Costing</h1>
        <Link href="/costing/new" className="btn btn-primary">
          <Plus size={16} /> New Estimate
        </Link>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted border-b border-border bg-bg">
              <th className="py-2.5 px-4 font-medium">Serial No.</th>
              <th className="py-2.5 px-4 font-medium">Type</th>
              <th className="py-2.5 px-4 font-medium">Version</th>
              <th className="py-2.5 px-4 font-medium">Status</th>
              <th className="py-2.5 px-4 font-medium text-right">Net Amount</th>
              <th className="py-2.5 px-4 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {estimates?.map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0 hover:bg-bg">
                <td className="py-2.5 px-4">
                  <Link href={`/costing/${e.id}`} className="font-mono text-gold font-medium">
                    {e.product.serialNo}
                  </Link>
                  <div className="text-xs text-text-muted">{e.product.designName}</div>
                </td>
                <td className="py-2.5 px-4">{e.type.replace(/_/g, " ")}</td>
                <td className="py-2.5 px-4 tabular">v{e.version}</td>
                <td className="py-2.5 px-4">
                  <EstimateStatusPill status={e.status} />
                </td>
                <td className="py-2.5 px-4 text-right tabular font-medium">{formatINR(Number(e.netAmount))}</td>
                <td className="py-2.5 px-4 text-text-muted">{formatDate(e.createdAt)}</td>
              </tr>
            ))}
            {estimates?.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-text-muted">
                  No estimates yet.
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
