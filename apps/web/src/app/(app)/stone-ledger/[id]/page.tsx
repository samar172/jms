"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useApi, useKarigars } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { formatCarat, formatDateTime, formatINR } from "@/lib/format";

interface OpenJobCard {
  id: string;
  product: { serialNo: string; designName: string };
  stages: { id: string; processStage: { name: string }; karigarId: string | null }[];
}

interface Movement {
  id: string;
  type: string;
  note: string | null;
  createdAt: string;
  karigar: { name: string } | null;
  createdBy: { name: string };
}
interface StoneDetail {
  id: string;
  stoneCode: string;
  caratWeight: string;
  shape: string | null;
  colour: string | null;
  clarity: string | null;
  certification: string | null;
  purchaseCost: string | null;
  status: string;
  stoneType: { name: string; category: string };
  vendor: { name: string } | null;
  currentKarigar: { id: string; name: string } | null;
  currentJobStage: { id: string; jobCard: { id: string; product: { serialNo: string; designName: string } } } | null;
  movements: Movement[];
}

export default function StoneDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: stone, mutate } = useApi<StoneDetail>(`/api/stones/${id}`);
  const { data: karigars } = useKarigars();
  const { data: jobCards } = useApi<OpenJobCard[]>("/api/job-cards");
  const [jobCardId, setJobCardId] = useState("");
  const [jobStageId, setJobStageId] = useState("");
  const [karigarId, setKarigarId] = useState("");

  const selectedJobCard = jobCards?.find((jc) => jc.id === jobCardId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!stone) return <div className="text-mute">Loading…</div>;

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/stones/${id}/issue`, { method: "POST", body: { jobStageId, karigarId } });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function returnStone(outcome: "RETURNED" | "SET") {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/stones/${id}/return`, { method: "POST", body: { outcome } });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">
          <Link href="/stone-ledger" className="hover:text-accent">Material</Link>
        </div>
        <h1 className="text-[19px] font-semibold flex items-center gap-2.5 text-ink">
          <span className="mono text-accent">{stone.stoneCode}</span>
          <span className="console-pill info">{stone.status.replace(/_/g, " ")}</span>
        </h1>
        <p className="text-xs text-ink2 mt-0.5">
          {stone.stoneType.name} · {formatCarat(stone.caratWeight)}
          {stone.shape ? ` · ${stone.shape}` : ""}
          {stone.colour ? ` · Colour ${stone.colour}` : ""}
          {stone.clarity ? ` · Clarity ${stone.clarity}` : ""}
        </p>
      </div>

      {error && <p className="text-sm text-err-tx mb-3">{error}</p>}

      <div className="grid lg:grid-cols-2 gap-3.5 mb-3.5">
        <div className="console-panel p-3.5">
          <div className="text-[11px] font-bold uppercase text-ink2 tracking-wide mb-2">Details</div>
          <dl className="grid grid-cols-2 gap-y-1.5 text-[12.5px]">
            <dt className="text-mute">Certification</dt>
            <dd className="text-ink">{stone.certification ?? "—"}</dd>
            <dt className="text-mute">Purchase Cost</dt>
            <dd className="text-ink mono">{stone.purchaseCost ? formatINR(Number(stone.purchaseCost)) : "—"}</dd>
            <dt className="text-mute">Vendor</dt>
            <dd className="text-ink">{stone.vendor?.name ?? "—"}</dd>
            <dt className="text-mute">Current Location</dt>
            <dd className="text-ink">
              {stone.currentKarigar?.name ??
                (stone.currentJobStage ? (
                  <Link href={`/job-cards/${stone.currentJobStage.jobCard.id}`} className="text-accent">
                    {stone.currentJobStage.jobCard.product.serialNo}
                  </Link>
                ) : (
                  "In store"
                ))}
            </dd>
          </dl>
        </div>

        <div className="console-panel p-3.5">
          <div className="text-[11px] font-bold uppercase text-ink2 tracking-wide mb-2">Actions</div>
          {stone.status === "IN_STOCK" && (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="console-field-label">Job Card</label>
                <select
                  className="console-field w-auto"
                  value={jobCardId}
                  onChange={(e) => {
                    setJobCardId(e.target.value);
                    setJobStageId("");
                  }}
                >
                  <option value="">Select…</option>
                  {jobCards?.map((jc) => (
                    <option key={jc.id} value={jc.id}>
                      {jc.product.serialNo} — {jc.product.designName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="console-field-label">Stage</label>
                <select className="console-field w-auto" value={jobStageId} onChange={(e) => setJobStageId(e.target.value)} disabled={!selectedJobCard}>
                  <option value="">Select…</option>
                  {selectedJobCard?.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.processStage.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="console-field-label">Karigar</label>
                <select className="console-field w-auto" value={karigarId} onChange={(e) => setKarigarId(e.target.value)}>
                  <option value="">Select…</option>
                  {karigars?.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </div>
              <button className="console-btn primary" disabled={busy || !jobStageId || !karigarId} onClick={issue}>
                Issue
              </button>
            </div>
          )}
          {stone.status === "ISSUED" && (
            <div className="flex gap-2">
              <button className="console-btn primary" disabled={busy} onClick={() => returnStone("RETURNED")}>
                Return to Stock
              </button>
              <button className="console-btn" disabled={busy} onClick={() => returnStone("SET")}>
                Mark as Set (used in piece)
              </button>
            </div>
          )}
          {(stone.status === "SET" || stone.status === "RETURNED" || stone.status === "SOLD") && (
            <p className="text-sm text-mute">No further movement possible from this state.</p>
          )}
        </div>
      </div>

      <div className="console-panel overflow-hidden">
        <div className="ph">Movement History</div>
        <div className="overflow-x-auto">
          <table className="console-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Karigar</th>
                <th>By</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {stone.movements.map((m) => (
                <tr key={m.id}>
                  <td className="text-ink2">{formatDateTime(m.createdAt)}</td>
                  <td>
                    <span className="console-pill neu">{m.type}</span>
                  </td>
                  <td className="text-ink2">{m.karigar?.name ?? "—"}</td>
                  <td className="text-ink2">{m.createdBy.name}</td>
                  <td className="text-ink2">{m.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
