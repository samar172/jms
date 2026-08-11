"use client";

import { useState } from "react";
import { useApi, useStoneTypes } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { JobStageStatusPill } from "@/components/StatusPill";
import { formatINR, formatWeight, formatPct, formatCarat } from "@/lib/format";
import { computeWastage, fineWeight } from "@jms/shared";
import { hi } from "@/lib/hi";
import { AddKarigarForm } from "@/components/AddKarigarForm";
import { useAuth } from "@/lib/auth-context";

export interface WastageRecord {
  id: string;
  netWastageG: string;
  wastagePct: string;
  tolerancePct: string;
  withinTolerance: boolean;
  exceptionStatus: "NONE" | "PENDING" | "APPROVED" | "REJECTED";
  exceptionReason?: string | null;
}
export interface LabourEntry {
  id: string;
  quantity: string;
  rate: string;
  amount: string;
  status: string;
  rateBasis: string;
}
export interface MaterialIssue {
  id: string;
  materialType: "GOLD" | "POLKI" | "COLOURED_STONE" | "FINDING";
  fineWeightG: string;
  grossWeightG: string | null;
  caratWeight: string | null;
  pieces: number | null;
  purity?: { code: string } | null;
  stoneType?: { name: string } | null;
}
export interface JobStage {
  id: string;
  status: string;
  karigarId: string | null;
  karigar?: { name: string } | null;
  processStage: { id: string; name: string; sequenceOrder: number; wastageTolerancePct: string };
  materialIssues: MaterialIssue[];
  materialReceipts: unknown[];
  labourEntries: LabourEntry[];
  wastageRecord: WastageRecord | null;
}

// Extracted from the job-cards detail page so the same full workflow
// (assign karigar, issue/receive material, decide wastage exceptions, log
// labour) can be embedded inline on the costing page too — avoids forcing
// staff to bounce between /costing/[estimateId] and /job-cards/[id] to get
// a single job done.
export function JobStageCard({
  stage,
  purityFactor,
  karigars,
  onKarigarCreated,
  busy,
  setBusy,
  onChange,
}: {
  stage: JobStage;
  purityFactor: number;
  karigars: { id: string; name: string }[];
  onKarigarCreated: () => void;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onChange: () => void;
}) {
  const [karigarId, setKarigarId] = useState(stage.karigarId ?? "");
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [showAddKarigar, setShowAddKarigar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assignKarigar() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/job-cards/stages/${stage.id}`, { method: "PATCH", body: { karigarId } });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function approveStage() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/job-cards/stages/${stage.id}`, { method: "PATCH", body: { status: "APPROVED" } });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="console-panel p-3.5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <h3 className="text-[13px] font-semibold text-ink">{stage.processStage.name}</h3>
          <JobStageStatusPill status={stage.status} />
        </div>
        {stage.status !== "APPROVED" && (
          <button className="console-btn" disabled={busy} onClick={approveStage}>
            Approve Stage
          </button>
        )}
      </div>

      {error && <p className="text-sm text-err-tx mb-2">{error}</p>}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <select className="console-field w-auto" value={karigarId} onChange={(e) => setKarigarId(e.target.value)}>
          <option value="">Unassigned</option>
          {karigars.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
        <button className="console-btn" disabled={busy || !karigarId} onClick={assignKarigar}>
          Assign
        </button>
        <button type="button" className="text-xs text-accent hover:underline" onClick={() => setShowAddKarigar((v) => !v)}>
          {showAddKarigar ? "Cancel" : "+ New Karigar"}
        </button>
      </div>
      {showAddKarigar && (
        <div className="bg-neu-bg p-3 rounded-md mb-3">
          <AddKarigarForm
            onCreated={(k) => {
              setKarigarId(k.id);
              setShowAddKarigar(false);
              onKarigarCreated();
            }}
            onCancel={() => setShowAddKarigar(false)}
          />
        </div>
      )}

      {stage.materialIssues.length > 0 && (
        <div className="text-sm text-ink2 mb-2 space-y-0.5">
          {stage.materialIssues.map((mi) => (
            <div key={mi.id}>
              {mi.materialType === "GOLD"
                ? `Gold (${mi.purity?.code ?? "—"}): ${formatWeight(mi.fineWeightG)} fine`
                : mi.materialType === "FINDING"
                  ? `Finding: ${mi.grossWeightG ? formatWeight(mi.grossWeightG) : ""}${mi.pieces ? ` · ${mi.pieces} pc` : ""}`
                  : `${mi.materialType.replace(/_/g, " ")} (${mi.stoneType?.name ?? "—"}): ${
                      mi.caratWeight ? formatCarat(mi.caratWeight) : ""
                    }${mi.pieces ? ` · ${mi.pieces} pc` : ""}`}
            </div>
          ))}
        </div>
      )}
      <button className="console-btn mb-3" onClick={() => setShowIssueForm((s) => !s)} disabled={!stage.karigarId}>
        {showIssueForm ? "Cancel" : "+ Issue Material"}
      </button>
      {showIssueForm && (
        <IssueForm
          stageId={stage.id}
          karigarId={stage.karigarId!}
          onDone={() => {
            setShowIssueForm(false);
            onChange();
          }}
        />
      )}

      {stage.materialIssues.length > 0 && !stage.wastageRecord && (
        <button className="console-btn primary mb-3" onClick={() => setShowReceiptForm((s) => !s)}>
          {showReceiptForm ? "Cancel" : "Receive & Reconcile"}
        </button>
      )}
      {showReceiptForm && (
        <ReceiptForm
          stageId={stage.id}
          karigarId={stage.karigarId!}
          fineIssuedG={stage.materialIssues.reduce((s, i) => s + Number(i.fineWeightG), 0)}
          grossIssuedG={stage.materialIssues.reduce((s, i) => s + Number(i.grossWeightG ?? 0), 0)}
          purityFactor={purityFactor}
          tolerancePct={Number(stage.processStage.wastageTolerancePct)}
          onDone={() => {
            setShowReceiptForm(false);
            onChange();
          }}
        />
      )}

      {stage.wastageRecord && <WastageDisplay wastage={stage.wastageRecord} stageId={stage.id} onChange={onChange} />}

      <LabourSection stage={stage} onChange={onChange} />
    </div>
  );
}

