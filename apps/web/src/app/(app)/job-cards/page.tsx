"use client";

import Link from "next/link";
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
    <div>
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">Manufacturing</div>
        <h1 className="text-[19px] font-semibold flex items-center gap-2.5 text-ink">
          Production Control Center
          <span className="text-xs text-mute font-medium">{jobCards ? `${jobCards.length} active jobs` : ""}</span>
        </h1>
      </div>

      <div className="flex items-center gap-2 py-2.5 border-t border-b border-line -mx-3.5 px-3.5 sm:-mx-[18px] sm:px-[18px] mb-3.5">
        <span className="text-xs text-mute">
          Production starts from an estimate —{" "}
          <Link href="/costing" className="text-accent hover:underline">
            open one in Estimates
          </Link>{" "}
          and use the Production panel there to create its job card.
        </span>
      </div>

      <div className="console-kanban">
        {columns.map(({ stage, cards }) => (
          <div key={stage.id} className="console-kcol">
            <div className="kh">
              <span>{stage.name}</span>
              <span>{cards.length}</span>
            </div>
            <div className="kb">
              {cards.map((jc) => {
                const stageInfo = activeStageOf(jc)!;
                const overdue =
                  jc.targetDeliveryDate && new Date(jc.targetDeliveryDate).getTime() < Date.now();
                const hasException = stageInfo.wastageRecord?.exceptionStatus === "PENDING";
                return (
                  <Link key={jc.id} href={`/job-cards/${jc.id}`} className="console-kcard">
                    <div className="kid">{jc.product.serialNo}</div>
                    <div className="kname">{jc.product.designName}</div>
                    <div className="kmeta">{stageInfo.karigar?.name ?? "Unassigned"}</div>
                    <div className="kfoot">
                      <span className="kmeta">{daysOpen(jc.createdAt)}d open</span>
                      {overdue ? (
                        <span className="console-pill err">Overdue</span>
                      ) : hasException ? (
                        <span className="console-pill warn">Wastage</span>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
              {cards.length === 0 && (
                <div className="text-xs text-mute text-center py-6 border border-dashed border-line rounded-md">
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
