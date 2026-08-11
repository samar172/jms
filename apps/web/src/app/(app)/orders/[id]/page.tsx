"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { apiFetch, ApiError, openAuthenticated } from "@/lib/api";
import { formatINR, formatDate } from "@/lib/format";
import { ActivityTimeline } from "@/components/ActivityTimeline";

const ORDER_STATUSES = [
  "CONFIRMED",
  "MATERIAL_PLANNING",
  "MATERIAL_ISSUED",
  "IN_PRODUCTION",
  "MATERIAL_RETURN",
  "RECONCILIATION",
  "ASSEMBLY",
  "QC",
  "READY",
  "DELIVERED",
] as const;

interface Stage {
  id: string;
  status: string;
  processStage: { name: string; sequenceOrder: number };
  karigar: { name: string } | null;
}
interface JobCardRow {
  id: string;
  status: string;
  product: { serialNo: string; designName: string };
  stages: Stage[];
}
interface Assembly {
  id: string;
  status: string;
  assembler: { name: string } | null;
  finalWeightG: string | null;
  components: { id: string; status: string; jobCard: { product: { designName: string } } }[];
}
interface QCInspection {
  id: string;
  result: string;
  remarks: string | null;
  inspectedAt: string;
  inspector: { name: string };
}
interface OrderDetail {
  id: string;
  orderNo: string;
  status: (typeof ORDER_STATUSES)[number];
  approvedAmount: string;
  advanceReceived: string;
  expectedDeliveryDate: string | null;
  createdAt: string;
  product: { serialNo: string; designName: string };
  customer: { id: string; name: string };
  estimate: { id: string; netAmount: string; version: number };
  jobCards: JobCardRow[];
  assemblies: Assembly[];
  qcInspections: QCInspection[];
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: order, mutate } = useApi<OrderDetail>(`/api/orders/${id}`);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!order) return <div className="text-mute">Loading…</div>;

  const balance = Number(order.approvedAmount) - Number(order.advanceReceived);

  async function updateStatus(status: string) {
    setError(null);
    try {
      await apiFetch(`/api/orders/${id}`, { method: "PATCH", body: { status } });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function recordPayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/orders/${id}/payments`, { method: "POST", body: { amount: Number(amount) } });
      setAmount("");
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function startAssembly() {
    setError(null);
    try {
      await apiFetch("/api/assembly", { method: "POST", body: { orderId: id } });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  return (
    <div>
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">
          <Link href="/orders" className="hover:text-accent">Sales</Link>
        </div>
        <h1 className="text-[19px] font-semibold flex items-center gap-2.5 flex-wrap text-ink">
          Order — <span className="mono text-accent">{order.orderNo}</span>
          <span className="console-pill info">{order.status.replace(/_/g, " ")}</span>
        </h1>
        <p className="text-xs text-ink2 mt-0.5">
          {order.customer.name} · {order.product.designName} (
          <Link href={`/products/${order.product.serialNo}`} className="text-accent">
            {order.product.serialNo}
          </Link>
          ) · from{" "}
          <Link href={`/costing/${order.estimate.id}`} className="text-accent">
            estimate v{order.estimate.version}
          </Link>
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap py-2.5 border-t border-b border-line -mx-3.5 px-3.5 sm:-mx-[18px] sm:px-[18px] mb-3.5">
        <label className="console-field-label !mb-0 !mt-0">Update status:</label>
        <select className="console-field w-auto" value={order.status} onChange={(e) => updateStatus(e.target.value)}>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        {order.jobCards.length > 0 && order.assemblies.length === 0 && (
          <button className="console-btn" onClick={startAssembly}>
            Start Assembly
          </button>
        )}
      </div>

      {error && <p className="text-sm text-err-tx mb-3">{error}</p>}

      <div className="grid lg:grid-cols-2 gap-3.5">
        <div className="console-panel overflow-hidden">
          <div className="ph">Financials</div>
          <div className="p-3.5">
            <div className="console-sumrow">
              <span className="l">Approved Amount</span>
              <span className="v">{formatINR(Number(order.approvedAmount))}</span>
            </div>
            <div className="console-sumrow">
              <span className="l">Advance Received</span>
              <span className="v">{formatINR(Number(order.advanceReceived))}</span>
            </div>
            <div className="console-sumrow total">
              <span className="l">Balance</span>
              <span className="v" style={{ color: balance > 0 ? "var(--color-err-tx)" : "var(--color-ok-tx)" }}>
                {formatINR(balance)}
              </span>
            </div>
            {balance > 0 && (
              <form onSubmit={recordPayment} className="flex items-end gap-2 mt-3">
                <div>
                  <label className="console-field-label">Record Payment (₹)</label>
                  <input required type="number" step="0.01" min="0.01" className="console-field w-32" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <button className="console-btn primary" disabled={submitting}>
                  {submitting ? "Saving…" : "Record"}
                </button>
              </form>
            )}
            {order.expectedDeliveryDate && (
              <p className="text-xs text-mute mt-3">Expected delivery: {formatDate(order.expectedDeliveryDate)}</p>
            )}
            <button className="console-btn mt-3" onClick={() => openAuthenticated(`/api/orders/${id}/invoice`)}>
              Export Invoice
            </button>
          </div>
        </div>

        <div className="console-panel overflow-hidden">
          <div className="ph">Job Cards / Components</div>
          <div className="p-1.5">
            {order.jobCards.map((jc) => (
              <Link key={jc.id} href={`/job-cards/${jc.id}`} className="flex items-center justify-between p-2 rounded-md hover:bg-neu-bg">
                <div>
                  <div className="text-sm font-medium text-ink">{jc.product.designName}</div>
                  <div className="text-xs text-mute">
                    {jc.stages.length} stage{jc.stages.length === 1 ? "" : "s"} · {jc.stages.filter((s) => s.status === "APPROVED").length} complete
                  </div>
                </div>
                <span className="console-pill neu">{jc.status}</span>
              </Link>
            ))}
            {order.jobCards.length === 0 && <p className="text-sm text-mute p-2">No job cards linked yet.</p>}
          </div>
        </div>

        {order.assemblies.length > 0 && (
          <div className="console-panel overflow-hidden">
            <div className="ph">Assembly</div>
            <div className="p-3.5">
              {order.assemblies.map((a) => (
                <div key={a.id} className="mb-3 last:mb-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12.5px] text-ink2">
                      Assembler: {a.assembler?.name ?? "Unassigned"}
                      {a.finalWeightG && ` · ${Number(a.finalWeightG).toFixed(3)}g final weight`}
                    </span>
                    <span className={`console-pill ${a.status === "ASSEMBLED" ? "ok" : "info"}`}>{a.status.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {a.components.map((c) => (
                      <span key={c.id} className={`console-pill ${c.status === "COMPLETE" ? "ok" : c.status === "MISSING" ? "err" : "neu"}`}>
                        {c.jobCard.product.designName} {c.status === "COMPLETE" ? "✓" : c.status === "MISSING" ? "✗" : "…"}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {order.qcInspections.length > 0 && (
          <div className="console-panel overflow-hidden">
            <div className="ph">QC History</div>
            <div className="overflow-x-auto">
              <table className="console-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Inspector</th>
                    <th>Result</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {order.qcInspections.map((q) => (
                    <tr key={q.id}>
                      <td className="text-ink2">{formatDate(q.inspectedAt)}</td>
                      <td>{q.inspector.name}</td>
                      <td>
                        <span className={`console-pill ${q.result === "PASS" || q.result === "APPROVED" ? "ok" : q.result === "FAIL" ? "err" : "warn"}`}>
                          {q.result.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="text-ink2">{q.remarks ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <ActivityTimeline
        sources={[{ entityType: "Order", entityId: id }, ...order.jobCards.map((jc) => ({ entityType: "JobCard", entityId: jc.id }))]}
      />
    </div>
  );
}
