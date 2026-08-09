"use client";

import Link from "next/link";
import { Plus, Clock, TriangleAlert } from "lucide-react";
import { useApi, useProcessStages } from "@/lib/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { PageBoardSkeleton } from "@/components/shared/page-skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

  if (!jobCards || !stages) {
    return <PageBoardSkeleton columns={5} />;
  }

  const columns = stages.map((stage) => ({
    stage,
    cards: jobCards.filter((jc) => activeStageOf(jc)?.processStageId === stage.id),
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Job Cards"
        description="Manufacturing workflow, grouped by process stage."
        actions={
          <Link href="/job-cards/new" className={cn(buttonVariants(), "gap-1.5")}>
            <Plus size={16} /> New Job Card
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-success" /> On track
        </span>
        <span className="flex items-center gap-1.5">
          <Clock size={12} className="text-destructive" /> Overdue
        </span>
        <span className="flex items-center gap-1.5">
          <TriangleAlert size={12} className="text-warning" /> Wastage exception pending
        </span>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map(({ stage, cards }) => (
          <div key={stage.id} className="w-72 shrink-0">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold">{stage.name}</h2>
              <Badge variant="secondary">{cards.length}</Badge>
            </div>
            <div className="space-y-3">
              {cards.map((jc) => {
                const stageInfo = activeStageOf(jc)!;
                const overdue =
                  jc.targetDeliveryDate && new Date(jc.targetDeliveryDate).getTime() < Date.now();
                const hasException = stageInfo.wastageRecord?.exceptionStatus === "PENDING";
                return (
                  <Link key={jc.id} href={`/job-cards/${jc.id}`}>
                    <Card
                      className={cn(
                        "gap-2 border-l-4 py-3 transition-shadow hover:shadow-md",
                        overdue ? "border-l-destructive" : hasException ? "border-l-warning" : "border-l-success"
                      )}
                    >
                      <div className="px-4">
                        <div className="font-mono text-sm font-semibold text-primary">{jc.product.serialNo}</div>
                        <div className="truncate text-xs text-foreground">{jc.product.designName}</div>
                        <div className="mt-2 text-xs text-muted-foreground">{stageInfo.karigar?.name ?? "Unassigned"}</div>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span
                            className={cn(
                              "flex items-center gap-1",
                              overdue ? "font-medium text-destructive" : "text-muted-foreground"
                            )}
                          >
                            <Clock size={12} /> {daysOpen(jc.createdAt)}d open
                          </span>
                          {hasException && (
                            <span className="flex items-center gap-1 font-medium text-warning">
                              <TriangleAlert size={12} /> Wastage
                            </span>
                          )}
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
              {cards.length === 0 && (
                <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
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
