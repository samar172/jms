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
  product: { serialNo: string; designName: string; purity: { code: string; purityFactor: string } };
  stages: JobStage[];
}

export default function JobCardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: jobCard, mutate } = useApi<JobCardDetail>(`/api/job-cards/${id}`);
  const { data: karigars, mutate: mutateKarigars } = useKarigars();
  const [busyStage, setBusyStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        </div>
      </div>
      {error && <div className="console-panel p-3 border-err-bd text-err-tx text-sm mb-3.5">{error}</div>}

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
