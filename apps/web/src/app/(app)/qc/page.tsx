"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";

interface QCRow {
  id: string;
  result: "PENDING" | "PASS" | "FAIL" | "REWORK_REQUIRED" | "APPROVED";
  remarks: string | null;
  inspectedAt: string;
  order: { id: string; orderNo: string; product: { serialNo: string; designName: string } };
  inspector: { name: string };
}
interface OrderOption {
  id: string;
  orderNo: string;
  status: string;
  product: { serialNo: string; designName: string };
}

const RESULT_PILL: Record<string, string> = {
  PENDING: "neu",
  PASS: "ok",
  APPROVED: "ok",
  FAIL: "err",
  REWORK_REQUIRED: "warn",
};

const CHECKLIST_ITEMS = [
  "Weight verified",
  "Dimensions verified",
  "Finish & polish",
  "Stone setting / prongs",
  "Gold purity verified",
];

export default function QCPage() {
  const { data: inspections, mutate } = useApi<QCRow[]>("/api/qc");
  const { data: orders } = useApi<OrderOption[]>("/api/orders?status=QC");
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">Manufacturing</div>
        <h1 className="text-[19px] font-semibold flex items-center gap-2.5 text-ink">
          Quality Control
          <span className="text-xs text-mute font-medium">{inspections ? `${inspections.length}` : ""}</span>
        </h1>
      </div>

      <div className="flex items-center gap-2 py-2.5 border-t border-b border-line -mx-3.5 px-3.5 sm:-mx-[18px] sm:px-[18px] mb-3.5">
        <button className="console-btn primary" onClick={() => setShowForm((v) => !v)} disabled={!orders?.length}>
          {showForm ? "Cancel" : "+ New Inspection"}
        </button>
        {!orders?.length && <span className="text-xs text-mute">No orders are currently awaiting QC.</span>}
      </div>

      {showForm && orders && orders.length > 0 && (
        <NewInspectionForm
          orders={orders}
          onDone={() => {
            setShowForm(false);
            mutate();
          }}
        />
      )}

      <div className="console-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="console-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Design</th>
                <th>Inspector</th>
                <th>Date</th>
                <th>Result</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {inspections?.map((q) => (
                <tr key={q.id}>
                  <td>
                    <Link href={`/orders/${q.order.id}`} className="rid">
                      {q.order.orderNo}
                    </Link>
                  </td>
                  <td className="text-ink2">{q.order.product.designName}</td>
                  <td>{q.inspector.name}</td>
                  <td className="text-ink2">{formatDate(q.inspectedAt)}</td>
                  <td>
                    <span className={`console-pill ${RESULT_PILL[q.result]}`}>{q.result.replace(/_/g, " ")}</span>
                  </td>
                  <td className="text-ink2">{q.remarks ?? "—"}</td>
                </tr>
              ))}
              {inspections?.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-mute">
                    No QC inspections yet.
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

function NewInspectionForm({ orders, onDone }: { orders: OrderOption[]; onDone: () => void }) {
  const [orderId, setOrderId] = useState(orders[0]?.id ?? "");
  const [checks, setChecks] = useState<Record<string, boolean>>(
    Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i, true]))
  );
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allPass = Object.values(checks).every(Boolean);

  async function submit(result: "PASS" | "FAIL" | "REWORK_REQUIRED") {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/qc", {
        method: "POST",
        body: {
          orderId,
          checklist: CHECKLIST_ITEMS.map((item) => ({ item, pass: checks[item] })),
          result,
          remarks: remarks || undefined,
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="console-panel p-3.5 mb-3.5">
      <label className="console-field-label">Order</label>
      <select className="console-field w-auto mb-3" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
        {orders.map((o) => (
          <option key={o.id} value={o.id}>
            {o.orderNo} — {o.product.designName}
          </option>
        ))}
      </select>

      <div className="console-field-label">Checklist</div>
      <div className="space-y-1.5 mb-3">
        {CHECKLIST_ITEMS.map((item) => (
          <label key={item} className="flex items-center gap-2 text-[12.5px] text-ink">
            <input
              type="checkbox"
              checked={checks[item]}
              onChange={(e) => setChecks((c) => ({ ...c, [item]: e.target.checked }))}
            />
            {item}
          </label>
        ))}
      </div>

      <label className="console-field-label">Remarks</label>
      <textarea className="console-field mb-3" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />

      {error && <p className="text-sm text-err-tx mb-2">{error}</p>}

      <div className="flex gap-2">
        <button className="console-btn primary" disabled={submitting || !allPass} onClick={() => submit("PASS")}>
          Pass
        </button>
        <button className="console-btn" disabled={submitting} onClick={() => submit("REWORK_REQUIRED")}>
          Rework Required
        </button>
        <button className="console-btn text-err-tx" disabled={submitting} onClick={() => submit("FAIL")}>
          Fail
        </button>
      </div>
    </div>
  );
}
