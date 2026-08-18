"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { openAuthenticated } from "@/lib/api";
import { formatINR, formatDate } from "@/lib/format";

interface EstimateRow {
  id: string;
  estimateNo: string | null;
  status: string;
  netAmount: string;
  createdAt: string;
  product: { serialNo: string; designName: string };
  customer?: { id: string; name: string } | null;
}

export default function InvoicesPage() {
  const [search, setSearch] = useState("");
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  params.set("type", "FINAL_COSTING");
  params.set("status", "APPROVED");
  
  const { data: invoices } = useApi<EstimateRow[]>(`/api/estimates?${params.toString()}`);

  return (
    <div>
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">Sales</div>
        <h1 className="text-[19px] font-semibold flex items-center gap-2.5 text-ink">
          Invoicing
          <span className="text-xs text-mute font-medium">{invoices ? `${invoices.length} records` : ""}</span>
        </h1>
      </div>

      <div className="flex items-center gap-2 py-2.5 border-t border-b border-line -mx-3.5 px-3.5 sm:-mx-[18px] sm:px-[18px] mb-3.5">
        <div className="console-search w-[260px]">
          <Search size={13} />
          <input placeholder="Search invoice, customer, design…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="console-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="console-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Customer</th>
                <th>Design</th>
                <th className="num">Invoice Amount</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices?.map((inv) => {
                return (
                  <tr key={inv.id}>
                    <td>
                      <Link href={`/costing/${inv.id}`} className="rid">
                        {inv.estimateNo ?? "Draft"}
                      </Link>
                    </td>
                    <td className="text-ink2">{inv.customer?.name ?? "—"}</td>
                    <td>
                      {inv.product.designName}
                      <div className="text-[11px] text-mute mono">{inv.product.serialNo}</div>
                    </td>
                    <td className="num mono font-semibold text-accent">{formatINR(Number(inv.netAmount))}</td>
                    <td className="text-ink2">{formatDate(inv.createdAt)}</td>
                    <td>
                      <button
                        className="console-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          openAuthenticated(`/api/estimates/${inv.id}/pdf`);
                        }}
                      >
                        Export Invoice
                      </button>
                    </td>
                  </tr>
                );
              })}
              {invoices?.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-mute">
                    No invoices yet — approve a Final Costing to generate an invoice.
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
