"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useApi, useKarigars } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { JobStageCard, type JobStage } from "@/components/JobStageCard";
import { formatINR, formatDate } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { ActivityTimeline } from "@/components/ActivityTimeline";

interface JobCardDetail {
  id: string;
  status: string;
  createdAt: string;
  productId: string;
  dispatchedAt: string | null;
  targetDeliveryDate: string | null;
  dispatchMode: string | null;
  dispatchTracking: string | null;
  product: { serialNo: string; designName: string; purity: { code: string; purityFactor: string } };
  customer?: { name: string } | null;
  estimate?: { grossWeightG: string | null; id: string; estimateNo: string | null; netAmount: string } | null;
  stages: JobStage[];
}

export default function JobCardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: jobCard, mutate } = useApi<JobCardDetail>(`/api/job-cards/${id}`);
  const { data: karigars, mutate: mutateKarigars } = useKarigars();
  const [busyStage, setBusyStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDispatch, setShowDispatch] = useState(false);

  if (!jobCard) return <div className="text-slate-400 p-4 text-sm">Loading…</div>;

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

  // Find active stage index for stepper
  const activeStageIndex = jobCard.stages.findIndex((s) => s.status !== "APPROVED");
  const currentStep = activeStageIndex === -1 ? jobCard.stages.length - 1 : activeStageIndex;

  return (
    <div className="flex flex-col h-full bg-slate-50 min-h-screen">
      {showDispatch && (
        <DispatchModal 
          jobCardId={id} 
          onClose={() => setShowDispatch(false)} 
          onSuccess={() => { setShowDispatch(false); mutate(); }} 
        />
      )}
      <div className="bg-white border-b border-slate-200 px-6 py-4 mb-4">
        <div className="max-w-[1200px] mx-auto flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mb-1.5">
              <Link href="/job-cards" className="hover:text-blue-800">Job Cards</Link>
              <span className="text-slate-300">/</span>
              <span className="text-slate-900">{jobCard.id.split("-").pop()}</span>
            </div>
            <h1 className="text-[20px] font-semibold flex items-center gap-3 text-slate-900">
              <Link href={`/products/${jobCard.product.serialNo}`} className="mono text-blue-800 hover:underline">
                {jobCard.product.serialNo}
              </Link>
              {jobCard.product.designName}
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${jobCard.status === 'CLOSED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                {jobCard.status}
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="h-8 px-3 rounded border border-slate-200 bg-white text-slate-600 text-[12px] font-medium hover:bg-slate-50 flex items-center gap-1.5 shadow-sm">
              <span className="text-rose-500">⚑</span> Flag Issue
            </button>
            {jobCard.status !== "CLOSED" && (
              <button className="h-8 px-3 rounded border border-slate-200 bg-white text-slate-600 text-[12px] font-medium hover:bg-slate-50 shadow-sm" onClick={closeJobCard}>
                Close Job Card
              </button>
            )}
            {jobCard.status === "CLOSED" && !jobCard.dispatchedAt && (
              <button className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] font-medium hover:bg-blue-900 shadow-sm" onClick={() => setShowDispatch(true)}>
                Record Dispatch
              </button>
            )}
          </div>
        </div>
      </div>
      
      {error && <div className="max-w-[1200px] mx-auto w-full px-6 mb-4"><div className="bg-rose-50 border border-rose-200 p-3 text-rose-700 text-[12px] rounded-md">{error}</div></div>}

      <div className="max-w-[1200px] mx-auto w-full px-6 grid grid-cols-1 lg:grid-cols-3 gap-5 items-start pb-20">
        <div className="lg:col-span-2 space-y-4">
          
          <div className="bg-white border border-slate-200 rounded-md">
            <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-100 mb-3">Stage Progress</div>
            <div className="px-4 pb-4">
              <div className="flex items-center text-[11px] font-medium text-slate-500">
                {jobCard.stages.map((s, i, a) => {
                  const isDone = i < currentStep || (jobCard.status === "CLOSED" && i === currentStep);
                  const isCurrent = i === currentStep && jobCard.status !== "CLOSED";
                  return (
                    <div key={s.id} className="flex items-center flex-1">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] z-10 ${isDone ? 'bg-emerald-500' : (isCurrent ? 'bg-blue-600 ring-2 ring-blue-200' : 'bg-slate-200 text-slate-500')}`}>
                        {isDone ? '✓' : i + 1}
                      </div>
                      {i < a.length - 1 && <div className={`h-0.5 flex-1 -ml-1 -mr-1 ${isDone || (jobCard.status === "CLOSED") ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center text-[10px] text-slate-400 mt-2 font-medium">
                {jobCard.stages.map((s, i) => (
                  <div key={s.id} className={`flex-1 text-left -ml-2 ${i === currentStep && jobCard.status !== "CLOSED" ? 'text-blue-800' : (i < currentStep || jobCard.status === "CLOSED" ? 'text-emerald-700' : '')}`}>
                    <span className={i === 0 ? "ml-2" : ""}>{s.processStage.name.split(" ")[0]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-md">
            <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-100">Job Details</div>
            <div className="p-4 grid grid-cols-5 gap-4">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Customer</label>
                <div className="text-[12px] text-slate-900 font-medium">{jobCard.customer?.name ?? "—"}</div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Due Date</label>
                <div className="text-[12px] text-rose-600 font-medium">{jobCard.targetDeliveryDate ? formatDate(jobCard.targetDeliveryDate.toString()).split(',')[0] : "—"}</div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Gross Weight (Est.)</label>
                <div className="text-[12px] text-slate-900 font-medium mono">{jobCard.estimate?.grossWeightG ? `${Number(jobCard.estimate.grossWeightG).toFixed(3)} g` : "—"}</div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Dispatch Mode</label>
                <div className="text-[12px] text-slate-900 font-medium">{jobCard.dispatchMode ?? "—"}</div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Tracking</label>
                <div className="text-[12px] text-slate-900 font-medium">{jobCard.dispatchTracking ?? "—"}</div>
              </div>
            </div>
          </div>

          <MaterialAccountabilityPanel jobCard={jobCard} />

          <div className="space-y-4">
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

        <div className="lg:col-span-1 space-y-4 sticky top-6">
          <div className="bg-white border border-slate-200 rounded-md">
            <div className="px-4 py-3 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-100 flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-[10px]">E</span> Linked Estimate
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] text-slate-500">Estimate No.</span>
                <Link href={`/costing/${jobCard.estimate?.id}`} className="text-[12px] text-blue-700 font-medium hover:underline mono">{jobCard.estimate?.estimateNo ?? jobCard.estimate?.id?.split("-").pop() ?? "—"}</Link>
              </div>
              {jobCard.estimate && (
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] text-slate-500">Estimate Amount</span>
                  <span className="text-[12px] text-slate-900 font-semibold">{formatINR(Number(jobCard.estimate.netAmount))}</span>
                </div>
              )}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] text-slate-500">Client Approved</span>
                <span className="text-[12px] text-slate-900 font-medium">{jobCard.createdAt ? formatDate(jobCard.createdAt).split(',')[0] : "—"}</span>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 leading-relaxed">
                Costing parameters (rates, margins) are locked in this estimate. Production variances will directly impact the final realized margin.
              </div>
            </div>
          </div>

          <div className="bg-rose-50 border border-rose-200 rounded-md p-4">
            <div className="text-[11px] text-rose-800 font-semibold uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <span>Delivery Target</span>
            </div>
            <div className="text-[14px] font-bold text-rose-900 mt-1">{jobCard.targetDeliveryDate ? formatDate(jobCard.targetDeliveryDate.toString()).split(',')[0] : "Not Set"}</div>
            <div className="text-[11px] text-rose-700 mt-1">If production is delayed, notify the client via the WhatsApp integration before this date.</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-md">
            <div className="px-4 pt-3 pb-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-100">Estimated Wastage vs Actual Chizzat</div>
            <div className="p-4">
              <div className="flex justify-between items-center mb-2 text-[12px]">
                <span className="text-slate-500">Est. Wastage Charged</span>
                <span className="font-semibold text-slate-900 mono">{(jobCard.stages.reduce((acc, s) => acc + Number(s.processStage.wastageTolerancePct), 0) / (jobCard.stages.length || 1)).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between items-center text-[12px]">
                <span className="text-slate-500">Actual Chizzat (Net)</span>
                <span className="font-semibold text-rose-600 mono">
                  {jobCard.stages.reduce((sum, s) => sum + (s.wastageRecord ? Number(s.wastageRecord.netWastageG) : 0), 0).toFixed(3)} g
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-md">
            <ActivityTimeline sources={[{ entityType: "JobCard", entityId: id }]} defaultOpen={true} />
          </div>

        </div>
      </div>
    </div>
  );
}

function MaterialAccountabilityPanel({ jobCard }: { jobCard: JobCardDetail }) {
  const goldIssued = jobCard.stages.reduce((sum, s) => sum + s.materialIssues.filter(i => i.materialType === "GOLD").reduce((acc, i) => acc + Number(i.grossWeightG || 0), 0), 0);
  const returned = jobCard.stages.reduce((sum, s) => sum + s.materialReceipts.reduce((acc, r) => acc + Number(r.unusedReturnedWeightG) + Number(r.stoneReturnedWeightG), 0), 0);
  const consumed = jobCard.stages.reduce((sum, s) => sum + s.materialReceipts.reduce((acc, r) => acc + Number(r.finishedPieceWeightG) - Number(r.nonGoldInPieceWeightG) - Number(r.waxWireWeightG) - Number(r.otherNonGoldWeightG) - Number(r.fillerWeightG), 0), 0);
  const scrap = jobCard.stages.reduce((sum, s) => sum + s.materialReceipts.reduce((acc, r) => acc + Number(r.goldScrapWeightG), 0), 0);
  const dust = jobCard.stages.reduce((sum, s) => sum + s.materialReceipts.reduce((acc, r) => acc + Number(r.dustWeightG), 0), 0);
  const approvedLoss = jobCard.stages.reduce((sum, s) => sum + s.materialReceipts.reduce((acc, r) => acc + Number(r.approvedLossWeightG), 0), 0);
  const variance = jobCard.stages.reduce((sum, s) => sum + (s.wastageRecord ? Number(s.wastageRecord.netWastageG) : 0), 0);

  const stats = [
    { label: "Issued", val: goldIssued, c: "blue" },
    { label: "Returned", val: returned, c: "slate" },
    { label: "Actual Gold", val: consumed, c: "emerald" },
    { label: "Scrap", val: scrap, c: "slate" },
    { label: "Dust", val: dust, c: "slate" },
    { label: "Approved Loss", val: approvedLoss, c: "slate" },
    { label: "Chizzat Variance", val: variance, c: variance > 0 ? "rose" : "emerald" },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-md">
      <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-100 mb-3 flex items-center justify-between">
        Material Control Summary
      </div>
      <div className="px-4 pb-4">
        <div className="text-[10px] text-slate-400 mb-2">Poore job ke across-stage material accountability ka rollup — Issued / Returned / Consumed / Scrap / Dust / Approved Loss / Chizzat</div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {stats.map(({ label, val, c }) => (
            <div key={label} className={`bg-${c}-50 border border-${c}-200 rounded-md p-2 text-center`}>
              <div className={`text-[9.5px] text-${c}-700 uppercase tracking-wider`}>{label}</div>
              <div className={`text-[13px] font-semibold mono text-${c}-900 mt-0.5`}>{val.toFixed(3)} g</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Link href="/materials" className="h-7 px-2.5 rounded border border-slate-200 text-[11px] text-slate-700 hover:bg-slate-50 flex items-center gap-1">
            <span className="w-3 h-3 flex items-center justify-center">📦</span> View Ledger
          </Link>
        </div>
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
      setError(err instanceof ApiError ? err.message : "Failed");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="bg-white rounded-md shadow-xl w-full max-w-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-slate-900">Record Dispatch</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && <div className="text-[12px] text-rose-600 bg-rose-50 p-2 rounded">{error}</div>}
          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-1">Dispatch Mode</label>
            <select className="w-full h-8 px-2 border border-slate-200 rounded text-[12px]" value={dispatchMode} onChange={(e) => setDispatchMode(e.target.value)}>
              <option value="Insured Courier">Insured Courier</option>
              <option value="Hand Delivery">Hand Delivery</option>
              <option value="Self Pickup">Self Pickup</option>
              <option value="Registered Post">Registered Post</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-1">Tracking ID / AWB / Reference</label>
            <input type="text" className="w-full h-8 px-2 border border-slate-200 rounded text-[12px]" value={dispatchTracking} onChange={(e) => setDispatchTracking(e.target.value)} required />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-1">Dispatch Date</label>
            <input type="date" className="w-full h-8 px-2 border border-slate-200 rounded text-[12px]" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} required />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="h-8 px-3 rounded text-[12px] font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] font-medium hover:bg-blue-900 disabled:opacity-50">
              {saving ? "Saving…" : "Save Dispatch"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