const ISSUE_MATERIAL_TYPES = [
  { value: "GOLD", label: "Gold / Metal" },
  { value: "POLKI", label: "Polki" },
  { value: "COLOURED_STONE", label: "Coloured Stone / Diamond" },
  { value: "FINDING", label: "Finding (clasp, hook, etc.)" },
] as const;

function IssueForm({ stageId, karigarId, onDone }: { stageId: string; karigarId: string; onDone: () => void }) {
  const { data: karats } = useApi<{ id: string; code: string }[]>("/api/masters/karats");
  const { data: stoneTypes } = useStoneTypes();
  const [materialType, setMaterialType] = useState<(typeof ISSUE_MATERIAL_TYPES)[number]["value"]>("GOLD");
  const [purityId, setPurityId] = useState("");
  const [grossWeightG, setGrossWeightG] = useState("");
  const [stoneTypeId, setStoneTypeId] = useState("");
  const [caratWeight, setCaratWeight] = useState("");
  const [pieces, setPieces] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Matches the estimate module's convention: a POLKI-head line pulls from
  // stoneType.category "POLKI"; COLOURED_STONE covers both DIAMOND and
  // COLOURED_STONE categories (there's no separate "Diamond" material type).
  const stoneOptions = (stoneTypes ?? []).filter((s) =>
    materialType === "POLKI" ? s.category === "POLKI" : s.category !== "POLKI"
  );

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/materials/issues", {
        method: "POST",
        body: {
          jobStageId: stageId,
          karigarId,
          materialType,
          purityId: materialType === "GOLD" ? purityId : undefined,
          grossWeightG:
            materialType === "GOLD" || materialType === "FINDING" ? Number(grossWeightG) || undefined : undefined,
          stoneTypeId: materialType === "POLKI" || materialType === "COLOURED_STONE" ? stoneTypeId : undefined,
          caratWeight:
            materialType === "POLKI" || materialType === "COLOURED_STONE" ? Number(caratWeight) || undefined : undefined,
          pieces: pieces ? Number(pieces) : undefined,
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
    <form onSubmit={submit} className="flex items-end gap-2 mb-3 bg-neu-bg p-3 rounded-md flex-wrap">
      <div>
        <label className="console-field-label">Material</label>
        <select
          className="console-field"
          value={materialType}
          onChange={(e) => setMaterialType(e.target.value as (typeof ISSUE_MATERIAL_TYPES)[number]["value"])}
        >
          {ISSUE_MATERIAL_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {materialType === "GOLD" && (
        <>
          <div>
            <label className="console-field-label">Purity</label>
            <select required className="console-field" value={purityId} onChange={(e) => setPurityId(e.target.value)}>
              <option value="">Select…</option>
              {karats?.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="console-field-label">Gross Weight (g)</label>
            <input
              required
              type="number"
              step="0.001"
              className="console-field"
              value={grossWeightG}
              onChange={(e) => setGrossWeightG(e.target.value)}
            />
          </div>
        </>
      )}

      {(materialType === "POLKI" || materialType === "COLOURED_STONE") && (
        <>
          <div>
            <label className="console-field-label">Stone Type</label>
            <select required className="console-field" value={stoneTypeId} onChange={(e) => setStoneTypeId(e.target.value)}>
              <option value="">Select…</option>
              {stoneOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="console-field-label">Carat Weight</label>
            <input
              required
              type="number"
              step="0.001"
              className="console-field"
              value={caratWeight}
              onChange={(e) => setCaratWeight(e.target.value)}
            />
          </div>
          <div>
            <label className="console-field-label">Pieces (optional)</label>
            <input type="number" step="1" className="console-field w-20" value={pieces} onChange={(e) => setPieces(e.target.value)} />
          </div>
        </>
      )}

      {materialType === "FINDING" && (
        <>
          <div>
            <label className="console-field-label">Weight (g, optional)</label>
            <input
              type="number"
              step="0.001"
              className="console-field"
              value={grossWeightG}
              onChange={(e) => setGrossWeightG(e.target.value)}
            />
          </div>
          <div>
            <label className="console-field-label">Pieces (optional)</label>
            <input type="number" step="1" className="console-field w-20" value={pieces} onChange={(e) => setPieces(e.target.value)} />
          </div>
        </>
      )}

      <button className="console-btn primary" disabled={submitting}>
        {submitting ? "Issuing…" : "Issue"}
      </button>
      {error && <p className="text-sm text-err-tx w-full">{error}</p>}
    </form>
  );
}

interface DustLot {
  id: string;
  lotNo: string;
  status: string;
}

function ReceiptForm({
  stageId,
  karigarId,
  fineIssuedG,
  grossIssuedG,
  purityFactor,
  tolerancePct,
  onDone,
}: {
  stageId: string;
  karigarId: string;
  fineIssuedG: number;
  grossIssuedG: number;
  purityFactor: number;
  tolerancePct: number;
  onDone: () => void;
}) {
  const { data: dustLots } = useApi<DustLot[]>("/api/materials/dust-lots");
  const openDustLots = dustLots?.filter((l) => l.status === "OPEN") ?? [];
  const [finishedPieceWeightG, setFinishedPieceWeightG] = useState("");
  const [fillerWeightG, setFillerWeightG] = useState("0");
  const [fillerNote, setFillerNote] = useState("");
  const [pieceWeightIsFine, setPieceWeightIsFine] = useState(true);
  const [dustWeightG, setDustWeightG] = useState("0");
  const [unusedReturnedWeightG, setUnusedReturnedWeightG] = useState("0");
  const [dustLotId, setDustLotId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Netted-out non-gold filler (wax/solder/support wire) never had gold value
  // to begin with — mirrors receiptFineWeights() on the server so this
  // preview matches what actually gets saved.
  const netPieceG = Math.max((Number(finishedPieceWeightG) || 0) - (Number(fillerWeightG) || 0), 0);
  const preview = computeWastage({
    fineIssuedG,
    finePieceG: pieceWeightIsFine ? netPieceG : fineWeight(netPieceG, purityFactor),
    fineDustG: fineWeight(Number(dustWeightG) || 0, purityFactor),
    fineReturnedG: fineWeight(Number(unusedReturnedWeightG) || 0, purityFactor),
  });
  const withinTolerance = preview.wastagePct <= tolerancePct;
  const totalReturnedRawG =
    (Number(finishedPieceWeightG) || 0) + (Number(dustWeightG) || 0) + (Number(unusedReturnedWeightG) || 0);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/materials/receipts", {
        method: "POST",
        body: {
          jobStageId: stageId,
          karigarId,
          finishedPieceWeightG: Number(finishedPieceWeightG) || 0,
          fillerWeightG: Number(fillerWeightG) || 0,
          fillerNote: fillerNote || undefined,
          pieceWeightIsFine,
          dustWeightG: Number(dustWeightG) || 0,
          unusedReturnedWeightG: Number(unusedReturnedWeightG) || 0,
          dustLotId: Number(dustWeightG) > 0 && dustLotId ? dustLotId : undefined,
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
    <form onSubmit={submit} className="bg-neu-bg p-4 rounded-md mb-3 grid sm:grid-cols-2 gap-4">
      <div className="space-y-4">
        <div className="rounded-md border border-line p-3 space-y-1 bg-panel">
          <div className="text-sm text-ink2">
            Gross Weight Issued <span className="text-xs">(karigar ko diya gaya kul vazan — weigh returns against this)</span>:{" "}
            <span className="font-medium text-ink mono">{formatWeight(grossIssuedG)}</span>
          </div>
          <div className="text-xs text-ink2">
            Fine Gold Issued <span className="text-xs">({hi.receipt.fineGoldIssued})</span>:{" "}
            <span className="mono">{formatWeight(fineIssuedG)}</span>
          </div>
          <p className="text-xs text-mute pt-1">
            Enter weights exactly as weighed on the scale (raw, not fine). Their total should come close to the
            Gross Weight Issued above, not the Fine Gold Issued figure.
          </p>
        </div>
        <div>
          <label className="label-lg">
            Finished Piece Weight (g)
            <span className="label-hi">{hi.receipt.finishedPieceWeight} (ग्राम)</span>
          </label>
          <input
            required
            type="number"
            inputMode="decimal"
            step="0.001"
            className="input-lg tabular"
            value={finishedPieceWeightG}
            onChange={(e) => setFinishedPieceWeightG(e.target.value)}
          />
        </div>
        <div>
          <label className="label-lg">
            Filler Weight (g) — wax/solder/support wire, if any
            <span className="label-hi">Non-gold material mixed in — zero gold value</span>
          </label>
          <input
            type="number"
            inputMode="decimal"
            step="0.001"
            className="input-lg tabular"
            value={fillerWeightG}
            onChange={(e) => setFillerWeightG(e.target.value)}
          />
          {Number(fillerWeightG) > 0 && (
            <input
              className="input mt-2"
              placeholder="What was the filler? (optional note)"
              value={fillerNote}
              onChange={(e) => setFillerNote(e.target.value)}
            />
          )}
          <label className="flex items-center gap-2 mt-2 text-sm">
            <input type="checkbox" checked={pieceWeightIsFine} onChange={(e) => setPieceWeightIsFine(e.target.checked)} />
            Weight above (net of filler) is already fine gold — don&apos;t reduce it further by the piece&apos;s karat
          </label>
        </div>
        <div>
          <label className="label-lg">
            Gold Dust Recovered (g)
            <span className="label-hi">{hi.receipt.dustRecovered} (ग्राम)</span>
          </label>
          <input
            type="number"
            inputMode="decimal"
            step="0.001"
            className="input-lg tabular"
            value={dustWeightG}
            onChange={(e) => setDustWeightG(e.target.value)}
          />
          {Number(dustWeightG) > 0 && (
            <select className="console-field mt-2" value={dustLotId} onChange={(e) => setDustLotId(e.target.value)}>
              <option value="">Don&apos;t add to a dust lot</option>
              {openDustLots.map((lot) => (
                <option key={lot.id} value={lot.id}>
                  Add to {lot.lotNo}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="label-lg">
            Unused Gold Returned (g)
            <span className="label-hi">{hi.receipt.unusedReturned} (ग्राम)</span>
          </label>
          <input
            type="number"
            inputMode="decimal"
            step="0.001"
            className="input-lg tabular"
            value={unusedReturnedWeightG}
            onChange={(e) => setUnusedReturnedWeightG(e.target.value)}
          />
        </div>
        <div className="text-xs text-mute tabular">
          Returned so far: {formatWeight(totalReturnedRawG)} of {formatWeight(grossIssuedG)} gross issued
        </div>
      </div>
      <div className={`rounded-md p-4 flex flex-col justify-center items-center ${withinTolerance ? "bg-ok-bg" : "bg-err-bg"}`}>
        <div className="text-sm text-ink2 mb-1 text-center">
          Net Wastage <span className="block">{hi.receipt.netWastage}</span>
        </div>
        <div className={`text-4xl font-bold tabular ${withinTolerance ? "text-ok-tx" : "text-err-tx"}`}>
          {formatPct(preview.wastagePct)}
        </div>
        <div className="text-sm text-ink2 mt-1">{formatWeight(preview.netWastageG)} · Tolerance {formatPct(tolerancePct)}</div>
        {!withinTolerance && (
          <p className="text-sm text-err-tx mt-2 text-center font-medium">
            Exceeds tolerance — Manager approval required.
            <span className="block font-normal">{hi.receipt.exceedsTolerance}</span>
          </p>
        )}
        <button className="console-btn primary mt-3 w-full justify-center" disabled={submitting}>
          {submitting ? "Saving…" : "Submit Receipt"}
        </button>
        {error && <p className="text-sm text-err-tx mt-2">{error}</p>}
      </div>
    </form>
  );
}

function WastageDisplay({
  wastage,
  stageId,
  onChange,
}: {
  wastage: WastageRecord;
  stageId: string;
  onChange: () => void;
}) {
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revising, setRevising] = useState(false);
  const canRevise = user?.role === "SUPER_ADMIN";
  const isPending = wastage.exceptionStatus === "PENDING";
  const isDecided = wastage.exceptionStatus === "APPROVED" || wastage.exceptionStatus === "REJECTED";
  const showForm = isPending || revising;

  async function decide(approve: boolean) {
    setSubmitting(true);
    try {
      await apiFetch(`/api/materials/wastage/${stageId}/decide`, {
        method: "POST",
        body: { approve, reason: reason || "No reason provided" },
      });
      setRevising(false);
      onChange();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`rounded-md p-3 mb-3 ${wastage.withinTolerance ? "bg-ok-bg" : "bg-err-bg"}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">
          Wastage {formatPct(wastage.wastagePct)} ({wastage.withinTolerance ? "within tolerance" : "exceeds tolerance"})
        </span>
        <div className="flex items-center gap-2">
          <span className="console-pill neu">{wastage.exceptionStatus}</span>
          {canRevise && isDecided && !revising && (
            <button className="text-xs text-accent hover:underline" onClick={() => setRevising(true)}>
              Edit Decision
            </button>
          )}
        </div>
      </div>
      {showForm && (
        <div className="mt-3 space-y-2">
          {revising && wastage.exceptionReason && (
            <p className="text-xs text-mute">Current reason on file: {wastage.exceptionReason}</p>
          )}
          <textarea
            className="console-field"
            placeholder="Reason for excess wastage (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="console-btn primary flex-1" disabled={submitting || !reason} onClick={() => decide(true)}>
              Approve Exception
            </button>
            <button className="console-btn flex-1" disabled={submitting || !reason} onClick={() => decide(false)}>
              Reject
            </button>
            {revising && (
              <button type="button" className="console-btn" onClick={() => setRevising(false)}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LabourSection({ stage, onChange }: { stage: JobStage; onChange: () => void }) {
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("");
  const [rateBasis, setRateBasis] = useState("PER_GRAM");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/labour/entries", {
        method: "POST",
        body: {
          jobStageId: stage.id,
          karigarId: stage.karigarId,
          rateBasis,
          quantity: Number(quantity),
          rate: rate ? Number(rate) : undefined,
        },
      });
      setQuantity("");
      setRate("");
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function approve(id: string) {
    await apiFetch(`/api/labour/entries/${id}/approve`, { method: "POST" });
    onChange();
  }

  return (
    <div className="border-t border-line pt-3 mt-3">
      <h4 className="text-[11px] font-bold uppercase text-ink2 tracking-wide mb-2">Labour</h4>
      {stage.labourEntries.map((l) => (
        <div key={l.id} className="flex items-center justify-between text-sm py-1">
          <span className="text-ink2">
            {l.rateBasis.replace(/_/g, " ")} · {l.quantity} × {formatINR(Number(l.rate))} ={" "}
            <span className="mono font-medium text-ink">{formatINR(Number(l.amount))}</span>
          </span>
          {l.status === "PENDING" ? (
            <button className="text-accent text-xs hover:underline" onClick={() => approve(l.id)}>
              Approve
            </button>
          ) : (
            <span className="console-pill ok text-xs">Approved</span>
          )}
        </div>
      ))}
      {stage.karigarId && (
        <form onSubmit={addEntry} className="flex items-end gap-2 mt-2">
          <select className="console-field w-auto" value={rateBasis} onChange={(e) => setRateBasis(e.target.value)}>
            <option value="PER_GRAM">Per Gram</option>
            <option value="PER_PIECE">Per Piece</option>
            <option value="PER_CARAT">Per Carat</option>
            <option value="DAILY_WAGE">Daily Wage</option>
          </select>
          <input
            required
            type="number"
            step="0.001"
            placeholder="Qty"
            className="console-field w-24"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Rate (optional)"
            className="console-field w-32"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
          <button className="console-btn" disabled={submitting}>
            Add
          </button>
        </form>
      )}
      {error && <p className="text-sm text-err-tx mt-1">{error}</p>}
    </div>
  );
}
