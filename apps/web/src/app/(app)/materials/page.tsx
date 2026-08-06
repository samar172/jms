"use client";

import { Fragment, useState } from "react";
import { useApi, useVendors } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { formatWeight, formatDateTime } from "@/lib/format";

interface DustLot {
  id: string;
  lotNo: string;
  status: "OPEN" | "DESPATCHED" | "RECEIVED";
  totalDustWeightG: string;
  recoveredPureGoldG: string | null;
  recoveryPct: string | null;
  createdAt: string;
}

export default function MaterialsPage() {
  const { data: dustLots, mutate } = useApi<DustLot[]>("/api/materials/dust-lots");
  const [creating, setCreating] = useState(false);
  const [activeAction, setActiveAction] = useState<{ lotId: string; kind: "despatch" | "recover" } | null>(null);

  async function createLot() {
    setCreating(true);
    try {
      await apiFetch("/api/materials/dust-lots", { method: "POST" });
      await mutate();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Materials &amp; Stock</h1>
        <button className="btn btn-primary" onClick={createLot} disabled={creating}>
          + New Dust Lot
        </button>
      </div>

      <p className="text-sm text-text-muted max-w-2xl">
        Gold and stone are tracked per job via the Job Card workflow (issue → receive → wastage
        reconciliation). This page covers dust lot despatch and refining recovery (FR-5.06–5.08). A
        dedicated store-level purchase/stock-take ledger (FR-4.05–4.08) is on the near-term roadmap —
        see the README.
      </p>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted border-b border-border bg-bg">
              <th className="py-2 px-4 font-medium">Lot No.</th>
              <th className="py-2 px-4 font-medium">Status</th>
              <th className="py-2 px-4 font-medium text-right">Dust Weight</th>
              <th className="py-2 px-4 font-medium text-right">Recovered</th>
              <th className="py-2 px-4 font-medium text-right">Recovery %</th>
              <th className="py-2 px-4 font-medium">Created</th>
              <th className="py-2 px-4 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {dustLots?.map((lot) => (
              <Fragment key={lot.id}>
                <tr className="border-b border-border last:border-0">
                  <td className="py-2 px-4 font-mono">{lot.lotNo}</td>
                  <td className="py-2 px-4">{lot.status}</td>
                  <td className="py-2 px-4 text-right tabular">{formatWeight(lot.totalDustWeightG)}</td>
                  <td className="py-2 px-4 text-right tabular">{formatWeight(lot.recoveredPureGoldG)}</td>
                  <td className="py-2 px-4 text-right tabular">
                    {lot.recoveryPct ? `${Number(lot.recoveryPct).toFixed(2)}%` : "—"}
                  </td>
                  <td className="py-2 px-4 text-text-muted">{formatDateTime(lot.createdAt)}</td>
                  <td className="py-2 px-4 text-right">
                    {lot.status === "OPEN" && (
                      <button
                        className="text-gold hover:underline text-xs"
                        onClick={() => setActiveAction({ lotId: lot.id, kind: "despatch" })}
                      >
                        Despatch to Refiner
                      </button>
                    )}
                    {lot.status === "DESPATCHED" && (
                      <button
                        className="text-gold hover:underline text-xs"
                        onClick={() => setActiveAction({ lotId: lot.id, kind: "recover" })}
                      >
                        Record Recovery
                      </button>
                    )}
                  </td>
                </tr>
                {activeAction?.lotId === lot.id && (
                  <tr className="border-b border-border last:border-0 bg-bg/50">
                    <td colSpan={7} className="p-0">
                      {activeAction.kind === "despatch" ? (
                        <DespatchForm
                          lotId={lot.id}
                          onDone={() => {
                            setActiveAction(null);
                            mutate();
                          }}
                          onCancel={() => setActiveAction(null)}
                        />
                      ) : (
                        <RecoverForm
                          lotId={lot.id}
                          dustWeightG={lot.totalDustWeightG}
                          onDone={() => {
                            setActiveAction(null);
                            mutate();
                          }}
                          onCancel={() => setActiveAction(null)}
                        />
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {dustLots?.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-text-muted">
                  No dust lots yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

function DespatchForm({ lotId, onDone, onCancel }: { lotId: string; onDone: () => void; onCancel: () => void }) {
  const { data: vendors } = useVendors();
  const refiners = vendors?.filter((v) => v.type === "REFINER") ?? [];
  const [vendorId, setVendorId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/materials/dust-lots/${lotId}/despatch`, { method: "POST", body: { vendorId } });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to despatch lot");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 p-3">
      <div>
        <label className="label">Refiner</label>
        <select required className="input" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
          <option value="">Select a refiner…</option>
          {refiners.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>
      <button className="btn btn-primary" disabled={submitting}>
        {submitting ? "Despatching…" : "Despatch"}
      </button>
      <button type="button" className="btn btn-ghost" onClick={onCancel}>
        Cancel
      </button>
      {error && <p className="text-sm text-danger w-full">{error}</p>}
    </form>
  );
}

function RecoverForm({
  lotId,
  dustWeightG,
  onDone,
  onCancel,
}: {
  lotId: string;
  dustWeightG: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [recoveredPureGoldG, setRecoveredPureGoldG] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/materials/dust-lots/${lotId}/recover`, {
        method: "POST",
        body: { recoveredPureGoldG: Number(recoveredPureGoldG) },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record recovery");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 p-3">
      <div>
        <label className="label">Pure Gold Recovered (g)</label>
        <input
          required
          type="number"
          step="0.001"
          className="input w-40"
          value={recoveredPureGoldG}
          onChange={(e) => setRecoveredPureGoldG(e.target.value)}
        />
        <p className="text-xs text-text-muted mt-1">Dust sent: {formatWeight(dustWeightG)}</p>
      </div>
      <button className="btn btn-primary" disabled={submitting}>
        {submitting ? "Saving…" : "Save Recovery"}
      </button>
      <button type="button" className="btn btn-ghost" onClick={onCancel}>
        Cancel
      </button>
      {error && <p className="text-sm text-danger w-full">{error}</p>}
    </form>
  );
}
