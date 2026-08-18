"use client";

import { useState } from "react";
import { useProdSettings, updateSettings, addTier, updateTier, deleteTier, type ProdSettings } from "@/lib/production";

const RATE_LABELS: Record<string, string> = {
  castingWastagePct: "Casting wastage %",
  fittingWastagePct: "Fitting wastage %",
  meenakariRatePerGm: "Meenakari ₹/gram",
  jadaiRatePerStone: "Jadai ₹/stone",
  settingRatePerStone: "Setting ₹/stone",
};

export default function SettingsPage() {
  const { data, mutate } = useProdSettings();
  const [newLabel, setNewLabel] = useState("");
  const [newPct, setNewPct] = useState("");

  if (!data) return <div className="text-slate-400 p-4 text-sm">Loading…</div>;

  return (
    <div className="flex flex-col max-w-3xl">
      <h1 className="text-[20px] font-semibold text-slate-900 mb-4">Settings</h1>

      {/* Purity tiers */}
      <div className="bg-white border border-slate-200 rounded-md mb-4">
        <div className="px-4 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-100">Purity Tiers (silver %)</div>
        <div className="p-4">
          <table className="w-full">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-slate-400"><th className="pb-1">Label</th><th className="pb-1">Percent of pure</th><th className="pb-1">Derived rate</th><th /></tr></thead>
            <tbody>
              {data.tiers.map((t) => (
                <TierRow key={t.id} tier={t} baseRate={data.baseRate} onChanged={mutate} />
              ))}
              <tr>
                <td className="py-1 pr-2"><input placeholder="e.g. 20K" className="h-8 w-24 px-2 border border-slate-200 rounded text-[12px]" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} /></td>
                <td className="py-1 pr-2"><input type="number" step="0.1" placeholder="%" className="h-8 w-24 px-2 border border-slate-200 rounded text-[12px] mono" value={newPct} onChange={(e) => setNewPct(e.target.value)} /></td>
                <td />
                <td className="text-right">
                  <button disabled={!newLabel || !newPct} onClick={async () => { await addTier({ label: newLabel, percent: Number(newPct) }); setNewLabel(""); setNewPct(""); mutate(); }} className="h-7 px-2.5 rounded bg-blue-800 text-white text-[11px] disabled:opacity-50">+ Add tier</button>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="text-[11px] text-slate-400 mt-2">One tier must be 100% (the pure reference). All rate/value math derives from it × the base rate.</p>
        </div>
      </div>

      <BaseRatesForm settings={data} onSaved={mutate} />
      <PureEqCalculator tiers={data.tiers} baseRate={data.baseRate} />
    </div>
  );
}

function PureEqCalculator({ tiers, baseRate }: { tiers: { id: string; label: string; percent: number }[]; baseRate: number }) {
  const [weight, setWeight] = useState("");
  const [purityId, setPurityId] = useState(tiers[0]?.id ?? "");
  const tier = tiers.find((t) => t.id === purityId);
  const w = Number(weight) || 0;
  const factor = tier ? tier.percent / 100 : 0;
  const pureEq = +(w * factor).toFixed(3);
  const value = Math.round(pureEq * baseRate);
  return (
    <div className="bg-white border border-slate-200 rounded-md mt-4">
      <div className="px-4 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-100">Pure-Equivalent Calculator</div>
      <div className="p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-600 mb-1">Weight (g)</label>
          <input type="number" step="0.001" className="h-9 w-32 px-2 border border-slate-200 rounded text-[12px] mono" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0.000" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-600 mb-1">Purity</label>
          <select className="h-9 px-2 border border-slate-200 rounded text-[12px]" value={purityId} onChange={(e) => setPurityId(e.target.value)}>
            {tiers.map((t) => <option key={t.id} value={t.id}>{t.label} ({t.percent}%)</option>)}
          </select>
        </div>
        <div className="text-[12px] text-slate-700">
          = <span className="font-semibold mono">{pureEq.toFixed(3)} g</span> pure-eq · <span className="font-semibold mono">₹{value.toLocaleString("en-IN")}</span> @ ₹{baseRate}/g
        </div>
      </div>
    </div>
  );
}

function BaseRatesForm({ settings, onSaved }: { settings: ProdSettings; onSaved: () => void }) {
  const [baseRate, setBaseRate] = useState(String(settings.baseRate));
  const [rates, setRates] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(settings.defaultRates).map(([k, v]) => [k, String(v)]))
  );
  async function save() {
    await updateSettings({ baseRate: Number(baseRate), defaultRates: Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, Number(v)])) });
    onSaved();
  }
  return (
    <div className="bg-white border border-slate-200 rounded-md">
      <div className="px-4 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-100">Base Silver Rate &amp; Default Labour Rates</div>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-[12px] text-slate-600 w-48">Base silver rate (₹/gram, pure)</label>
          <input type="number" className="h-9 w-32 px-2 border border-slate-200 rounded text-[12px] mono" value={baseRate} onChange={(e) => setBaseRate(e.target.value)} />
        </div>
        {Object.keys(RATE_LABELS).map((k) => (
          <div key={k} className="flex items-center gap-3">
            <label className="text-[12px] text-slate-600 w-48">{RATE_LABELS[k]}</label>
            <input type="number" step="0.1" className="h-9 w-32 px-2 border border-slate-200 rounded text-[12px] mono" value={rates[k] ?? ""} onChange={(e) => setRates((r) => ({ ...r, [k]: e.target.value }))} />
          </div>
        ))}
        <button onClick={save} className="h-8 px-4 rounded bg-blue-800 text-white text-[12px] font-medium hover:bg-blue-900">Save</button>
      </div>
    </div>
  );
}

function TierRow({ tier, baseRate, onChanged }: { tier: { id: string; label: string; percent: number }; baseRate: number; onChanged: () => void }) {
  const [label, setLabel] = useState(tier.label);
  const [pct, setPct] = useState(String(tier.percent));
  const dirty = label !== tier.label || Number(pct) !== tier.percent;
  return (
    <tr className="border-t border-slate-50">
      <td className="py-1 pr-2"><input className="h-8 w-24 px-2 border border-slate-200 rounded text-[12px]" value={label} onChange={(e) => setLabel(e.target.value)} /></td>
      <td className="py-1 pr-2"><input type="number" step="0.1" className="h-8 w-24 px-2 border border-slate-200 rounded text-[12px] mono" value={pct} onChange={(e) => setPct(e.target.value)} /></td>
      <td className="text-[12px] mono text-slate-500">₹{(baseRate * Number(pct) / 100).toFixed(2)}/g</td>
      <td className="text-right whitespace-nowrap">
        {dirty && <button onClick={async () => { await updateTier(tier.id, { label, percent: Number(pct) }); onChanged(); }} className="h-7 px-2 rounded bg-emerald-600 text-white text-[11px] mr-1">Save</button>}
        <button onClick={async () => { if (confirm(`Remove ${tier.label}?`)) { await deleteTier(tier.id); onChanged(); } }} className="h-7 px-2 rounded border border-slate-200 text-[11px] text-rose-600 hover:bg-rose-50">Remove</button>
      </td>
    </tr>
  );
}
