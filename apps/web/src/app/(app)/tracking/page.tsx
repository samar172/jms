"use client";

import Link from "next/link";
import { useApi, useProcessStages } from "@/lib/hooks";
import { formatDate } from "@/lib/format";
import { useState } from "react";
import { EstimateStatusPill } from "@/components/StatusPill";

interface JobStage {
  id: string;
  status: string;
  processStageId: string;
  processStage: { name: string; sequenceOrder: number };
  karigar?: { name: string } | null;
  assignedAt: string | null;
}
interface JobCardRow {
  id: string;
  jobNo: string | null;
  createdAt: string;
  targetDeliveryDate: string | null;
  product: { serialNo: string; designName: string };
  customer?: { name: string } | null;
  estimate?: { grossWeightG: string | null } | null;
  stages: JobStage[];
  status: string;
}

function activeStageOf(jc: JobCardRow): JobStage | undefined {
  return jc.stages.find((s) => s.status !== "APPROVED") ?? jc.stages[jc.stages.length - 1];
}

function getDaysInStage(assignedAt: string | null): number {
  if (!assignedAt) return 0;
  const diff = Date.now() - new Date(assignedAt).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export default function TrackingPage() {
  const { data: jobCards } = useApi<JobCardRow[]>("/api/job-cards");
  const { data: stages } = useProcessStages();

  const activeJobCards = (jobCards ?? []).filter(j => j.status !== "CLOSED");

  // Map jobs to columns
  const jobsByStageId = new Map<string, JobCardRow[]>();
  
  activeJobCards.forEach((j) => {
    const activeStage = activeStageOf(j);
    if (activeStage) {
      const stageId = activeStage.processStageId;
      if (!jobsByStageId.has(stageId)) {
        jobsByStageId.set(stageId, []);
      }
      jobsByStageId.get(stageId)!.push(j);
    }
  });

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3.5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mb-1.5">
            <span>Production</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-900">Tracking</span>
          </div>
          <h1 className="text-[19px] font-semibold flex items-center gap-2.5 text-slate-900">
            Production Tracking
          </h1>
          <p className="text-[12px] text-slate-500 mt-0.5">Live floor view · click a card to open job</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="flex gap-3 min-w-max pb-4 h-full">
          {(stages ?? []).map((stage) => {
            const stageJobs = jobsByStageId.get(stage.id) ?? [];
            return (
              <div key={stage.id} className="bg-slate-100 rounded-md border border-slate-200 flex flex-col w-[260px] shrink-0 h-full">
                <div className="h-9 px-3 flex items-center justify-between border-b border-slate-200 shrink-0">
                  <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider">{stage.name}</span>
                  <span className="text-[10px] text-slate-500 bg-white border border-slate-200 rounded px-1.5 font-medium">{stageJobs.length}</span>
                </div>
                <div className="p-2 space-y-2 flex-1 overflow-y-auto">
                  {stageJobs.map((j) => {
                    const activeStage = activeStageOf(j);
                    const overdue = j.targetDeliveryDate && new Date(j.targetDeliveryDate).getTime() < Date.now();
                    return (
                      <Link key={j.id} href={`/job-cards/${j.id}`} className="block">
                        <div className="bg-white border border-slate-200 rounded-md p-2.5 cursor-pointer hover:border-blue-300 transition-colors shadow-sm">
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-[12px] mono text-blue-800 font-semibold">{j.jobNo ?? j.id}</div>
                            {overdue && (
                              <span className="w-2 h-2 rounded-full bg-rose-500 block"></span>
                            )}
                          </div>
                          <div className="text-[13px] font-medium text-slate-900 truncate">{j.product.designName}</div>
                          <div className={`text-[12px] mt-1 ${!activeStage?.karigar ? 'text-slate-400 italic' : 'text-slate-600 truncate'}`}>
                            {activeStage?.karigar?.name ?? "Unassigned"}
                          </div>
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                            <span className="text-[11px] text-slate-500">{getDaysInStage(activeStage?.assignedAt ?? null)}d in stage</span>
                            <span className="text-[11px] mono text-slate-500 font-medium">{j.estimate?.grossWeightG ? `${Number(j.estimate.grossWeightG).toFixed(3)}g` : "—"}</span>
                          </div>
                          {overdue && (
                            <div className="text-[11px] text-rose-600 font-medium mt-1.5">⚠ Overdue vs due date</div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                  {stageJobs.length === 0 && (
                    <div className="text-[12px] text-slate-400 text-center py-6">No jobs</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
