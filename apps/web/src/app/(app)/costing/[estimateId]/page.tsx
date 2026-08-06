"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApi, useKarats, useStoneTypes } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { EstimateStatusPill } from "@/components/StatusPill";
import { formatINR } from "@/lib/format";
import { deriveRate } from "@jms/shared";
import { useAuth } from "@/lib/auth-context";

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
  gstPct: string;
  gstAmount: string;
  netAmount: string;
  lines: EstimateLine[];
  product: { serialNo: string; designName: string };
}

const HEADS: { key: EstimateLine["head"]; label: string; unit: string; hint: string }[] = [
  { key: "GOLD", label: "Gold", unit: "g", hint: "Enter purity + weight — rate is filled in automatically from today's gold rate." },
  { key: "POLKI", label: "Polki", unit: "crt", hint: "Enter stone type + weight in carats." },
  { key: "COLOURED_STONE", label: "Coloured Stones", unit: "crt", hint: "Enter stone type + weight in carats." },
  { key: "MAKING", label: "Making Charges", unit: "", hint: "Pulled in automatically from approved karigar labour entries." },
  { key: "OTHER", label: "Other Charges", unit: "", hint: "Anything else — packaging, certification, hallmarking, etc." },
  { key: "WASTAGE", label: "Wastage", unit: "g", hint: "Pulled in automatically from recorded gold wastage within tolerance." },
];

const MATERIAL_HEADS: EstimateLine["head"][] = ["GOLD", "POLKI", "COLOURED_STONE"];
const CHARGE_HEADS: EstimateLine["head"][] = ["MAKING", "OTHER", "WASTAGE"];

