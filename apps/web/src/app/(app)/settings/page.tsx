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
    <div className="max-w-3xl">
      <div className="mb-3.5">
        <div className="text-[11px] text-mute mb-1">Admin</div>
        <h1 className="text-[19px] font-semibold text-ink">Settings — Masters</h1>
      </div>

      <div className="space-y-3.5">
        <section className="console-panel p-3.5">
          <div className="text-[11px] font-bold uppercase text-ink2 tracking-wide mb-2.5">Gold Rate (24K, ₹/gram)</div>
          <form onSubmit={addRate} className="flex items-end gap-2 mb-3">
            <div>
              <label className="console-field-label">New rate, effective now</label>
              <input required type="number" step="0.01" className="console-field w-40" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <button className="console-btn primary">Set Rate</button>
            {error && <p className="text-sm text-err-tx">{error}</p>}
          </form>
          <div className="overflow-x-auto">
            <table className="console-table">
              <thead>
                <tr>
                  <th>Rate</th>
                  <th>Effective From</th>
                </tr>
              </thead>
              <tbody>
                {rates?.slice(0, 8).map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{formatINR(Number(r.ratePerGram24k))}</td>
                    <td className="text-ink2">{formatDate(r.effectiveFrom)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="console-panel p-3.5">
          <div className="text-[11px] font-bold uppercase text-ink2 tracking-wide mb-2.5">Karat / Purity Factors</div>
          {canManage && <AddKaratForm onAdded={mutateKarats} />}
          <div className="overflow-x-auto">
            <table className="console-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th className="num">Purity Factor</th>
                  {canManage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {karats?.map((k) =>
                  canManage ? (
                    <EditableKaratRow key={k.id} karat={k} onChanged={mutateKarats} />
                  ) : (
                    <tr key={k.id}>
                      <td>{k.code}</td>
                      <td className="num mono text-ink2">{Number(k.purityFactor).toFixed(4)}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="console-panel p-3.5">
          <div className="text-[11px] font-bold uppercase text-ink2 tracking-wide mb-2.5">Process Stages &amp; Wastage Tolerances</div>
          {canManage && <AddProcessStageForm onAdded={mutateStages} />}
          <div className="overflow-x-auto">
            <table className="console-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="num">Sequence</th>
                  <th className="num">Wastage Tolerance %</th>
                  {canManage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {stages?.map((s) =>
                  canManage ? (
                    <EditableProcessStageRow key={s.id} stage={s} onChanged={mutateStages} />
                  ) : (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td className="num mono text-ink2">{s.sequenceOrder}</td>
                      <td className="num mono text-ink2">{Number(s.wastageTolerancePct).toFixed(2)}%</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="console-panel p-3.5">
          <div className="text-[11px] font-bold uppercase text-ink2 tracking-wide mb-2.5">Stone Types</div>
          {canManage && <AddStoneTypeForm onAdded={mutateStoneTypes} />}
          <div className="overflow-x-auto">
            <table className="console-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th className="num">Default Rate/ct</th>
                  {canManage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {stoneTypes?.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td className="text-ink2">{s.category.replace(/_/g, " ")}</td>
                    <td className="num mono text-ink2">
                      {s.defaultRatePerCarat ? formatINR(Number(s.defaultRatePerCarat)) : "—"}
                    </td>
                    {canManage && (
                      <td className="text-right">
                        <button className="text-mute hover:text-err-tx text-xs" onClick={() => deactivateStoneType(s.id)}>
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

        <section className="console-panel p-3.5">
          <div className="text-[11px] font-bold uppercase text-ink2 tracking-wide mb-1">Store Gold/Stone Stock Ledger</div>
          <p className="text-xs text-ink2 mb-3">
            Tracks raw material sitting in the store itself (purchases, issues to karigars, returns),
            separate from what each karigar is holding. Off by default — turn it on only if you want
            to track store-level stock in the system.
          </p>
          <label className="flex items-center gap-3 cursor-pointer w-fit">
            <span className="text-[12.5px] font-medium text-ink">{stockEnabled?.enabled ? "Enabled" : "Disabled"}</span>
            <span
              onClick={toggleStockLedger}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                stockEnabled?.enabled ? "bg-accent" : "bg-line"
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

        <p className="text-xs text-mute">
          Categories, charge types and user management are managed via their respective API
          endpoints; a full admin UI for those is a near-term follow-up.
        </p>
      </div>
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
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 mb-3">
      <div>
        <label className="console-field-label">Name</label>
        <input required className="console-field w-40" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="console-field-label">Category</label>
        <select className="console-field" value={category} onChange={(e) => setCategory(e.target.value as StoneType["category"])}>
          <option value="COLOURED_STONE">Coloured Stone</option>
          <option value="POLKI">Polki</option>
          <option value="DIAMOND">Diamond</option>
        </select>
      </div>
      <div>
        <label className="console-field-label">Default Rate/ct (optional)</label>
        <input type="number" step="0.01" className="console-field w-32" value={rate} onChange={(e) => setRate(e.target.value)} />
      </div>
      <button className="console-btn primary" disabled={submitting}>
        {submitting ? "Adding…" : "+ Add Stone Type"}
      </button>
      {error && <p className="text-sm text-err-tx w-full">{error}</p>}
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
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 mb-3">
      <div>
        <label className="console-field-label">Code (e.g. 20K)</label>
        <input required className="console-field w-24" value={code} onChange={(e) => setCode(e.target.value)} />
      </div>
      <div>
        <label className="console-field-label">Purity Factor (0–1)</label>
        <input
          required
          type="number"
          step="0.0001"
          min="0"
          max="1"
          className="console-field w-32"
          value={purityFactor}
          onChange={(e) => setPurityFactor(e.target.value)}
        />
      </div>
      <button className="console-btn primary" disabled={submitting}>
        {submitting ? "Adding…" : "+ Add Karat"}
      </button>
      {error && <p className="text-sm text-err-tx w-full">{error}</p>}
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
    <tr>
      <td>{karat.code}</td>
      <td className="text-right">
        <input
          type="number"
          step="0.0001"
          min="0"
          max="1"
          className="console-field w-28 py-1 text-right mono ml-auto"
          value={purityFactor}
          onChange={(e) => setPurityFactor(e.target.value)}
        />
      </td>
      <td className="text-right whitespace-nowrap">
        {dirty && (
          <button className="text-accent hover:underline text-xs mr-2" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </button>
        )}
        <button className="text-mute hover:text-err-tx text-xs" onClick={deactivate}>
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
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 mb-3">
      <div>
        <label className="console-field-label">Name</label>
        <input required className="console-field w-40" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="console-field-label">Sequence Order</label>
        <input
          required
          type="number"
          step="1"
          min="0"
          className="console-field w-24"
          value={sequenceOrder}
          onChange={(e) => setSequenceOrder(e.target.value)}
        />
      </div>
      <div>
        <label className="console-field-label">Wastage Tolerance %</label>
        <input
          required
          type="number"
          step="0.01"
          min="0"
          max="100"
          className="console-field w-32"
          value={wastageTolerancePct}
          onChange={(e) => setWastageTolerancePct(e.target.value)}
        />
      </div>
      <button className="console-btn primary" disabled={submitting}>
        {submitting ? "Adding…" : "+ Add Stage"}
      </button>
      {error && <p className="text-sm text-err-tx w-full">{error}</p>}
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
    <tr>
      <td>{stage.name}</td>
      <td className="text-right">
        <input
          type="number"
          step="1"
          min="0"
          className="console-field w-16 py-1 text-right mono ml-auto"
          value={sequenceOrder}
          onChange={(e) => setSequenceOrder(e.target.value)}
        />
      </td>
      <td className="text-right">
        <input
          type="number"
          step="0.01"
          min="0"
          max="100"
          className="console-field w-24 py-1 text-right mono ml-auto"
          value={wastageTolerancePct}
          onChange={(e) => setWastageTolerancePct(e.target.value)}
        />
      </td>
      <td className="text-right whitespace-nowrap">
        {dirty && (
          <button className="text-accent hover:underline text-xs mr-2" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </button>
        )}
        <button className="text-mute hover:text-err-tx text-xs" onClick={deactivate}>
          Remove
        </button>
      </td>
    </tr>
  );
}
