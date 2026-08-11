"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useApi } from "@/lib/hooks";
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

const STATUS_PILL: Record<string, string> = {
  CONFIRMED: "info",
  MATERIAL_PLANNING: "neu",
  MATERIAL_ISSUED: "warn",
  IN_PRODUCTION: "warn",
  MATERIAL_RETURN: "warn",
  RECONCILIATION: "warn",
  ASSEMBLY: "info",
  QC: "info",
  READY: "ok",
  DELIVERED: "ok",
};

export default function OrdersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const { data: orders } = useApi<OrderRow[]>(`/api/orders${params.toString() ? `?${params}` : ""}`);

  return (
    <div>
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">Sales</div>
        <h1 className="text-[19px] font-semibold flex items-center gap-2.5 text-ink">
          Orders
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
                <th>Order #</th>
                <th>Customer</th>
                <th>Design</th>
                <th className="num">Approved Amt</th>
                <th className="num">Balance</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders?.map((o) => {
                const balance = Number(o.approvedAmount) - Number(o.advanceReceived);
                return (
                  <tr key={o.id} className="cursor-pointer" onClick={() => router.push(`/orders/${o.id}`)}>
                    <td className="rid">{o.orderNo}</td>
                    <td className="text-ink2">{o.customer.name}</td>
                    <td>
                      {o.product.designName}
                      <div className="text-[11px] text-mute mono">{o.product.serialNo}</div>
                    </td>
                    <td className="num mono">{formatINR(Number(o.approvedAmount))}</td>
                    <td className="num mono" style={{ color: balance > 0 ? "var(--color-err-tx)" : undefined }}>
                      {formatINR(balance)}
                    </td>
                    <td className="text-ink2">{formatDate(o.createdAt)}</td>
                    <td>
                      <span className={`console-pill ${STATUS_PILL[o.status] ?? "neu"}`}>{o.status.replace(/_/g, " ")}</span>
                    </td>
                  </tr>
                );
              })}
              {orders?.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-mute">
                    No orders yet — convert an approved estimate to an order from its costing page.
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
