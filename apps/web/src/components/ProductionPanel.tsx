"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi, useKarigars, useProcessStages } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { JobStageCard, type JobStage } from "@/components/JobStageCard";

export interface JobCardSummary {
  id: string;
  status: string;
}
export interface JobCardDetail {
  id: string;
  status: string;
  product: { purity: { purityFactor: string } };
  stages: JobStage[];
}

// Lets a manager create the job card and assign a karigar per process stage
// right from Final Costing (and, identically, from the Order it becomes) —
// the same design is often split across several karigars (one per stage), so
// a single "karigar" field on the estimate isn't enough; "Pull Labour" then
// picks up each stage's approved labour separately. Job cards are scoped to
// the Estimate, not the Product, so the same design can be in production for
// several customers at once without their karigars/labour crossing over.
export function ProductionPanel({
  productId,
  customerId,
  estimateId,
}: {
  productId: string;
  customerId: string | null;
  estimateId: string;
}) {
  const { data: jobCards, mutate } = useApi<JobCardSummary[]>(`/api/job-cards?estimateId=${estimateId}`);
  const { data: stages } = useProcessStages();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleStage(id: string) {
    setSelectedStages((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function createJobCard() {
    if (selectedStages.length === 0) {
      setError("Select at least one process stage");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const orderedStageIds = (stages ?? [])
        .filter((s) => selectedStages.includes(s.id))
        .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
        .map((s) => s.id);
      await apiFetch("/api/job-cards", {
        method: "POST",
        body: { productId, estimateId, customerId: customerId || undefined, processStageIds: orderedStageIds },
      });
      setShowCreate(false);
      setSelectedStages([]);
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create job card");
    } finally {
      setCreating(false);
    }
  }

  const activeCards = jobCards?.filter((jc) => jc.status !== "CLOSED") ?? [];

  return (
    <div className="console-panel p-3.5 mb-3.5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-[12.5px] font-semibold text-ink">Production — Job Card &amp; Karigar Assignment</h3>
        {jobCards && activeCards.length === 0 && !showCreate && (
          <button className="console-btn" onClick={() => setShowCreate(true)}>
            + Create Job Card
          </button>
        )}
      </div>

      {error && <p className="text-sm text-err-tx mb-2">{error}</p>}

      {jobCards && activeCards.length === 0 && showCreate && (
        <div className="bg-neu-bg p-3 rounded-md">
          <label className="console-field-label">Process Stages</label>
          <div className="space-y-1.5 mb-2">
            {stages
              ?.slice()
              .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
              .map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-[12.5px] text-ink">
                  <input type="checkbox" checked={selectedStages.includes(s.id)} onChange={() => toggleStage(s.id)} />
                  {s.name}
                </label>
              ))}
          </div>
          <div className="flex gap-2">
            <button className="console-btn primary" disabled={creating} onClick={createJobCard}>
              {creating ? "Creating…" : "Create Job Card"}
            </button>
            <button className="console-btn" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {activeCards.map((jc) => (
        <JobCardStages key={jc.id} jobCardId={jc.id} />
      ))}
    </div>
  );
}

// Fetches the same full detail the standalone job-cards/[id] page uses, so
// each stage can expand into the exact same JobStageCard — material issue,
// receive/reconcile, wastage exceptions, labour — right here, no page-hop.
// Compact table by default (matches the rest of the costing page's density)
// with a per-stage "Details" toggle that expands the same full JobStageCard
// used on the standalone job-cards/[id] page — issue/receive/wastage/labour,
// all reachable from here, but only for the one stage actually being worked
// on at a time, not all of them stretched open at once.
function JobCardStages({ jobCardId }: { jobCardId: string }) {
  const { data: jobCard, mutate } = useApi<JobCardDetail>(`/api/job-cards/${jobCardId}`);
  const { data: karigars, mutate: mutateKarigars } = useKarigars();
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [busyStage, setBusyStage] = useState<string | null>(null);
  const [stageKarigar, setStageKarigar] = useState<Record<string, string>>({});
  const [assigningStage, setAssigningStage] = useState<string | null>(null);

  if (!jobCard) return null;

  async function assignKarigar(stageId: string, currentKarigarId: string | null) {
    const karigarId = stageKarigar[stageId] ?? currentKarigarId;
    if (!karigarId) return;
    setAssigningStage(stageId);
    try {
      await apiFetch(`/api/job-cards/stages/${stageId}`, { method: "PATCH", body: { karigarId } });
      await mutate();
    } finally {
      setAssigningStage(null);
    }
  }

  const sortedStages = jobCard.stages.slice().sort((a, b) => a.processStage.sequenceOrder - b.processStage.sequenceOrder);
  const expanded = sortedStages.find((s) => s.id === expandedStage);

  return (
    <div className="mb-2 last:mb-0">
      <table className="console-etable">
        <thead>
          <tr>
            <th>Stage</th>
            <th>Status</th>
            <th>Karigar</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sortedStages.map((stage) => (
            <tr key={stage.id}>
              <td>{stage.processStage.name}</td>
              <td>
                <span className="console-pill neu">{stage.status}</span>
              </td>
              <td>
                <select
                  className="console-field w-auto"
                  value={stageKarigar[stage.id] ?? stage.karigarId ?? ""}
                  onChange={(e) => setStageKarigar((prev) => ({ ...prev, [stage.id]: e.target.value }))}
                >
                  <option value="">Unassigned</option>
                  {karigars?.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <button
                  className="console-btn"
                  disabled={
                    assigningStage === stage.id || !stageKarigar[stage.id] || stageKarigar[stage.id] === stage.karigarId
                  }
                  onClick={() => assignKarigar(stage.id, stage.karigarId)}
                >
                  {assigningStage === stage.id ? "Saving…" : "Assign"}
                </button>
              </td>
              <td>
                <button
                  className="text-[11px] text-accent hover:underline"
                  onClick={() => setExpandedStage(expandedStage === stage.id ? null : stage.id)}
                >
                  {expandedStage === stage.id ? "Hide" : "Issue Material"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {expanded && (
        <div className="mt-2">
          <JobStageCard
            stage={expanded}
            purityFactor={Number(jobCard.product.purity.purityFactor)}
            karigars={karigars ?? []}
            onKarigarCreated={() => mutateKarigars()}
            busy={busyStage === expanded.id}
            setBusy={(v) => setBusyStage(v ? expanded.id : null)}
            onChange={() => mutate()}
          />
        </div>
      )}

      <Link href={`/job-cards/${jobCard.id}`} className="text-[11px] text-accent hover:underline">
        Open full job card →
      </Link>
    </div>
  );
}
