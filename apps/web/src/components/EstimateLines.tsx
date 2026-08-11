"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { deriveRate } from "@jms/shared";

export interface EstimateLine {
  id: string;
  head: "GOLD" | "POLKI" | "COLOURED_STONE" | "MAKING" | "OTHER" | "WASTAGE";
  description: string | null;
  karigarName: string | null;
  quantity: string;
  pieces: number | null;
  rateBasis: "PER_CARAT" | "PER_PIECE" | null;
  rate: string;
  amount: string;
  sourceType: string;
}

export const HEADS: { key: EstimateLine["head"]; label: string; unit: string; hint: string }[] = [
  { key: "GOLD", label: "Gold / Metal", unit: "g", hint: "Enter purity + weight in grams — rate is filled in automatically from today's gold rate." },
  { key: "POLKI", label: "Polki", unit: "ct", hint: "Enter stone type + weight in carats (or a flat rate per piece)." },
  { key: "COLOURED_STONE", label: "Coloured Stones", unit: "kt", hint: "Enter stone type + weight in karat (1 karat = 100 cent), or a flat rate per piece." },
  { key: "MAKING", label: "Making Charges", unit: "", hint: "Pull in from approved karigar labour entries, or add a flat lumpsum amount." },
  { key: "OTHER", label: "Other Charges", unit: "", hint: "Anything else — packaging, certification, hallmarking, etc." },
  { key: "WASTAGE", label: "Wastage", unit: "g", hint: "Add a % of a gold line's weight (priced at the 24K rate) or a flat lumpsum — or pull in actual recorded wastage once production is done." },
];

export const MATERIAL_HEADS: EstimateLine["head"][] = ["GOLD", "POLKI", "COLOURED_STONE"];
export const CHARGE_HEADS: EstimateLine["head"][] = ["MAKING", "OTHER", "WASTAGE"];

