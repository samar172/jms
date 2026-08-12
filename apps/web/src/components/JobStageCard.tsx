"use client";

import { useState } from "react";
import { useApi, useStoneTypes } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { JobStageStatusPill } from "@/components/StatusPill";
import { formatINR, formatWeight, formatPct, formatCarat } from "@/lib/format";
import { computeWastage, fineWeight, round3 } from "@jms/shared";
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
          issuedStoneCarats={stage.materialIssues
            .filter((i) => i.materialType === "POLKI" || i.materialType === "COLOURED_STONE")
            .reduce((s, i) => s + Number(i.caratWeight ?? 0), 0)}
          isSettingStage={/setting/i.test(stage.processStage.name)}
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
  issuedStoneCarats,
  isSettingStage,
  purityFactor,
  tolerancePct,
  onDone,
}: {
  stageId: string;
  karigarId: string;
  fineIssuedG: number;
  grossIssuedG: number;
  issuedStoneCarats: number;
  isSettingStage: boolean;
  purityFactor: number;
  tolerancePct: number;
  onDone: () => void;
}) {
  const { data: dustLots } = useApi<DustLot[]>("/api/materials/dust-lots");
  const openDustLots = dustLots?.filter((l) => l.status === "OPEN") ?? [];
  const [finishedPieceWeightG, setFinishedPieceWeightG] = useState("");
  const [nonGoldInPieceWeightG, setNonGoldInPieceWeightG] = useState("0");
  const [waxWireWeightG, setWaxWireWeightG] = useState("0");
  const [otherNonGoldWeightG, setOtherNonGoldWeightG] = useState("0");
  const [fillerNote, setFillerNote] = useState("");
  const [pieceWeightIsFine, setPieceWeightIsFine] = useState(true);
  
  const [dustWeightG, setDustWeightG] = useState("0");
  const [unusedReturnedWeightG, setUnusedReturnedWeightG] = useState("0");
  const [goldScrapWeightG, setGoldScrapWeightG] = useState("0");
  const [approvedLossWeightG, setApprovedLossWeightG] = useState("0");
  const [stoneReturnedWeightG, setStoneReturnedWeightG] = useState("0");
  const [stoneReturnedNote, setStoneReturnedNote] = useState("");
  
  const [dustLotId, setDustLotId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forceOverAccounted, setForceOverAccounted] = useState(false);

  // Net gold in finished piece
  const netPieceG = Math.max(
    (Number(finishedPieceWeightG) || 0) -
      (Number(nonGoldInPieceWeightG) || 0) -
      (Number(waxWireWeightG) || 0) -
      (Number(otherNonGoldWeightG) || 0),
    0
  );

  const finePieceG = pieceWeightIsFine ? netPieceG : fineWeight(netPieceG, purityFactor);
  const fineReturnedG = fineWeight(
    (Number(unusedReturnedWeightG) || 0) + (Number(goldScrapWeightG) || 0) + (Number(approvedLossWeightG) || 0),
    purityFactor
  );
  
  const preview = computeWastage({
    fineIssuedG,
    finePieceG,
    fineDustG: fineWeight(Number(dustWeightG) || 0, purityFactor),
    fineReturnedG,
  });
  
  const withinTolerance = preview.wastagePct <= tolerancePct;
  const suggestedStoneWeightG = isSettingStage && issuedStoneCarats > 0 ? round3(issuedStoneCarats / 5) : null;
  const totalReturnedRawG =
    (Number(finishedPieceWeightG) || 0) +
    (Number(dustWeightG) || 0) +
    (Number(unusedReturnedWeightG) || 0) +
    (Number(goldScrapWeightG) || 0) +
    (Number(approvedLossWeightG) || 0) +
    (Number(stoneReturnedWeightG) || 0);

  const accountedGold =
    netPieceG +
    (Number(dustWeightG) || 0) +
    (Number(unusedReturnedWeightG) || 0) +
    (Number(goldScrapWeightG) || 0) +
    (Number(approvedLossWeightG) || 0);

  const overAccounted = grossIssuedG > 0 && accountedGold > grossIssuedG + 0.001;

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
          nonGoldInPieceWeightG: Number(nonGoldInPieceWeightG) || 0,
          waxWireWeightG: Number(waxWireWeightG) || 0,
          otherNonGoldWeightG: Number(otherNonGoldWeightG) || 0,
          fillerNote: fillerNote || undefined,
          pieceWeightIsFine,
          dustWeightG: Number(dustWeightG) || 0,
          unusedReturnedWeightG: Number(unusedReturnedWeightG) || 0,
          goldScrapWeightG: Number(goldScrapWeightG) || 0,
          approvedLossWeightG: Number(approvedLossWeightG) || 0,
          stoneReturnedWeightG: Number(stoneReturnedWeightG) || 0,
          stoneReturnedNote: stoneReturnedNote || undefined,
          dustLotId: Number(dustWeightG) > 0 && dustLotId ? dustLotId : undefined,
          forceOverAccounted,
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
    <form onSubmit={submit} className="bg-neu-bg p-4 rounded-md mb-3">
      <div className="rounded-md border border-line p-3 space-y-1 bg-panel mb-4">
        <div className="text-sm text-ink2">
          Gross Weight Issued <span className="text-xs">(weigh returns against this)</span>:{" "}
          <span className="font-medium text-ink mono">{formatWeight(grossIssuedG)}</span>
        </div>
        <div className="text-xs text-ink2">
          Fine Gold Issued: <span className="mono">{formatWeight(fineIssuedG)}</span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Left Column: Piece details */}
        <div className="space-y-4">
          <h4 className="font-semibold text-sm border-b pb-1">Finished Piece</h4>
          <div>
            <label className="label-lg">Total Finished Piece Weight (g)</label>
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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label-lg">Stone/Inlay in piece (g)</label>
              {suggestedStoneWeightG !== null && (
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline block mb-1 text-left"
                  onClick={() => setNonGoldInPieceWeightG(String(suggestedStoneWeightG))}
                >
                  Use suggestion: {suggestedStoneWeightG}g
                </button>
              )}
              <input
                type="number"
                inputMode="decimal"
                step="0.001"
                className="input-lg tabular"
                value={nonGoldInPieceWeightG}
                onChange={(e) => setNonGoldInPieceWeightG(e.target.value)}
              />
            </div>
            <div>
              <label className="label-lg">Wax/Wire/Solder (g)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.001"
                className="input-lg tabular"
                value={waxWireWeightG}
                onChange={(e) => setWaxWireWeightG(e.target.value)}
              />
            </div>
            <div>
              <label className="label-lg">Other Non-Gold (g)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.001"
                className="input-lg tabular"
                value={otherNonGoldWeightG}
                onChange={(e) => setOtherNonGoldWeightG(e.target.value)}
              />
            </div>
            <div>
              <label className="label-lg">Filler Note</label>
              <input
                className="input-lg"
                placeholder="e.g. enamel"
                value={fillerNote}
                onChange={(e) => setFillerNote(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 mt-2 text-sm">
            <input type="checkbox" checked={pieceWeightIsFine} onChange={(e) => setPieceWeightIsFine(e.target.checked)} />
            Net weight is Fine Gold (don't reduce by karat)
          </label>
        </div>

        {/* Right Column: Returns */}
        <div className="space-y-4">
          <h4 className="font-semibold text-sm border-b pb-1">Returns & Dust</h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label-lg">Gold Dust (g)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.001"
                className="input-lg tabular"
                value={dustWeightG}
                onChange={(e) => setDustWeightG(e.target.value)}
              />
            </div>
            <div>
              <label className="label-lg">Unused Gold (g)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.001"
                className="input-lg tabular"
                value={unusedReturnedWeightG}
                onChange={(e) => setUnusedReturnedWeightG(e.target.value)}
              />
            </div>
            <div>
              <label className="label-lg">Gold Scrap/Sprue (g)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.001"
                className="input-lg tabular"
                value={goldScrapWeightG}
                onChange={(e) => setGoldScrapWeightG(e.target.value)}
              />
            </div>
            <div>
              <label className="label-lg">Pre-approved Loss (g)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.001"
                className="input-lg tabular"
                value={approvedLossWeightG}
                onChange={(e) => setApprovedLossWeightG(e.target.value)}
              />
            </div>
            <div>
              <label className="label-lg">Stones Returned (g)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.001"
                className="input-lg tabular"
                value={stoneReturnedWeightG}
                onChange={(e) => setStoneReturnedWeightG(e.target.value)}
              />
            </div>
            <div>
              <label className="label-lg">Stone Note</label>
              <input
                className="input-lg"
                placeholder="e.g. 2 pcs broken"
                value={stoneReturnedNote}
                onChange={(e) => setStoneReturnedNote(e.target.value)}
              />
            </div>
          </div>
          {Number(dustWeightG) > 0 && (
            <div>
              <label className="label-lg">Assign Dust to Lot</label>
              <select className="console-field mt-1" value={dustLotId} onChange={(e) => setDustLotId(e.target.value)}>
                <option value="">Don&apos;t add to a dust lot</option>
                {openDustLots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    Add to {lot.lotNo}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="text-xs text-mute tabular mt-2">
            Returned so far: {formatWeight(totalReturnedRawG)} of {formatWeight(grossIssuedG)} gross issued
          </div>
        </div>
      </div>

      <div className={`mt-6 rounded-md p-4 flex flex-col justify-center items-center ${withinTolerance ? "bg-ok-bg" : "bg-err-bg"}`}>
        <div className="text-sm text-ink2 mb-1 text-center">Net Wastage</div>
        <div className={`text-4xl font-bold tabular ${withinTolerance ? "text-ok-tx" : "text-err-tx"}`}>
          {formatPct(preview.wastagePct)}
        </div>
        <div className="text-sm text-ink2 mt-1">{formatWeight(preview.netWastageG)} · Tolerance {formatPct(tolerancePct)}</div>
        {!withinTolerance && (
          <p className="text-sm text-err-tx mt-2 text-center font-medium">
            Exceeds tolerance — Manager approval required.
          </p>
        )}
        
        {overAccounted && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded text-sm mt-3 mb-2 w-full text-left">
            <strong>Warning:</strong> Total accounted gold ({formatWeight(accountedGold)}) exceeds issued gold ({formatWeight(grossIssuedG)}). Please check your entries.
            <label className="flex items-center gap-2 mt-2 font-medium cursor-pointer">
              <input type="checkbox" checked={forceOverAccounted} onChange={(e) => setForceOverAccounted(e.target.checked)} />
              Force submit over-reconciliation
            </label>
          </div>
        )}

        <button className="console-btn primary mt-3 w-full max-w-sm justify-center" disabled={submitting || (overAccounted && !forceOverAccounted)}>
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
