"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useApi, useKarats, useStoneTypes } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { EstimateStatusPill } from "@/components/StatusPill";
import { formatINR } from "@/lib/format";

interface EstimateLine {
  id: string;
  head: "GOLD" | "POLKI" | "COLOURED_STONE" | "MAKING" | "OTHER" | "WASTAGE";
  description: string | null;
  karigarName: string | null;
  quantity: string;
  rate: string;
  amount: string;
  sourceType: string;
}
interface Estimate {
  id: string;
  productId: string;
  type: string;
  version: number;
  status: string;
  goldRateSnapshot24k: string;
  estimateDate: string;
  profitPct: string;
  materialCost: string;
  makingCharges: string;
  otherCharges: string;
  wastageCost: string;
  cost: string;
  profit: string;
  netAmount: string;
  lines: EstimateLine[];
  product: { serialNo: string; designName: string };
}

const HEADS: { key: EstimateLine["head"]; label: string; unit: string }[] = [
  { key: "GOLD", label: "Gold", unit: "g" },
  { key: "POLKI", label: "Polki", unit: "crt" },
  { key: "COLOURED_STONE", label: "Coloured Stones", unit: "crt" },
  { key: "MAKING", label: "Making Charges & Other", unit: "" },
  { key: "OTHER", label: "Other Charges", unit: "" },
  { key: "WASTAGE", label: "Wastage", unit: "g" },
];

