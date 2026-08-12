"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useApi, useKarigars } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { JobStageCard, type JobStage } from "@/components/JobStageCard";

interface JobCardDetail {
  id: string;
  status: string;
  productId: string;
  dispatchedAt: string | null;
  product: { serialNo: string; designName: string; purity: { code: string; purityFactor: string } };
  stages: JobStage[];
}

export default function JobCardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: jobCard, mutate } = useApi<JobCardDetail>(`/api/job-cards/${id}`);
  const { data: karigars, mutate: mutateKarigars } = useKarigars();
  const [busyStage, setBusyStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDispatch, setShowDispatch] = useState(false);

  if (!jobCard) return <div className="text-mute">Loading…</div>;

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
    <div>
      {showDispatch && (
        <DispatchModal 
          jobCardId={id} 
          onClose={() => setShowDispatch(false)} 
          onSuccess={() => { setShowDispatch(false); mutate(); }} 
        />
      )}
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">
          <Link href="/job-cards" className="hover:text-accent">
            Manufacturing
          </Link>
        </div>
        <div className="flex items-start justify-between flex-wrap gap-2">
          <h1 className="text-[19px] font-semibold flex items-center gap-2.5 flex-wrap text-ink">
            <Link href={`/products/${jobCard.product.serialNo}`} className="mono text-accent">
              {jobCard.product.serialNo}
            </Link>
            {jobCard.product.designName}
            <span className="console-pill neu">{jobCard.status}</span>
          </h1>
          {jobCard.status !== "CLOSED" && (
            <button className="console-btn primary" onClick={closeJobCard}>
              Close Job Card
            </button>
          )}
          {jobCard.status === "CLOSED" && !jobCard.dispatchedAt && (
            <button className="console-btn primary" onClick={() => setShowDispatch(true)}>
              Record Dispatch
            </button>
          )}
          {jobCard.status === "CLOSED" && jobCard.dispatchedAt && (
            <span className="text-sm font-medium text-emerald-600">Dispatched</span>
          )}
        </div>
      </div>
      {error && <div className="console-panel p-3 border-err-bd text-err-tx text-sm mb-3.5">{error}</div>}

      <MaterialAccountabilityPanel jobCard={jobCard} />

      <div className="space-y-3.5">
        {jobCard.stages
          .slice()
          .sort((a, b) => a.processStage.sequenceOrder - b.processStage.sequenceOrder)
          .map((stage) => (
            <JobStageCard
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

function MaterialAccountabilityPanel({ jobCard }: { jobCard: JobCardDetail }) {
  const goldIssued = jobCard.stages.reduce((sum, s) => sum + (s.wastageRecord ? Number(s.wastageRecord.grossWeightG) : 0), 0);
  const returned = jobCard.stages.reduce((sum, s) => sum + (s.wastageRecord ? Number(s.wastageRecord.stoneReturnedWeightG) : 0), 0);
  const consumed = jobCard.stages.reduce((sum, s) => sum + (s.wastageRecord ? Number(s.wastageRecord.pureGoldInPieceG) : 0), 0);
  const scrap = jobCard.stages.reduce((sum, s) => sum + (s.wastageRecord ? Number(s.wastageRecord.goldScrapWeightG) : 0), 0);
  const dust = jobCard.stages.reduce((sum, s) => sum + (s.wastageRecord ? Number(s.wastageRecord.goldDustWeightG) : 0), 0);
  const approvedLoss = jobCard.stages.reduce((sum, s) => sum + (s.wastageRecord ? Number(s.wastageRecord.approvedLossWeightG) : 0), 0);
  const variance = jobCard.stages.reduce((sum, s) => sum + (s.wastageRecord ? Number(s.wastageRecord.chizzatWeightG) : 0), 0);

  return (
    <div className="console-panel p-3 mb-3.5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[12.5px] font-semibold text-ink">Material Accountability Rollup</h3>
        <span className="text-[10px] text-mute">Across all stages</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        <RollupTile label="Issued (Gold)" val={goldIssued} />
        <RollupTile label="Returned" val={returned} />
        <RollupTile label="Actual Gold" val={consumed} />
        <RollupTile label="Scrap" val={scrap} />
        <RollupTile label="Dust" val={dust} />
        <RollupTile label="Approved Loss" val={approvedLoss} />
        <RollupTile label="Chizzat (Variance)" val={variance} highlight={variance > 0} />
      </div>
    </div>
  );
}

function RollupTile({ label, val, highlight }: { label: string; val: number; highlight?: boolean }) {
  return (
    <div className="bg-neu-bg border border-line rounded-md p-2 text-center">
      <div className="text-[9.5px] text-mute uppercase tracking-wider">{label}</div>
      <div className={`text-[13px] font-semibold mono mt-0.5 ${highlight ? 'text-err-tx' : 'text-ink'}`}>
        {val.toFixed(3)} g
      </div>
    </div>
  );
}

function DispatchModal({ jobCardId, onClose, onSuccess }: { jobCardId: string; onClose: () => void; onSuccess: () => void }) {
  const [dispatchMode, setDispatchMode] = useState("Insured Courier");
  const [dispatchTracking, setDispatchTracking] = useState("");
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/job-cards/${jobCardId}/record-dispatch`, {
        method: "POST",
        body: { dispatchMode, dispatchTracking, dispatchDate },
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record dispatch");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 backdrop-blur-sm p-4">
      <div className="bg-bg border border-line rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-full">
        <div className="px-4 py-3 border-b border-line flex items-center justify-between bg-neu-bg">
          <h2 className="text-sm font-semibold text-ink">Record Dispatch</h2>
          <button className="text-mute hover:text-ink" onClick={onClose}>✕</button>
        </div>
        <div className="p-4 overflow-y-auto">
          {error && <p className="text-sm text-err-tx mb-3">{error}</p>}
          <form id="dispatchForm" onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="console-field-label">Dispatch Mode</label>
              <select className="console-field" value={dispatchMode} onChange={e => setDispatchMode(e.target.value)} required>
                <option>Insured Courier</option>
                <option>Hand Delivery</option>
                <option>Self Pickup</option>
                <option>Registered Post</option>
              </select>
            </div>
            <div>
              <label className="console-field-label">Tracking / AWB (Optional)</label>
              <input type="text" className="console-field" value={dispatchTracking} onChange={e => setDispatchTracking(e.target.value)} placeholder="e.g. BDX-12345" />
            </div>
            <div>
              <label className="console-field-label">Date</label>
              <input type="date" className="console-field" value={dispatchDate} onChange={e => setDispatchDate(e.target.value)} required />
            </div>
          </form>
        </div>
        <div className="px-4 py-3 border-t border-line bg-neu-bg flex justify-end gap-2 shrink-0">
          <button className="console-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button form="dispatchForm" type="submit" className="console-btn primary" disabled={saving}>
            {saving ? "Saving…" : "Confirm Dispatch"}
          </button>
        </div>
      </div>
    </div>
  );
}
