"use client";

import { useState } from "react";
import {
  useApi,
  useKarats,
  useProcessStages,
  useStockLedgerEnabled,
  useStoneTypes,
  StoneType,
  Karat,
  ProcessStage,
} from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { formatINR, formatDate } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

interface GoldRate {
  id: string;
  ratePerGram24k: string;
  effectiveFrom: string;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const canManage = user?.role === "SUPER_ADMIN";
  const { data: rates, mutate } = useApi<GoldRate[]>("/api/masters/gold-rates");
  const { data: karats, mutate: mutateKarats } = useKarats();
  const { data: stages, mutate: mutateStages } = useProcessStages();
  const { data: stoneTypes, mutate: mutateStoneTypes } = useStoneTypes();
  const { data: stockEnabled, mutate: mutateStockEnabled } = useStockLedgerEnabled();
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [togglingStock, setTogglingStock] = useState(false);

  async function toggleStockLedger() {
    setTogglingStock(true);
    try {
      await apiFetch("/api/settings/stock-ledger-enabled", {
        method: "PUT",
        body: { enabled: !stockEnabled?.enabled },
      });
      await mutateStockEnabled();
    } finally {
      setTogglingStock(false);
    }
  }

  async function addRate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/api/masters/gold-rates", {
        method: "POST",
        body: { ratePerGram24k: Number(rate), effectiveFrom: new Date().toISOString() },
      });
      setRate("");
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function deactivateStoneType(id: string) {
    await apiFetch(`/api/masters/stone-types/${id}`, { method: "PATCH", body: { isActive: false } });
    await mutateStoneTypes();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-semibold">Settings — Masters</h1>

      <section className="card p-5">
        <h2 className="font-semibold mb-3">Gold Rate (24K, ₹/gram)</h2>
        <form onSubmit={addRate} className="flex items-end gap-2 mb-4">
          <div>
            <label className="label">New rate, effective now</label>
            <input required type="number" step="0.01" className="input w-40" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <button className="btn btn-primary">Set Rate</button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </form>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted border-b border-border">
              <th className="py-1.5 font-medium">Rate</th>
              <th className="py-1.5 font-medium">Effective From</th>
            </tr>
          </thead>
          <tbody>
            {rates?.slice(0, 8).map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="py-1.5 tabular">{formatINR(Number(r.ratePerGram24k))}</td>
                <td className="py-1.5 text-text-muted">{formatDate(r.effectiveFrom)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold mb-3">Karat / Purity Factors</h2>
        {canManage && <AddKaratForm onAdded={mutateKarats} />}
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted border-b border-border">
              <th className="py-1.5 font-medium">Code</th>
              <th className="py-1.5 font-medium text-right">Purity Factor</th>
              {canManage && <th className="py-1.5"></th>}
            </tr>
          </thead>
          <tbody>
            {karats?.map((k) =>
              canManage ? (
                <EditableKaratRow key={k.id} karat={k} onChanged={mutateKarats} />
              ) : (
                <tr key={k.id} className="border-b border-border last:border-0">
                  <td className="py-1.5">{k.code}</td>
                  <td className="py-1.5 text-right tabular text-text-muted">{Number(k.purityFactor).toFixed(4)}</td>
                </tr>
              )
            )}
          </tbody>
        </table>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold mb-3">Process Stages &amp; Wastage Tolerances</h2>
        {canManage && <AddProcessStageForm onAdded={mutateStages} />}
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted border-b border-border">
              <th className="py-1.5 font-medium">Name</th>
              <th className="py-1.5 font-medium text-right">Sequence</th>
              <th className="py-1.5 font-medium text-right">Wastage Tolerance %</th>
              {canManage && <th className="py-1.5"></th>}
            </tr>
          </thead>
          <tbody>
            {stages?.map((s) =>
              canManage ? (
                <EditableProcessStageRow key={s.id} stage={s} onChanged={mutateStages} />
              ) : (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="py-1.5">{s.name}</td>
                  <td className="py-1.5 text-right tabular text-text-muted">{s.sequenceOrder}</td>
                  <td className="py-1.5 text-right tabular text-text-muted">{Number(s.wastageTolerancePct).toFixed(2)}%</td>
                </tr>
              )
            )}
          </tbody>
        </table>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold mb-3">Stone Types</h2>
        {canManage && <AddStoneTypeForm onAdded={mutateStoneTypes} />}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border">
                <th className="py-1.5 font-medium">Name</th>
                <th className="py-1.5 font-medium">Category</th>
                <th className="py-1.5 font-medium text-right">Default Rate/ct</th>
                {canManage && <th className="py-1.5"></th>}
              </tr>
            </thead>
            <tbody>
              {stoneTypes?.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="py-1.5">{s.name}</td>
                  <td className="py-1.5 text-text-muted">{s.category.replace(/_/g, " ")}</td>
                  <td className="py-1.5 text-right tabular text-text-muted">
                    {s.defaultRatePerCarat ? formatINR(Number(s.defaultRatePerCarat)) : "—"}
                  </td>
                  {canManage && (
                    <td className="py-1.5 text-right">
                      <button className="text-text-muted hover:text-danger text-xs" onClick={() => deactivateStoneType(s.id)}>
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold mb-1">Store Gold/Stone Stock Ledger</h2>
        <p className="text-sm text-text-muted mb-4">
          Tracks raw material sitting in the store itself (purchases, issues to karigars, returns),
          separate from what each karigar is holding. Off by default — turn it on only if you want
          to track store-level stock in the system.
        </p>
        <label className="flex items-center gap-3 cursor-pointer w-fit">
          <span className="text-sm font-medium">{stockEnabled?.enabled ? "Enabled" : "Disabled"}</span>
          <span
            onClick={toggleStockLedger}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              stockEnabled?.enabled ? "bg-gold" : "bg-border"
            } ${togglingStock ? "opacity-50" : ""}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                stockEnabled?.enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </span>
        </label>
      </section>

      <p className="text-xs text-text-muted">
        Categories, charge types and user management are managed via their respective API
        endpoints; a full admin UI for those is a near-term follow-up.
      </p>
    </div>
  );
}

function AddStoneTypeForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<StoneType["category"]>("COLOURED_STONE");
  const [rate, setRate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/masters/stone-types", {
        method: "POST",
        body: { name, category, defaultRatePerCarat: rate ? Number(rate) : undefined },
      });
      setName("");
      setRate("");
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add stone type");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 mb-4">
      <div>
        <label className="label">Name</label>
        <input required className="input w-40" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label">Category</label>
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value as StoneType["category"])}>
          <option value="COLOURED_STONE">Coloured Stone</option>
          <option value="POLKI">Polki</option>
          <option value="DIAMOND">Diamond</option>
        </select>
      </div>
      <div>
        <label className="label">Default Rate/ct (optional)</label>
        <input type="number" step="0.01" className="input w-32" value={rate} onChange={(e) => setRate(e.target.value)} />
      </div>
      <button className="btn btn-primary" disabled={submitting}>
        {submitting ? "Adding…" : "+ Add Stone Type"}
      </button>
      {error && <p className="text-sm text-danger w-full">{error}</p>}
    </form>
  );
}