export default function EstimatePage({ params }: { params: Promise<{ estimateId: string }> }) {
  const { estimateId } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { data: estimate, mutate } = useApi<Estimate>(`/api/estimates/${estimateId}`);
  const { data: karats } = useKarats();
  const { data: stoneTypes } = useStoneTypes();
  const [profitPct, setProfitPct] = useState<string | null>(null);
  const [gstPct, setGstPct] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  if (!estimate) return <div className="text-text-muted">Loading…</div>;

  const editable = estimate.status === "DRAFT";
  const canUnlock = user?.role === "SUPER_ADMIN" && estimate.status === "SUBMITTED";
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

  async function saveGstPct() {
    if (gstPct === null) return;
    try {
      await apiFetch(`/api/estimates/${estimateId}`, { method: "PATCH", body: { gstPct: Number(gstPct) } });
      setGstPct(null);
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

  async function unlock() {
    setError(null);
    try {
      await apiFetch(`/api/estimates/${estimateId}/unlock`, { method: "POST" });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function convertToFinalCosting() {
    setError(null);
    setConverting(true);
    try {
      const created = await apiFetch<{ id: string }>(`/api/estimates/${estimateId}/convert-to-final-costing`, {
        method: "POST",
      });
      router.push(`/costing/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
      setConverting(false);
    }
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
              {estimate.type === "ROUGH_ESTIMATE" && (
                <button className="btn btn-outline" onClick={convertToFinalCosting} disabled={converting}>
                  {converting ? "Converting…" : "Convert to Final Costing"}
                </button>
              )}
              {canUnlock && (
                <button className="btn btn-outline" onClick={unlock}>
                  Unlock for Editing
                </button>
              )}
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

      <div className="card p-3 bg-gold-tint text-sm flex flex-wrap items-center gap-2">
        <span>
          Gold Rate applied: <strong>{formatINR(Number(estimate.goldRateSnapshot24k))} / g (24K)</strong> as on{" "}
          {new Date(estimate.estimateDate).toLocaleDateString("en-IN")}
        </span>
        <span className="text-text-muted">— this rate is locked in and won't change even if today's rate moves.</span>
      </div>

      <div className="card p-4 text-sm leading-relaxed">
        It costs <strong className="tabular">{formatINR(Number(estimate.cost))}</strong> to make this piece. Add{" "}
        <strong>{Number(estimate.profitPct)}%</strong> profit and <strong>{Number(estimate.gstPct)}%</strong> GST, and the
        customer pays <strong className="text-gold tabular">{formatINR(Number(estimate.netAmount))}</strong>.
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="grid lg:grid-cols-[1fr_320px] gap-5">
        <div className="space-y-6">
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">1. Materials — gold &amp; stones</h2>
            {HEADS.filter((h) => MATERIAL_HEADS.includes(h.key)).map((h) => (
              <SectionCard
                key={h.key}
                head={h.key}
                label={h.label}
                unit={h.unit}
                hint={h.hint}
                lines={linesByHead(h.key)}
                subtotal={subtotal(h.key)}
                editable={editable}
                estimateId={estimateId}
                karats={karats ?? []}
                stoneTypes={stoneTypes ?? []}
                goldRate24k={Number(estimate.goldRateSnapshot24k)}
                onChange={mutate}
                onDeleteLine={deleteLine}
              />
            ))}
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">2. Making, other charges &amp; wastage</h2>
            {HEADS.filter((h) => CHARGE_HEADS.includes(h.key)).map((h) => (
              <SectionCard
                key={h.key}
                head={h.key}
                label={h.label}
                unit={h.unit}
                hint={h.hint}
                lines={linesByHead(h.key)}
                subtotal={subtotal(h.key)}
                editable={editable}
                estimateId={estimateId}
                karats={karats ?? []}
                stoneTypes={stoneTypes ?? []}
                goldRate24k={Number(estimate.goldRateSnapshot24k)}
                onChange={mutate}
                onDeleteLine={deleteLine}
              />
            ))}
          </div>
        </div>

        <div className="card p-5 h-fit lg:sticky lg:top-20 space-y-2 text-sm">
          <h2 className="font-semibold mb-2">3. Final Bill</h2>
          <Row label="Gold &amp; Stones" value={formatINR(Number(estimate.materialCost))} />
          <Row label="Making Charges" value={formatINR(Number(estimate.makingCharges))} />
          <Row label="Other Charges" value={formatINR(Number(estimate.otherCharges))} />
          <Row label="Wastage" value={formatINR(Number(estimate.wastageCost))} />
          <div className="border-t border-border my-2" />
          <Row label="Total Cost" value={formatINR(Number(estimate.cost))} bold />
          <p className="text-xs text-text-muted -mt-1">What it costs you to make this piece.</p>
          <div className="flex justify-between items-center">
            <span className="text-text-muted">Your Profit %</span>
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
          <Row label="Profit Amount" value={formatINR(Number(estimate.profit))} />
          <div className="border-t border-border my-2" />
          <div className="flex justify-between items-center">
            <span className="text-text-muted">GST %</span>
            {editable ? (
              <input
                className="input w-20 text-right"
                type="number"
                step="0.01"
                defaultValue={estimate.gstPct}
                onChange={(e) => setGstPct(e.target.value)}
                onBlur={saveGstPct}
              />
            ) : (
              <span className="tabular">{Number(estimate.gstPct)}%</span>
            )}
          </div>
          <Row label="GST Amount" value={formatINR(Number(estimate.gstAmount))} />
          <div className="border-t-2 border-gold my-2" />
          <div className="flex justify-between items-baseline bg-gold-tint -mx-5 px-5 py-2.5 rounded">
            <div>
              <div className="font-semibold">Customer Pays</div>
              <div className="text-xs text-text-muted font-normal">Final bill, GST included</div>
            </div>
            <span className="text-xl font-bold text-gold tabular">{formatINR(Number(estimate.netAmount))}</span>
          </div>
          {editable && (
            <p className="text-xs text-text-muted pt-1">
              Once you hit "Approve &amp; Lock", this can't be edited — you'd need to create a new version instead.
            </p>
          )}
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
  hint,
  lines,
  subtotal,
  editable,
  estimateId,
  karats,
  stoneTypes,
  goldRate24k,
  onChange,
  onDeleteLine,
}: {
  head: EstimateLine["head"];
  label: string;
  unit: string;
  hint: string;
  lines: EstimateLine[];
  subtotal: number;
  editable: boolean;
  estimateId: string;
  karats: { id: string; code: string; purityFactor: string }[];
  stoneTypes: { id: string; name: string; category: string }[];
  goldRate24k: number;
  onChange: () => void;
  onDeleteLine: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-l-4 border-l-gold bg-bg gap-3">
        <div>
          <h3 className="font-semibold">{label}</h3>
          <p className="text-xs text-text-muted mt-0.5 hidden sm:block">{hint}</p>
        </div>
        <span className="tabular font-medium shrink-0">{formatINR(subtotal)}</span>
      </div>
      {head === "GOLD" && karats.length > 0 && (
        <div className="px-5 py-2 border-b border-border bg-bg/50 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
          <span className="font-medium text-text">Indicative rate/g today:</span>
          {karats.map((k) => (
            <span key={k.id} className="tabular">
              {k.code}: <span className="text-text font-medium">{formatINR(deriveRate(goldRate24k, Number(k.purityFactor)))}</span>
            </span>
          ))}
        </div>
      )}
      <div className="px-5 py-3">
        {lines.length > 0 && (
          <div className="overflow-x-auto">
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
          </div>
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
                goldRate24k={goldRate24k}
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
  goldRate24k,
  onDone,
}: {
  head: EstimateLine["head"];
  estimateId: string;
  karats: { id: string; code: string; purityFactor: string }[];
  stoneTypes: { id: string; name: string; category: string }[];
  goldRate24k: number;
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

  const selectedKarat = karats.find((k) => k.id === purityId);
  const indicativeRate = selectedKarat ? deriveRate(goldRate24k, Number(selectedKarat.purityFactor)) : null;
  const indicativeAmount =
    indicativeRate !== null && quantity ? Math.round(indicativeRate * Number(quantity) * 100) / 100 : null;

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
          {indicativeRate !== null && (
            <p className="text-xs text-text-muted mt-1 tabular">Indicative: {formatINR(indicativeRate)}/g</p>
          )}
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
        <input
          type="number"
          step="0.01"
          className="input w-28"
          value={rate}
          placeholder={indicativeRate !== null ? String(indicativeRate) : undefined}
          onChange={(e) => setRate(e.target.value)}
        />
      </div>
      <button className="btn btn-primary" disabled={submitting}>
        {submitting ? "Adding…" : "Add"}
      </button>
      {head === "GOLD" && indicativeAmount !== null && (
        <p className="text-xs text-text-muted w-full tabular">
          Indicative amount at today's rate: <span className="text-text font-medium">{formatINR(indicativeAmount)}</span>{" "}
          (leave Rate blank to auto-fill exactly this on save)
        </p>
      )}
      {error && <p className="text-sm text-danger w-full">{error}</p>}
    </form>
  );
}
