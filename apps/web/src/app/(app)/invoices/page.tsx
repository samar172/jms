"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { openAuthenticated } from "@/lib/api";
import { formatINR, formatDate } from "@/lib/format";

interface OrderRow {
  id: string;
  orderNo: string;
  status: string;
  approvedAmount: string;
  advanceReceived: string;
  createdAt: string;
  product: { serialNo: string; designName: string };
  customer: { id: string; name: string };
}

export default function InvoicesPage() {
  const [search, setSearch] = useState("");
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const { data: orders } = useApi<OrderRow[]>(`/api/orders${params.toString() ? `?${params}` : ""}`);

  return (
    <div>
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">Sales</div>
        <h1 className="text-[19px] font-semibold flex items-center gap-2.5 text-ink">
          Invoicing
          <span className="text-xs text-mute font-medium">{orders ? `${orders.length} records` : ""}</span>
        </h1>
      </div>

      <div className="flex items-center gap-2 py-2.5 border-t border-b border-line -mx-3.5 px-3.5 sm:-mx-[18px] sm:px-[18px] mb-3.5">
        <div className="console-search w-[260px]">
          <Search size={13} />
          <input placeholder="Search order, customer, design…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="console-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="console-table">
            <thead>
              <tr>
                <th>Invoice # (Order)</th>
                <th>Customer</th>
                <th>Design</th>
                <th className="num">Invoice Amount</th>
                <th className="num">Advance Received</th>
                <th className="num">Balance Due</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders?.map((o) => {
                const balance = Number(o.approvedAmount) - Number(o.advanceReceived);
                return (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/orders/${o.id}`} className="rid">
                        {o.orderNo}
                      </Link>
                    </td>
                    <td className="text-ink2">{o.customer.name}</td>
                    <td>
                      {o.product.designName}
                      <div className="text-[11px] text-mute mono">{o.product.serialNo}</div>
                    </td>
                    <td className="num mono">{formatINR(Number(o.approvedAmount))}</td>
                    <td className="num mono">{formatINR(Number(o.advanceReceived))}</td>
                    <td className="num mono" style={{ color: balance > 0 ? "var(--color-err-tx)" : "var(--color-ok-tx)" }}>
                      {formatINR(balance)}
                    </td>
                    <td className="text-ink2">{formatDate(o.createdAt)}</td>
                    <td>
                      <button
                        className="console-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          openAuthenticated(`/api/orders/${o.id}/invoice`);
                        }}
                      >
                        Export Invoice
                      </button>
                    </td>
                  </tr>
                );
              })}
              {orders?.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-mute">
                    No orders yet — an invoice is generated for every booked order.
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