// Shared between the costing page (editable while a draft) and the order
// page (always locked/read-only) — same table, same columns, so the figures
// a customer's order was booked at look exactly like the costing sheet they
// were approved from.
export function SectionCard({
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
  goldLines,
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
  goldLines: EstimateLine[];
  goldRate24k: number;
  onChange: () => void;
  onDeleteLine: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="text-[12.5px] font-semibold text-ink">{label}</h3>
        <span className="mono text-xs font-semibold text-ink shrink-0">{formatINR(subtotal)}</span>
      </div>
      <p className="text-[11px] text-mute mb-1.5">{hint}</p>
      {head === "GOLD" && karats.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink2">
          <span className="font-medium text-ink">Indicative rate/g today:</span>
          {karats.map((k) => (
            <span key={k.id} className="mono">
              {k.code}: <span className="text-ink font-medium">{formatINR(deriveRate(goldRate24k, Number(k.purityFactor)))}</span>
            </span>
          ))}
        </div>
      )}
      {lines.length > 0 && (
        <div className="overflow-x-auto mb-1.5">
          <table className="console-etable">
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Amount</th>
                {editable && <th></th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.description ?? "—"}
                    {l.karigarName && <span className="text-mute"> · {l.karigarName}</span>}
                  </td>
                  <td className="mono">
                    {l.rateBasis === "PER_PIECE" && l.pieces
                      ? `${l.pieces} pc`
                      : unit
                        ? `${Number(l.quantity)} ${unit}${l.pieces ? ` (${l.pieces} pc)` : ""}`
                        : "—"}
                  </td>
                  <td className="mono text-ink2">
                    {formatINR(Number(l.rate))}
                    {l.rateBasis === "PER_PIECE" ? "/pc" : ""}
                  </td>
                  <td className="mono font-semibold">{formatINR(Number(l.amount))}</td>
                  {editable && (
                    <td>
                      <button className="text-mute hover:text-err-tx text-xs" onClick={() => onDeleteLine(l.id)}>
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
      {editable && (
        <>
          <button className="text-[11px] text-accent font-medium hover:underline" onClick={() => setShowForm((s) => !s)}>
            + Add {label} Line
          </button>
          {showForm && head === "MAKING" && (
            <LumpsumAddForm
              head={head}
              estimateId={estimateId}
              onDone={() => {
                setShowForm(false);
                onChange();
              }}
            />
          )}
          {showForm && head === "WASTAGE" && (
            <WastageAddForm
              estimateId={estimateId}
              goldLines={goldLines}
              goldRate24k={goldRate24k}
              onDone={() => {
                setShowForm(false);
                onChange();
              }}
            />
          )}
          {showForm && !["MAKING", "WASTAGE"].includes(head) && (
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
  );
}

function LumpsumAddForm({
  head,
  estimateId,
  onDone,
}: {
  head: EstimateLine["head"];
  estimateId: string;
  onDone: () => void;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/estimates/${estimateId}/lines`, {
        method: "POST",
        body: { head, description: description || undefined, quantity: 1, rate: Number(amount) },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add line");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 mt-2 bg-neu-bg p-3 rounded-md">
      <div>
        <label className="console-field-label">Description</label>
        <input className="console-field w-40" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <label className="console-field-label">Lumpsum Amount (₹)</label>
        <input required type="number" step="0.01" min="0.01" className="console-field w-32" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <button className="console-btn primary" disabled={submitting}>
        {submitting ? "Adding…" : "Add"}
      </button>
      {error && <p className="text-sm text-err-tx w-full">{error}</p>}
    </form>
  );
}

// Matches how wastage is actually worked out on paper today (e.g. the Chowker
// N-562 costing sheet): a % of a specific gold line's weight, always priced
// at the locked-in 24K rate — not the purity-adjusted rate of that line.
function WastageAddForm({
  estimateId,
  goldLines,
  goldRate24k,
  onDone,
}: {
  estimateId: string;
  goldLines: EstimateLine[];
  goldRate24k: number;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"PERCENT" | "LUMPSUM">(goldLines.length > 0 ? "PERCENT" : "LUMPSUM");
  const [goldLineId, setGoldLineId] = useState(goldLines[0]?.id ?? "");
  const [pct, setPct] = useState("7");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const basisLine = goldLines.find((l) => l.id === goldLineId);
  const wastageWeightG = basisLine && pct ? round(Number(basisLine.quantity) * (Number(pct) / 100), 3) : null;
  const wastageAmount = wastageWeightG !== null ? round(wastageWeightG * goldRate24k, 2) : null;

  function round(n: number, dp: number) {
    const f = 10 ** dp;
    return Math.round(n * f) / f;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "PERCENT") {
        if (wastageWeightG === null) throw new Error("Pick a gold line and a %");
        await apiFetch(`/api/estimates/${estimateId}/lines`, {
          method: "POST",
          body: {
            head: "WASTAGE",
            description: description || `${pct}% wastage on ${basisLine?.description ?? "gold"}`,
            quantity: wastageWeightG,
            rate: goldRate24k,
          },
        });
      } else {
        await apiFetch(`/api/estimates/${estimateId}/lines`, {
          method: "POST",
          body: { head: "WASTAGE", description: description || undefined, quantity: 1, rate: Number(amount) },
        });
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add line");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 mt-2 bg-neu-bg p-3 rounded-md">
      <div className="flex items-center gap-3 w-full text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === "PERCENT"} onChange={() => setMode("PERCENT")} disabled={goldLines.length === 0} />
          % of gold weight
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === "LUMPSUM"} onChange={() => setMode("LUMPSUM")} />
          Lumpsum
        </label>
        {goldLines.length === 0 && mode === "PERCENT" && (
          <span className="text-xs text-mute">Add a Gold line first to use % of weight.</span>
        )}
      </div>
      {mode === "PERCENT" ? (
        <>
          <div>
            <label className="console-field-label">Gold line</label>
            <select required className="console-field" value={goldLineId} onChange={(e) => setGoldLineId(e.target.value)}>
              {goldLines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.description ?? "Gold"} — {Number(l.quantity)}g
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="console-field-label">Wastage %</label>
            <input required type="number" step="0.01" className="console-field w-24" value={pct} onChange={(e) => setPct(e.target.value)} />
          </div>
          <div>
            <label className="console-field-label">Description (optional)</label>
            <input className="console-field w-40" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="console-field-label">Description</label>
            <input className="console-field w-40" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="console-field-label">Lumpsum Amount (₹)</label>
            <input required type="number" step="0.01" min="0.01" className="console-field w-32" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </>
      )}
      <button className="console-btn primary" disabled={submitting}>
        {submitting ? "Adding…" : "Add"}
      </button>
      {mode === "PERCENT" && wastageWeightG !== null && wastageAmount !== null && (
        <p className="text-xs text-ink2 w-full mono">
          {wastageWeightG}g at today&apos;s locked 24K rate = <span className="text-ink font-medium">{formatINR(wastageAmount)}</span>
        </p>
      )}
      {error && <p className="text-sm text-err-tx w-full">{error}</p>}
    </form>
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
  const [pieces, setPieces] = useState("");
  const [rateBasis, setRateBasis] = useState<"PER_CARAT" | "PER_PIECE">("PER_CARAT");
  const [rate, setRate] = useState("");
  const [useTodaysRate, setUseTodaysRate] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isStone = head === "POLKI" || head === "COLOURED_STONE";
  const unitLabel = head === "GOLD" ? "g" : head === "POLKI" ? "ct" : "kt";
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
          stoneTypeId: isStone ? stoneTypeId : undefined,
          quantity: Number(quantity),
          pieces: isStone && pieces ? Number(pieces) : undefined,
          rateBasis: isStone ? rateBasis : undefined,
          rate: head === "GOLD" && useTodaysRate ? undefined : rate ? Number(rate) : undefined,
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
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 mt-2 bg-neu-bg p-3 rounded-md">
      {head !== "GOLD" && (
        <div>
          <label className="console-field-label">Description</label>
          <input className="console-field w-40" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      )}
      {head === "GOLD" && (
        <div>
          <label className="console-field-label">Purity</label>
          <select required className="console-field" value={purityId} onChange={(e) => setPurityId(e.target.value)}>
            <option value="">Select…</option>
            {karats.map((k) => (
              <option key={k.id} value={k.id}>
                {k.code}
              </option>
            ))}
          </select>
          {indicativeRate !== null && (
            <p className="text-xs text-ink2 mt-1 mono">Indicative: {formatINR(indicativeRate)}/g</p>
          )}
        </div>
      )}
      {isStone && (
        <>
          <div>
            <label className="console-field-label">Stone Type</label>
            <select required className="console-field" value={stoneTypeId} onChange={(e) => setStoneTypeId(e.target.value)}>
              <option value="">Select…</option>
              {relevantStoneTypes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="console-field-label">Quality rate is per</label>
            <select className="console-field" value={rateBasis} onChange={(e) => setRateBasis(e.target.value as typeof rateBasis)}>
              <option value="PER_CARAT">{head === "POLKI" ? "Carat" : "Karat"}</option>
              <option value="PER_PIECE">Piece</option>
            </select>
          </div>
        </>
      )}
      <div>
        <label className="console-field-label">Quantity ({unitLabel}){head === "COLOURED_STONE" ? " · 100 cent = 1kt" : ""}</label>
        <input required type="number" step="0.001" className="console-field w-24" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </div>
      {isStone && (
        <div>
          <label className="console-field-label">Pieces {rateBasis === "PER_CARAT" ? "(reference only)" : ""}</label>
          <input
            required={rateBasis === "PER_PIECE"}
            type="number"
            step="1"
            min="1"
            className="console-field w-20"
            value={pieces}
            onChange={(e) => setPieces(e.target.value)}
          />
        </div>
      )}
      {head === "GOLD" ? (
        <div className="flex items-center gap-2 pb-2">
          <input
            id="autorate"
            type="checkbox"
            checked={useTodaysRate}
            onChange={(e) => setUseTodaysRate(e.target.checked)}
          />
          <label htmlFor="autorate" className="text-sm">
            Use today&apos;s rate
          </label>
        </div>
      ) : null}
      {(head !== "GOLD" || !useTodaysRate) && (
        <div>
          <label className="console-field-label">Rate {isStone ? `(per ${rateBasis === "PER_PIECE" ? "piece" : head === "POLKI" ? "carat" : "karat"})` : "(optional)"}</label>
          <input
            type="number"
            step="0.01"
            required={isStone && rateBasis === "PER_PIECE"}
            className="console-field w-28"
            value={rate}
            placeholder={indicativeRate !== null ? String(indicativeRate) : undefined}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
      )}
      <button className="console-btn primary" disabled={submitting}>
        {submitting ? "Adding…" : "Add"}
      </button>
      {head === "GOLD" && useTodaysRate && indicativeAmount !== null && (
        <p className="text-xs text-ink2 w-full mono">
          Amount at today&apos;s rate: <span className="text-ink font-medium">{formatINR(indicativeAmount)}</span>
        </p>
      )}
      {error && <p className="text-sm text-err-tx w-full">{error}</p>}
    </form>
  );
}
