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
    <div>
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">Material</div>
        <h1 className="text-[19px] font-semibold text-ink">Materials &amp; Stock</h1>
      </div>

      <p className="text-xs text-ink2 max-w-2xl mb-3.5">
        Gold and stone are tracked per job via the Job Card workflow (issue → receive → wastage
        reconciliation). This page covers dust lot despatch and refining recovery. A dedicated
        store-level purchase/stock-take ledger lives under Ledger → Store Stock.
      </p>

      <div className="flex items-center gap-2 py-2.5 border-t border-b border-line -mx-3.5 px-3.5 sm:-mx-[18px] sm:px-[18px] mb-3.5">
        <button className="console-btn primary" onClick={createLot} disabled={creating}>
          + New Dust Lot
        </button>
      </div>

      <div className="console-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="console-table">
            <thead>
              <tr>
                <th>Lot No.</th>
                <th>Status</th>
                <th className="num">Dust Weight</th>
                <th className="num">Recovered</th>
                <th className="num">Recovery %</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dustLots?.map((lot) => (
                <Fragment key={lot.id}>
                  <tr>
                    <td className="rid">{lot.lotNo}</td>
                    <td>
                      <span className="console-pill neu">{lot.status}</span>
                    </td>
                    <td className="num mono">{formatWeight(lot.totalDustWeightG)}</td>
                    <td className="num mono">{formatWeight(lot.recoveredPureGoldG)}</td>
                    <td className="num mono">
                      {lot.recoveryPct ? `${Number(lot.recoveryPct).toFixed(2)}%` : "—"}
                    </td>
                    <td className="text-ink2">{formatDateTime(lot.createdAt)}</td>
                    <td className="text-right">
                      {lot.status === "OPEN" && (
                        <button
                          className="text-accent hover:underline text-xs"
                          onClick={() => setActiveAction({ lotId: lot.id, kind: "despatch" })}
                        >
                          Despatch to Refiner
                        </button>
                      )}
                      {lot.status === "DESPATCHED" && (
                        <button
                          className="text-accent hover:underline text-xs"
                          onClick={() => setActiveAction({ lotId: lot.id, kind: "recover" })}
                        >
                          Record Recovery
                        </button>
                      )}
                    </td>
                  </tr>
                  {activeAction?.lotId === lot.id && (
                    <tr className="bg-neu-bg">
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
                  <td colSpan={7} className="py-8 text-center text-mute">
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
        <label className="console-field-label">Refiner</label>
        <select required className="console-field" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
          <option value="">Select a refiner…</option>
          {refiners.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>
      <button className="console-btn primary" disabled={submitting}>
        {submitting ? "Despatching…" : "Despatch"}
      </button>
      <button type="button" className="console-btn" onClick={onCancel}>
        Cancel
      </button>
      {error && <p className="text-sm text-err-tx w-full">{error}</p>}
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
        <label className="console-field-label">Pure Gold Recovered (g)</label>
        <input
          required
          type="number"
          step="0.001"
          className="console-field w-40"
          value={recoveredPureGoldG}
          onChange={(e) => setRecoveredPureGoldG(e.target.value)}
        />
        <p className="text-xs text-mute mt-1">Dust sent: {formatWeight(dustWeightG)}</p>
      </div>
      <button className="console-btn primary" disabled={submitting}>
        {submitting ? "Saving…" : "Save Recovery"}
      </button>
      <button type="button" className="console-btn" onClick={onCancel}>
        Cancel
      </button>
      {error && <p className="text-sm text-err-tx w-full">{error}</p>}
    </form>
  );
}
