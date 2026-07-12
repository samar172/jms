"use client";

import Link from "next/link";
import { Plus, Clock, TriangleAlert } from "lucide-react";
import { useApi, useProcessStages } from "@/lib/hooks";

interface JobStage {
  id: string;
  status: string;
  processStageId: string;
  processStage: { name: string; sequenceOrder: number };
  karigar?: { name: string } | null;
  wastageRecord?: { exceptionStatus: string } | null;
}
interface JobCardRow {
  id: string;
  createdAt: string;
  targetDeliveryDate: string | null;
  product: { serialNo: string; designName: string };
  stages: JobStage[];
}

function daysOpen(createdAt: string) {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
}

function activeStageOf(jc: JobCardRow): JobStage | undefined {
  return jc.stages.find((s) => s.status !== "APPROVED") ?? jc.stages[jc.stages.length - 1];
}

export default function JobCardsPage() {
  const { data: jobCards } = useApi<JobCardRow[]>("/api/job-cards");
  const { data: stages } = useProcessStages();

  const columns = (stages ?? []).map((stage) => ({
    stage,
    cards: (jobCards ?? []).filter((jc) => activeStageOf(jc)?.processStageId === stage.id),
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Job Cards</h1>
        <Link href="/job-cards/new" className="btn btn-primary">
          <Plus size={16} /> New Job Card
        </Link>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map(({ stage, cards }) => (
          <div key={stage.id} className="w-72 shrink-0">
            <div className="flex items-center justify-between px-1 mb-2">
              <h2 className="text-sm font-semibold">{stage.name}</h2>
              <span className="pill pill-neutral">{cards.length}</span>
            </div>
            <div className="space-y-3">
              {cards.map((jc) => {
                const stageInfo = activeStageOf(jc)!;
                const overdue =
                  jc.targetDeliveryDate && new Date(jc.targetDeliveryDate).getTime() < Date.now();
                const hasException = stageInfo.wastageRecord?.exceptionStatus === "PENDING";
                return (
                  <Link
                    key={jc.id}
                    href={`/job-cards/${jc.id}`}
                    className={`card p-3 block border-l-4 hover:shadow-md transition-shadow ${
                      overdue ? "border-l-danger" : hasException ? "border-l-warning" : "border-l-success"
                    }`}
                  >
                    <div className="font-mono text-gold font-semibold text-sm">{jc.product.serialNo}</div>
                    <div className="text-xs text-text truncate">{jc.product.designName}</div>
                    <div className="text-xs text-text-muted mt-2">{stageInfo.karigar?.name ?? "Unassigned"}</div>
                    <div className="flex items-center justify-between mt-2 text-xs">
                      <span className="flex items-center gap-1 text-text-muted">
                        <Clock size={12} /> {daysOpen(jc.createdAt)}d open
                      </span>
                      {hasException && (
                        <span className="flex items-center gap-1 text-warning font-medium">
                          <TriangleAlert size={12} /> Wastage
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
              {cards.length === 0 && (
                <div className="text-xs text-text-muted text-center py-6 border border-dashed border-border rounded-lg">
                  No jobs
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
