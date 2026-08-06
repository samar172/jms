"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useApi, useKarigars } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { JobStageStatusPill } from "@/components/StatusPill";
import { formatINR, formatWeight, formatPct } from "@/lib/format";
import { computeWastage, fineWeight } from "@jms/shared";
import { hi } from "@/lib/hi";
import { AddKarigarForm } from "@/components/AddKarigarForm";
import { useAuth } from "@/lib/auth-context";

interface WastageRecord {
  id: string;
  netWastageG: string;
  wastagePct: string;
  tolerancePct: string;
  withinTolerance: boolean;
  exceptionStatus: "NONE" | "PENDING" | "APPROVED" | "REJECTED";
  exceptionReason?: string | null;
}
interface LabourEntry {
  id: string;
  quantity: string;
  rate: string;
  amount: string;
  status: string;
  rateBasis: string;
}
interface MaterialIssue {
  id: string;
  materialType: string;
  fineWeightG: string;
  grossWeightG: string | null;
}
interface Stage {
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
interface JobCardDetail {
  id: string;
  status: string;
  productId: string;
  product: { serialNo: string; designName: string; purity: { code: string; purityFactor: string } };
  stages: Stage[];
}

export default function JobCardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: jobCard, mutate } = useApi<JobCardDetail>(`/api/job-cards/${id}`);
  const { data: karigars, mutate: mutateKarigars } = useKarigars();
  const [busyStage, setBusyStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!jobCard) return <div className="text-text-muted">Loading…</div>;

  async function closeJobCard() {
    setError(null);
    try {
      await apiFetch(`/api/job-cards/${id}/close`, { method: "POST" });
      await mutate();
    } catch (err) {
      if (err instanceof ApiError) {
        const blockers = (err.details as { blockers?: string[] } | undefined)?.blockers;
        setError(blockers ? `${err.message}: ${blockers.join(", ")}` : err.message);
      }
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/products/${jobCard.product.serialNo}`} className="font-mono text-gold font-semibold">
            {jobCard.product.serialNo}
          </Link>
          <h1 className="text-xl font-semibold">{jobCard.product.designName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="pill pill-neutral">{jobCard.status}</span>
          {jobCard.status !== "CLOSED" && (
            <button className="btn btn-primary" onClick={closeJobCard}>
              Close Job Card
            </button>
          )}
        </div>
      </div>
      {error && <div className="card p-3 border-danger text-danger text-sm">{error}</div>}

      <div className="space-y-4">
        {jobCard.stages
          .slice()
          .sort((a, b) => a.processStage.sequenceOrder - b.processStage.sequenceOrder)
          .map((stage) => (
            <StageCard
              key={stage.id}
              stage={stage}
              purityFactor={Number(jobCard.product.purity.purityFactor)}
              karigars={karigars ?? []}
              onKarigarCreated={() => mutateKarigars()}
              busy={busyStage === stage.id}
              setBusy={(v) => setBusyStage(v ? stage.id : null)}
              onChange={() => mutate()}
            />
          ))}
      </div>
    </div>
  );
}

function StageCard({
  stage,
  purityFactor,
  karigars,
  onKarigarCreated,
  busy,
  setBusy,
  onChange,
}: {
  stage: Stage;
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
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">{stage.processStage.name}</h3>
          <JobStageStatusPill status={stage.status} />
        </div>
        {stage.status !== "APPROVED" && (
          <button className="btn btn-outline" disabled={busy} onClick={approveStage}>
            Approve Stage
          </button>
        )}
      </div>

      {error && <p className="text-sm text-danger mb-2">{error}</p>}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <select className="input w-auto" value={karigarId} onChange={(e) => setKarigarId(e.target.value)}>
          <option value="">Unassigned</option>
          {karigars.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
        <button className="btn btn-outline" disabled={busy || !karigarId} onClick={assignKarigar}>
          Assign
        </button>
        <button type="button" className="text-xs text-gold hover:underline" onClick={() => setShowAddKarigar((v) => !v)}>
          {showAddKarigar ? "Cancel" : "+ New Karigar"}
        </button>
      </div>
      {showAddKarigar && (
        <div className="bg-bg p-3 rounded-lg mb-3">
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

      {stage.materialIssues.length === 0 ? (
        <button className="btn btn-outline mb-3" onClick={() => setShowIssueForm((s) => !s)} disabled={!stage.karigarId}>
          Issue Material
        </button>
      ) : (
        <div className="text-sm text-text-muted mb-3">
          Issued: {stage.materialIssues.map((mi) => formatWeight(mi.fineWeightG)).join(", ")} fine gold
        </div>
      )}
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
        <button className="btn btn-outline btn-lg mb-3 w-full sm:w-auto" onClick={() => setShowReceiptForm((s) => !s)}>
          Receive &amp; Reconcile <span className="opacity-70 ml-1">· {hi.receipt.title}</span>
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

function IssueForm({ stageId, karigarId, onDone }: { stageId: string; karigarId: string; onDone: () => void }) {
  const { data: karats } = useApi<{ id: string; code: string }[]>("/api/masters/karats");
  const [purityId, setPurityId] = useState("");
  const [grossWeightG, setGrossWeightG] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          materialType: "GOLD",
          purityId,
          grossWeightG: Number(grossWeightG),
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
    <form onSubmit={submit} className="flex items-end gap-2 mb-3 bg-bg p-3 rounded-lg">
      <div>
        <label className="label">Purity</label>
        <select required className="input" value={purityId} onChange={(e) => setPurityId(e.target.value)}>
          <option value="">Select…</option>
          {karats?.map((k) => (
            <option key={k.id} value={k.id}>
              {k.code}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Gross Weight (g)</label>
        <input
          required
          type="number"
          step="0.001"
          className="input"
          value={grossWeightG}
          onChange={(e) => setGrossWeightG(e.target.value)}
        />
      </div>
      <button className="btn btn-primary" disabled={submitting}>
        {submitting ? "Issuing…" : "Issue"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
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
  const [dustWeightG, setDustWeightG] = useState("0");
  const [unusedReturnedWeightG, setUnusedReturnedWeightG] = useState("0");
  const [dustLotId, setDustLotId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = computeWastage({
    fineIssuedG,
    finePieceG: fineWeight(Number(finishedPieceWeightG) || 0, purityFactor),
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
    <form onSubmit={submit} className="bg-bg p-4 rounded-lg mb-3 grid sm:grid-cols-2 gap-4">
      <div className="space-y-4">
        <div className="rounded-lg border border-border p-3 space-y-1">
          <div className="text-sm text-text-muted">
            Gross Weight Issued <span className="text-xs">(karigar ko diya gaya kul vazan — weigh returns against this)</span>:{" "}
            <span className="font-medium text-text tabular">{formatWeight(grossIssuedG)}</span>
          </div>
          <div className="text-xs text-text-muted">
            Fine Gold Issued <span className="text-xs">({hi.receipt.fineGoldIssued})</span>:{" "}
            <span className="tabular">{formatWeight(fineIssuedG)}</span>
          </div>
          <p className="text-xs text-text-muted pt-1">
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
            <select className="input mt-2" value={dustLotId} onChange={(e) => setDustLotId(e.target.value)}>
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
        <div className="text-xs text-text-muted tabular">
          Returned so far: {formatWeight(totalReturnedRawG)} of {formatWeight(grossIssuedG)} gross issued
        </div>
      </div>
      <div className={`rounded-lg p-4 flex flex-col justify-center items-center ${withinTolerance ? "bg-success-tint" : "bg-danger-tint"}`}>
        <div className="text-sm text-text-muted mb-1 text-center">
          Net Wastage <span className="block">{hi.receipt.netWastage}</span>
        </div>
        <div className={`text-4xl font-bold tabular ${withinTolerance ? "text-success" : "text-danger"}`}>
          {formatPct(preview.wastagePct)}
        </div>
        <div className="text-sm text-text-muted mt-1">{formatWeight(preview.netWastageG)} · Tolerance {formatPct(tolerancePct)}</div>
        {!withinTolerance && (
          <p className="text-sm text-danger mt-2 text-center font-medium">
            Exceeds tolerance — Manager approval required.
            <span className="block font-normal">{hi.receipt.exceedsTolerance}</span>
          </p>
        )}
        <button className="btn btn-primary btn-lg mt-3 w-full" disabled={submitting}>
          {submitting ? "Saving…" : `Submit Receipt · ${hi.receipt.submit}`}
        </button>
        {error && <p className="text-sm text-danger mt-2">{error}</p>}
      </div>
    </form>
  );
}

function WastageDisplay({ wastage, stageId, onChange }: { wastage: WastageRecord; stageId: string; onChange: () => void }) {
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
    <div className={`rounded-lg p-3 mb-3 ${wastage.withinTolerance ? "bg-success-tint" : "bg-danger-tint"}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          Wastage {formatPct(wastage.wastagePct)} ({wastage.withinTolerance ? "within tolerance" : "exceeds tolerance"})
        </span>
        <div className="flex items-center gap-2">
          <span className="pill pill-neutral">{wastage.exceptionStatus}</span>
          {canRevise && isDecided && !revising && (
            <button className="text-xs text-gold hover:underline" onClick={() => setRevising(true)}>
              Edit Decision
            </button>
          )}
        </div>
      </div>
      {showForm && (
        <div className="mt-3 space-y-2">
          {revising && wastage.exceptionReason && (
            <p className="text-xs text-text-muted">Current reason on file: {wastage.exceptionReason}</p>
          )}
          <textarea
            className="input-lg"
            placeholder={`Reason for excess wastage (required) · ${hi.receipt.reasonRequired}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="btn btn-primary btn-lg flex-1" disabled={submitting || !reason} onClick={() => decide(true)}>
              Approve Exception · {hi.receipt.approve}
            </button>
            <button className="btn btn-outline btn-lg flex-1" disabled={submitting || !reason} onClick={() => decide(false)}>
              Reject · {hi.receipt.reject}
            </button>
            {revising && (
              <button type="button" className="btn btn-ghost btn-lg" onClick={() => setRevising(false)}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LabourSection({ stage, onChange }: { stage: Stage; onChange: () => void }) {
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
    <div className="border-t border-border pt-3 mt-3">
      <h4 className="text-sm font-medium mb-2">Labour</h4>
      {stage.labourEntries.map((l) => (
        <div key={l.id} className="flex items-center justify-between text-sm py-1">
          <span>
            {l.rateBasis.replace(/_/g, " ")} · {l.quantity} × {formatINR(Number(l.rate))} ={" "}
            <span className="tabular font-medium">{formatINR(Number(l.amount))}</span>
          </span>
          {l.status === "PENDING" ? (
            <button className="btn btn-ghost text-xs" onClick={() => approve(l.id)}>
              Approve
            </button>
          ) : (
            <span className="pill pill-success text-xs">Approved</span>
          )}
        </div>
      ))}
      {stage.karigarId && (
        <form onSubmit={addEntry} className="flex items-end gap-2 mt-2">
          <select className="input w-auto" value={rateBasis} onChange={(e) => setRateBasis(e.target.value)}>
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
            className="input w-24"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Rate (optional)"
            className="input w-32"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
          <button className="btn btn-outline" disabled={submitting}>
            Add
          </button>
        </form>
      )}
      {error && <p className="text-sm text-danger mt-1">{error}</p>}
    </div>
  );
}