function AddKaratForm({ onAdded }: { onAdded: () => void }) {
  const [code, setCode] = useState("");
  const [purityFactor, setPurityFactor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/masters/karats", {
        method: "POST",
        body: { code, purityFactor: Number(purityFactor) },
      });
      setCode("");
      setPurityFactor("");
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add karat");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 mb-4">
      <div>
        <label className="label">Code (e.g. 20K)</label>
        <input required className="input w-24" value={code} onChange={(e) => setCode(e.target.value)} />
      </div>
      <div>
        <label className="label">Purity Factor (0–1)</label>
        <input
          required
          type="number"
          step="0.0001"
          min="0"
          max="1"
          className="input w-32"
          value={purityFactor}
          onChange={(e) => setPurityFactor(e.target.value)}
        />
      </div>
      <button className="btn btn-primary" disabled={submitting}>
        {submitting ? "Adding…" : "+ Add Karat"}
      </button>
      {error && <p className="text-sm text-danger w-full">{error}</p>}
    </form>
  );
}

function EditableKaratRow({ karat, onChanged }: { karat: Karat; onChanged: () => void }) {
  const [purityFactor, setPurityFactor] = useState(karat.purityFactor);
  const [saving, setSaving] = useState(false);
  const dirty = purityFactor !== karat.purityFactor;

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/api/masters/karats/${karat.id}`, {
        method: "PATCH",
        body: { purityFactor: Number(purityFactor) },
      });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function deactivate() {
    await apiFetch(`/api/masters/karats/${karat.id}`, { method: "PATCH", body: { isActive: false } });
    onChanged();
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-1.5">{karat.code}</td>
      <td className="py-1.5 text-right">
        <input
          type="number"
          step="0.0001"
          min="0"
          max="1"
          className="input w-28 py-1 text-right tabular ml-auto"
          value={purityFactor}
          onChange={(e) => setPurityFactor(e.target.value)}
        />
      </td>
      <td className="py-1.5 text-right whitespace-nowrap">
        {dirty && (
          <button className="text-gold hover:underline text-xs mr-2" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </button>
        )}
        <button className="text-text-muted hover:text-danger text-xs" onClick={deactivate}>
          Remove
        </button>
      </td>
    </tr>
  );
}

function AddProcessStageForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [sequenceOrder, setSequenceOrder] = useState("");
  const [wastageTolerancePct, setWastageTolerancePct] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/masters/process-stages", {
        method: "POST",
        body: {
          name,
          sequenceOrder: Number(sequenceOrder),
          wastageTolerancePct: Number(wastageTolerancePct),
        },
      });
      setName("");
      setSequenceOrder("");
      setWastageTolerancePct("");
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add process stage");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 mb-4">
      <div>
        <label className="label">Name</label>
        <input required className="input w-40" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label">Sequence Order</label>
        <input
          required
          type="number"
          step="1"
          min="0"
          className="input w-24"
          value={sequenceOrder}
          onChange={(e) => setSequenceOrder(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Wastage Tolerance %</label>
        <input
          required
          type="number"
          step="0.01"
          min="0"
          max="100"
          className="input w-32"
          value={wastageTolerancePct}
          onChange={(e) => setWastageTolerancePct(e.target.value)}
        />
      </div>
      <button className="btn btn-primary" disabled={submitting}>
        {submitting ? "Adding…" : "+ Add Stage"}
      </button>
      {error && <p className="text-sm text-danger w-full">{error}</p>}
    </form>
  );
}

function EditableProcessStageRow({ stage, onChanged }: { stage: ProcessStage; onChanged: () => void }) {
  const [sequenceOrder, setSequenceOrder] = useState(String(stage.sequenceOrder));
  const [wastageTolerancePct, setWastageTolerancePct] = useState(stage.wastageTolerancePct);
  const [saving, setSaving] = useState(false);
  const dirty = sequenceOrder !== String(stage.sequenceOrder) || wastageTolerancePct !== stage.wastageTolerancePct;

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/api/masters/process-stages/${stage.id}`, {
        method: "PATCH",
        body: { sequenceOrder: Number(sequenceOrder), wastageTolerancePct: Number(wastageTolerancePct) },
      });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function deactivate() {
    await apiFetch(`/api/masters/process-stages/${stage.id}`, { method: "PATCH", body: { isActive: false } });
    onChanged();
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-1.5">{stage.name}</td>
      <td className="py-1.5 text-right">
        <input
          type="number"
          step="1"
          min="0"
          className="input w-16 py-1 text-right tabular ml-auto"
          value={sequenceOrder}
          onChange={(e) => setSequenceOrder(e.target.value)}
        />
      </td>
      <td className="py-1.5 text-right">
        <input
          type="number"
          step="0.01"
          min="0"
          max="100"
          className="input w-24 py-1 text-right tabular ml-auto"
          value={wastageTolerancePct}
          onChange={(e) => setWastageTolerancePct(e.target.value)}
        />
      </td>
      <td className="py-1.5 text-right whitespace-nowrap">
        {dirty && (
          <button className="text-gold hover:underline text-xs mr-2" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </button>
        )}
        <button className="text-text-muted hover:text-danger text-xs" onClick={deactivate}>
          Remove
        </button>
      </td>
    </tr>
  );
}
