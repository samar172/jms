"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { apiFetch, ApiError, openAuthenticated } from "@/lib/api";
import { formatINR, formatDate } from "@/lib/format";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { type EstimateLine, HEADS, MATERIAL_HEADS, CHARGE_HEADS, SectionCard } from "@/components/EstimateLines";
import { ProductionPanel } from "@/components/ProductionPanel";

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

interface JobCardRow {
  id: string;
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
  productId: string;
  product: { serialNo: string; designName: string };
  customerId: string;
  customer: { id: string; name: string };
  estimate: { id: string; estimateNo: string | null; netAmount: string; version: number; goldRateSnapshot24k: string; lines: EstimateLine[] };
  jobCards: JobCardRow[];
  assemblies: Assembly[];
  qcInspections: QCInspection[];
}

// Same layout as the costing page (materials/making-charges tables, live
// summary rail, inline Production panel) so an order is a straight
// continuation of "Send to Production" — no jump to a differently shaped
// screen. The line items are read-only here (SectionCard's editable={false}
// mode) since an order's estimate is already approved & locked.
export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: order, mutate } = useApi<OrderDetail>(`/api/orders/${id}`);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!order) return <div className="text-mute">Loading…</div>;

  const balance = Number(order.approvedAmount) - Number(order.advanceReceived);
  const linesByHead = (head: EstimateLine["head"]) => order.estimate.lines.filter((l) => l.head === head);
  const subtotal = (head: EstimateLine["head"]) => linesByHead(head).reduce((sum, l) => sum + Number(l.amount), 0);
  const noop = () => {};

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
          It costs the shop <span className="mono font-semibold text-ink">{formatINR(subtotal("GOLD") + subtotal("POLKI") + subtotal("COLOURED_STONE") + subtotal("MAKING") + subtotal("OTHER") + subtotal("WASTAGE"))}</span>{" "}
          · customer pays <span className="mono font-semibold text-accent">{formatINR(Number(order.estimate.netAmount))}</span>
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
        <button className="console-btn ml-auto" onClick={() => openAuthenticated(`/api/orders/${id}/invoice`)}>
          Export Invoice
        </button>
      </div>

      {error && <p className="text-sm text-err-tx mb-3">{error}</p>}

      <ProductionPanel productId={order.productId} customerId={order.customerId} estimateId={order.estimate.id} />

      <div className="grid lg:grid-cols-[240px_1fr_320px] border border-line rounded-md bg-panel overflow-hidden items-start mb-3.5">
        <div className="border-b lg:border-b-0 lg:border-r border-line p-3.5">
          <label className="console-field-label">Order #</label>
          <div className="console-field-static mono">{order.orderNo}</div>

          <label className="console-field-label">Design</label>
          <input className="console-field" value={`${order.product.designName} (${order.product.serialNo})`} disabled />

          <label className="console-field-label">Customer</label>
          <div className="console-field-static">{order.customer.name}</div>

          <label className="console-field-label">From Estimate</label>
          <div className="console-field-static">
            <Link href={`/costing/${order.estimate.id}`} className="text-accent">
              {order.estimate.estimateNo ?? `v${order.estimate.version}`}
            </Link>
          </div>

          <label className="console-field-label">Order Date</label>
          <div className="console-field-static">{formatDate(order.createdAt)}</div>

          {order.expectedDeliveryDate && (
            <>
              <label className="console-field-label">Expected Delivery</label>
              <div className="console-field-static">{formatDate(order.expectedDeliveryDate)}</div>
            </>
          )}
        </div>

        <div className="p-3.5 overflow-x-auto min-w-0">
          <div className="text-[11px] font-bold uppercase text-ink2 tracking-wide mb-1.5">1. Materials — Gold &amp; Stones</div>
          {HEADS.filter((h) => MATERIAL_HEADS.includes(h.key)).map((h) => (
            <SectionCard
              key={h.key}
              head={h.key}
              label={h.label}
              unit={h.unit}
              hint={h.hint}
              lines={linesByHead(h.key)}
              subtotal={subtotal(h.key)}
              editable={false}
              estimateId={order.estimate.id}
              karats={[]}
              stoneTypes={[]}
              goldLines={linesByHead("GOLD")}
              goldRate24k={Number(order.estimate.goldRateSnapshot24k)}
              onChange={noop}
              onDeleteLine={noop}
            />
          ))}

          <div className="text-[11px] font-bold uppercase text-ink2 tracking-wide mt-4 mb-1.5">2. Making, Other Charges &amp; Wastage</div>
          {HEADS.filter((h) => CHARGE_HEADS.includes(h.key)).map((h) => (
            <SectionCard
              key={h.key}
              head={h.key}
              label={h.label}
              unit={h.unit}
              hint={h.hint}
              lines={linesByHead(h.key)}
              subtotal={subtotal(h.key)}
              editable={false}
              estimateId={order.estimate.id}
              karats={[]}
              stoneTypes={[]}
              goldLines={linesByHead("GOLD")}
              goldRate24k={Number(order.estimate.goldRateSnapshot24k)}
              onChange={noop}
              onDeleteLine={noop}
            />
          ))}
        </div>

        <div className="p-4 bg-[#FFFCF5] border-t lg:border-t-0 lg:border-l border-line lg:sticky lg:top-[60px] self-start">
          <div className="text-[11px] uppercase text-mute font-bold mb-2.5">Live Summary</div>

          <div className="console-sumrow">
            <span className="l">Gold &amp; Stones</span>
            <span className="v">{formatINR(subtotal("GOLD") + subtotal("POLKI") + subtotal("COLOURED_STONE"))}</span>
          </div>
          <div className="console-sumrow">
            <span className="l">Making Charges</span>
            <span className="v">{formatINR(subtotal("MAKING"))}</span>
          </div>
          <div className="console-sumrow">
            <span className="l">Other Charges</span>
            <span className="v">{formatINR(subtotal("OTHER"))}</span>
          </div>
          <div className="console-sumrow">
            <span className="l">Wastage</span>
            <span className="v">{formatINR(subtotal("WASTAGE"))}</span>
          </div>

          <div style={{ marginTop: 12, padding: 16, background: "#FFF3DA", border: "1px solid #F3DFAE", borderRadius: 6 }}>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em", color: "#92400E", fontWeight: 700, marginBottom: 4 }}>
              Customer Pays — Approved Amount
            </div>
            <div className="mono" style={{ fontSize: 28, fontWeight: 800, color: "#78350F" }}>
              {formatINR(Number(order.approvedAmount))}
            </div>
          </div>

          <div className="console-sumrow mt-3">
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
        </div>
      </div>

      {order.assemblies.length > 0 && (
        <div className="console-panel overflow-hidden mb-3.5">
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
        <div className="console-panel overflow-hidden mb-3.5">
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

      <ActivityTimeline
        sources={[{ entityType: "Order", entityId: id }, ...order.jobCards.map((jc) => ({ entityType: "JobCard", entityId: jc.id }))]}
      />
    </div>
  );
}