export default function EstimatePage({ params }: { params: Promise<{ estimateId: string }> }) {
  const { estimateId } = use(params);
  const { data: estimate, mutate } = useApi<Estimate>(`/api/estimates/${estimateId}`);
  const { data: karats } = useKarats();
  const { data: stoneTypes } = useStoneTypes();
  const [profitPct, setProfitPct] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!estimate) return <div className="text-text-muted">Loading…</div>;

  const editable = estimate.status === "DRAFT";
  const linesByHead = (head: EstimateLine["head"]) => estimate.lines.filter((l) => l.head === head);
  const subtotal = (head: EstimateLine["head"]) =>
    linesByHead(head).reduce((sum, l) => sum + Number(l.amount), 0);

  async function saveProfitPct() {
    if (profitPct === null) return;
    try {
      await apiFetch(`/api/estimates/${estimateId}`, { method: "PATCH", body: { profitPct: Number(profitPct) } });
      setProfitPct(null);
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function approve() {
    try {
      await apiFetch(`/api/estimates/${estimateId}/approve`, { method: "POST" });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function pullLabour() {
    await apiFetch(`/api/estimates/${estimateId}/pull-labour`, { method: "POST" });
    await mutate();
  }

  async function pullWastage() {
    await apiFetch(`/api/estimates/${estimateId}/pull-wastage`, { method: "POST" });
    await mutate();
  }

  async function deleteLine(lineId: string) {
    await apiFetch(`/api/estimates/lines/${lineId}`, { method: "DELETE" });
    await mutate();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            Estimate —{" "}
            <Link href={`/products/${estimate.product.serialNo}`} className="font-mono text-gold">
              {estimate.product.serialNo}
            </Link>
          </h1>
          <p className="text-sm text-text-muted">
            {estimate.type.replace(/_/g, " ")} · Version {estimate.version} · <EstimateStatusPill status={estimate.status} />
          </p>
        </div>
        <div className="flex gap-2">
          {editable && (
            <>
              <button className="btn btn-outline" onClick={pullLabour}>
                Pull Labour
              </button>
              <button className="btn btn-outline" onClick={pullWastage}>
                Pull Wastage
              </button>
              <button className="btn btn-primary" onClick={approve}>
                Approve &amp; Lock
              </button>
            </>
          )}
          {!editable && (
            <>
              <a href={`/api/estimates/${estimateId}/pdf`} target="_blank" rel="noreferrer" className="btn btn-outline">
                Export PDF
              </a>
              <a href={`/api/estimates/${estimateId}/excel`} target="_blank" rel="noreferrer" className="btn btn-outline">
                Export Excel
              </a>
            </>
          )}
        </div>
      </div>

      <div className="card p-3 bg-gold-tint text-sm flex items-center gap-2">
        <span>
          Gold Rate applied: <strong>{formatINR(Number(estimate.goldRateSnapshot24k))} / g (24K)</strong> as on{" "}
          {new Date(estimate.estimateDate).toLocaleDateString("en-IN")}
        </span>
        <span className="text-text-muted">— Rates are frozen against this estimate.</span>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="grid lg:grid-cols-[1fr_320px] gap-5">
        <div className="space-y-4">
          {HEADS.map((h) => (
            <SectionCard
              key={h.key}
              head={h.key}
              label={h.label}
              unit={h.unit}
              lines={linesByHead(h.key)}
              subtotal={subtotal(h.key)}
              editable={editable}
              estimateId={estimateId}
              karats={karats ?? []}
              stoneTypes={stoneTypes ?? []}
              onChange={mutate}
              onDeleteLine={deleteLine}
            />
          ))}
        </div>

        <div className="card p-5 h-fit sticky top-20 space-y-2 text-sm">
          <h2 className="font-semibold mb-2">Summary</h2>
          <Row label="Material Cost" value={formatINR(Number(estimate.materialCost))} />
          <Row label="Making Charges" value={formatINR(Number(estimate.makingCharges))} />
          <Row label="Other Charges" value={formatINR(Number(estimate.otherCharges))} />
          <Row label="Wastage Cost" value={formatINR(Number(estimate.wastageCost))} />
          <div className="border-t border-border my-2" />
          <Row label="Cost (₹)" value={formatINR(Number(estimate.cost))} bold />
          <div className="flex justify-between items-center">
            <span className="text-text-muted">Profit %</span>
            {editable ? (
              <input
                className="input w-20 text-right"
                type="number"
                step="0.01"
                defaultValue={estimate.profitPct}
                onChange={(e) => setProfitPct(e.target.value)}
                onBlur={saveProfitPct}
              />
            ) : (
              <span className="tabular">{Number(estimate.profitPct)}%</span>
            )}
          </div>
          <Row label="Profit" value={formatINR(Number(estimate.profit))} />
          <div className="border-t-2 border-gold my-2" />
          <div className="flex justify-between items-baseline bg-gold-tint -mx-5 px-5 py-2.5 rounded">
            <span className="font-semibold">Net Amount</span>
            <span className="text-xl font-bold text-gold tabular">{formatINR(Number(estimate.netAmount))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <span className="text-text-muted">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

function SectionCard({
  head,
  label,
  unit,
  lines,
  subtotal,
  editable,
  estimateId,
  karats,
  stoneTypes,
  onChange,
  onDeleteLine,
}: {
  head: EstimateLine["head"];
  label: string;
  unit: string;
  lines: EstimateLine[];
  subtotal: number;
  editable: boolean;
  estimateId: string;
  karats: { id: string; code: string }[];
  stoneTypes: { id: string; name: string; category: string }[];
  onChange: () => void;
  onDeleteLine: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-l-4 border-l-gold bg-bg">
        <h3 className="font-semibold">{label}</h3>
        <span className="tabular font-medium">{formatINR(subtotal)}</span>
      </div>
      <div className="px-5 py-3">
        {lines.length > 0 && (
          <table className="w-full text-sm mb-2">
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="py-1.5 pr-2">{l.description ?? l.karigarName ?? "—"}</td>
                  <td className="py-1.5 pr-2 text-right tabular">{Number(l.quantity)} {unit}</td>
                  <td className="py-1.5 pr-2 text-right tabular text-text-muted">{formatINR(Number(l.rate))}</td>
                  <td className="py-1.5 pr-2 text-right tabular font-medium">{formatINR(Number(l.amount))}</td>
                  {editable && (
                    <td className="py-1.5 text-right">
                      <button className="text-text-muted hover:text-danger text-xs" onClick={() => onDeleteLine(l.id)}>
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {editable && !["MAKING", "WASTAGE"].includes(head) && (
          <>
            <button className="btn btn-ghost text-xs" onClick={() => setShowForm((s) => !s)}>
              + Add {label} Line
            </button>
            {showForm && (
              <AddLineForm
                head={head}
                estimateId={estimateId}
                karats={karats}
                stoneTypes={stoneTypes}
                onDone={() => {
                  setShowForm(false);
                  onChange();
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AddLineForm({
  head,
  estimateId,
  karats,
  stoneTypes,
  onDone,
}: {
  head: EstimateLine["head"];
  estimateId: string;
  karats: { id: string; code: string }[];
  stoneTypes: { id: string; name: string; category: string }[];
  onDone: () => void;
}) {
  const [description, setDescription] = useState("");
  const [purityId, setPurityId] = useState("");
  const [stoneTypeId, setStoneTypeId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const relevantStoneTypes =
    head === "POLKI"
      ? stoneTypes.filter((s) => s.category === "POLKI")
      : stoneTypes.filter((s) => s.category !== "POLKI");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/estimates/${estimateId}/lines`, {
        method: "POST",
        body: {
          head,
          description: description || undefined,
          purityId: head === "GOLD" ? purityId : undefined,
          stoneTypeId: head === "POLKI" || head === "COLOURED_STONE" ? stoneTypeId : undefined,
          quantity: Number(quantity),
          rate: rate ? Number(rate) : undefined,
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add line");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 mt-2 bg-bg p-3 rounded-lg">
      {head !== "GOLD" && (
        <div>
          <label className="label">Description</label>
          <input className="input w-40" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      )}
      {head === "GOLD" && (
        <div>
          <label className="label">Purity</label>
          <select required className="input" value={purityId} onChange={(e) => setPurityId(e.target.value)}>
            <option value="">Select…</option>
            {karats.map((k) => (
              <option key={k.id} value={k.id}>
                {k.code}
              </option>
            ))}
          </select>
        </div>
      )}
      {(head === "POLKI" || head === "COLOURED_STONE") && (
        <div>
          <label className="label">Stone Type</label>
          <select required className="input" value={stoneTypeId} onChange={(e) => setStoneTypeId(e.target.value)}>
            <option value="">Select…</option>
            {relevantStoneTypes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="label">Quantity</label>
        <input required type="number" step="0.001" className="input w-24" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </div>
      <div>
        <label className="label">Rate (optional)</label>
        <input type="number" step="0.01" className="input w-28" value={rate} onChange={(e) => setRate(e.target.value)} />
      </div>
      <button className="btn btn-primary" disabled={submitting}>
        {submitting ? "Adding…" : "Add"}
      </button>
      {error && <p className="text-sm text-danger w-full">{error}</p>}
    </form>
  );
}
