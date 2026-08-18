"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useApi, useKarigars } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { JobStageCard, type JobStage } from "@/components/JobStageCard";
import { formatDate } from "@/lib/format";
import { ActivityTimeline } from "@/components/ActivityTimeline";

interface JobCardDetail {
  id: string;
  jobNo: string | null;
  status: string;
  createdAt: string;
  productId: string;
  targetDeliveryDate: string | null;
  product: { serialNo: string; designName: string; purity: { code: string; purityFactor: string } };
  stages: JobStage[];
}

export default function JobCardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: jobCard, mutate } = useApi<JobCardDetail>(`/api/job-cards/${id}`);
  const { data: karigars, mutate: mutateKarigars } = useKarigars();
  const [busyStage, setBusyStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <div className="bg-white border-b border-slate-200 px-6 py-4 mb-4">
        <div className="max-w-[1200px] mx-auto flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mb-1.5">
              <Link href="/job-cards" className="hover:text-blue-800">Job Cards</Link>
              <span className="text-slate-300">/</span>
              <span className="text-slate-900">{jobCard.jobNo ?? jobCard.id}</span>
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
            <div className="p-4 grid grid-cols-4 gap-4">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Design</label>
                <div className="text-[12px] text-slate-900 font-medium mono">{jobCard.product.serialNo}</div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Purity</label>
                <div className="text-[12px] text-slate-900 font-medium">{jobCard.product.purity.code}</div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Due Date</label>
                <div className="text-[12px] text-rose-600 font-medium">{jobCard.targetDeliveryDate ? formatDate(jobCard.targetDeliveryDate.toString()).split(',')[0] : "—"}</div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Created</label>
                <div className="text-[12px] text-slate-900 font-medium">{formatDate(jobCard.createdAt).split(',')[0]}</div>
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
          <div className="bg-rose-50 border border-rose-200 rounded-md p-4">
            <div className="text-[11px] text-rose-800 font-semibold uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <span>Delivery Target</span>
            </div>
            <div className="text-[14px] font-bold text-rose-900 mt-1">{jobCard.targetDeliveryDate ? formatDate(jobCard.targetDeliveryDate.toString()).split(',')[0] : "Not Set"}</div>
            <div className="text-[11px] text-rose-700 mt-1">If production is delayed, notify the client via the WhatsApp integration before this date.</div>
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
  const silverIssued = jobCard.stages.reduce((sum, s) => sum + s.materialIssues.filter(i => i.materialType === "SILVER").reduce((acc, i) => acc + Number(i.grossWeightG || 0), 0), 0);
  const inPiece = jobCard.stages.reduce((sum, s) => sum + s.materialReceipts.reduce((acc, r) => acc + Number(r.finishedPieceWeightG), 0), 0);
  const dust = jobCard.stages.reduce((sum, s) => sum + s.materialReceipts.reduce((acc, r) => acc + Number(r.dustWeightG), 0), 0);
  const wastage = jobCard.stages.reduce((sum, s) => sum + (s.wastageRecord ? Number(s.wastageRecord.netWastageG) : 0), 0);

  const stats = [
    { label: "Issued", val: silverIssued, c: "blue" },
    { label: "In Piece", val: inPiece, c: "emerald" },
    { label: "Dust", val: dust, c: "slate" },
    { label: "Wastage", val: wastage, c: wastage > 0 ? "rose" : "emerald" },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-md">
      <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-100 mb-3 flex items-center justify-between">
        Material Control Summary
      </div>
      <div className="px-4 pb-4">
        <div className="text-[10px] text-slate-400 mb-2">Silver rollup across all stages — Issued / In Piece / Dust / Wastage</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {stats.map(({ label, val, c }) => (
            <div key={label} className={`bg-${c}-50 border border-${c}-200 rounded-md p-2 text-center`}>
              <div className={`text-[9.5px] text-${c}-700 uppercase tracking-wider`}>{label}</div>
              <div className={`text-[13px] font-semibold mono text-${c}-900 mt-0.5`}>{val.toFixed(3)} g</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Link href="/karigars" className="h-7 px-2.5 rounded border border-slate-200 text-[11px] text-slate-700 hover:bg-slate-50 flex items-center gap-1">
            <span className="w-3 h-3 flex items-center justify-center">📦</span> Karigar Ledger
          </Link>
        </div>
      </div>
    </div>
  );
}
