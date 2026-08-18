"use client";

import { useState } from "react";
import { useProdKarigars, useLedger, useProdSettings, issueBulkStock, type ProdKarigar } from "@/lib/production";

const money = (v: number) => `₹ ${Math.round(v).toLocaleString("en-IN")}`;
const gm = (v: number) => `${v.toFixed(3)} g`;
const SPECS = ["all", "Casting", "Meenakari", "Jadai", "Setting", "Fitting"];

function defaultRateLabel(k: ProdKarigar): string | null {
  if (k.specialization === "Casting" && k.defaultWastagePct != null) return `${k.defaultWastagePct}% wastage`;
  if (k.specialization === "Meenakari" && k.defaultRatePerGm != null) return `₹${k.defaultRatePerGm}/gm`;
  if (k.defaultFlatLabour != null) return `₹${k.defaultFlatLabour} flat`;
  return null;
}

export default function KarigarLedgerPage() {
  const { data: karigars } = useProdKarigars();
  const { data: ledger, mutate: mutateLedger } = useLedger();
  const { data: settings } = useProdSettings();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [spec, setSpec] = useState("all");
  const [showBulk, setShowBulk] = useState(false);

  if (!karigars || !ledger || !settings) return <div className="text-slate-400 p-4 text-sm">Loading…</div>;
  const active = karigars.find((k) => k.id === selectedId) ?? karigars[0];
  const entries = active ? ledger[active.name] ?? [] : [];
  const closing = entries.length ? entries[entries.length - 1].balance : 0;
  const totalOutstanding = karigars.reduce((s, k) => s + Math.max(0, k.balance), 0);
  const totalLabour = karigars.reduce((s, k) => s + k.labourEarned, 0);

  const filtered = karigars.filter((k) => {
    if (spec !== "all" && k.specialization !== spec) return false;
    if (query.trim() && !k.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Karigars (कारीगर)" value={String(karigars.length)} />
        <Stat label="Silver outstanding (बकाया)" value={gm(totalOutstanding)} tone="amber" />
        <Stat label="Total labour paid (मज़दूरी)" value={money(totalLabour)} />
      </div>

      <div className="flex gap-4 items-start">
        {/* Karigar list */}
        <div className="w-72 shrink-0 bg-white border border-slate-200 rounded-md overflow-hidden">
          <div className="p-2.5 border-b border-slate-100 space-y-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search karigar…" className="h-7 w-full px-2 rounded border border-slate-200 text-[12px] outline-none focus:border-blue-400" />
            <div className="flex flex-wrap gap-1">
              {SPECS.map((s) => (
                <button key={s} onClick={() => setSpec(s)} className={`h-6 px-2 rounded text-[10px] border ${spec === s ? "bg-blue-800 text-white border-blue-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{s === "all" ? "All" : s}</button>
              ))}
            </div>
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            {filtered.map((k) => {
              const bal = k.balance;
              const rl = defaultRateLabel(k);
              return (
                <button key={k.id} onClick={() => setSelectedId(k.id)} className={`w-full text-left px-3 py-2.5 border-b border-slate-100 ${active?.id === k.id ? "bg-blue-50 border-l-2 border-l-blue-800" : "hover:bg-slate-50"}`}>
                  <div className="text-[12px] font-medium text-slate-900">{k.name}</div>
                  <div className="text-[10px] text-slate-500">{k.specialization}{rl ? ` · ${rl}` : ""}</div>
                  <div className={`text-[11px] mono mt-0.5 ${(ledger[k.name] ?? []).length === 0 ? "text-slate-400" : bal > 0.05 ? "text-amber-700" : "text-emerald-700"}`}>
                    {(ledger[k.name] ?? []).length === 0 ? "No transactions yet" : bal > 0.05 ? `${gm(bal)} outstanding` : "Fully settled"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected karigar ledger */}
        {active && (
          <div className="flex-1 bg-white border border-slate-200 rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h1 className="text-[16px] font-semibold text-slate-900">{active.name} — {active.specialization}</h1>
                <p className="text-[11px] text-slate-500 mt-0.5">{active.contact ? `${active.contact} · ` : ""}Running pure-silver-equivalent account · labour earned {money(active.labourEarned)}</p>
              </div>
              <button onClick={() => setShowBulk(true)} className="h-7 px-2.5 rounded bg-blue-800 text-white text-[11px] font-medium hover:bg-blue-900">+ Issue Bulk Stock</button>
            </div>
            <div className="overflow-auto max-h-[520px]">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="h-8 text-left border-b border-slate-200">
                    {["Date", "Stage", "Job", "Type", "Weight", "Pure-eq", "Balance"].map((h) => <th key={h} className="px-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-[12px] text-slate-400">No transactions yet — issue bulk stock to start.</td></tr>}
                  {entries.map((e, i) => (
                    <tr key={i} className="border-b border-slate-50 h-8">
                      <td className="px-3 text-[11px] mono text-slate-500">{e.date}</td>
                      <td className="px-3 text-[11px] text-slate-600">{e.stage}</td>
                      <td className="px-3 text-[11px] mono text-blue-800">{e.jobCardId}</td>
                      <td className={`px-3 text-[11px] ${e.type.includes("Dr") ? "text-rose-600" : "text-emerald-700"}`}>{e.type}</td>
                      <td className="px-3 text-[11px] mono text-slate-700">{e.weight.toFixed(3)} @ {e.purity}</td>
                      <td className="px-3 text-[11px] mono text-slate-500">{e.pureEq.toFixed(3)}</td>
                      <td className="px-3 text-[11px] mono font-semibold text-slate-900">{e.balance.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
                {entries.length > 0 && (
                  <tfoot><tr className="h-8 bg-slate-50 border-t border-slate-200"><td colSpan={6} className="px-3 text-[11px] text-right font-semibold text-slate-600">Closing balance</td><td className="px-3 text-[11px] mono font-bold text-slate-900">{gm(closing)}</td></tr></tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </div>

      {showBulk && active && (
        <BulkStockModal karigar={active} tiers={settings.tiers} onClose={() => setShowBulk(false)}
          onDone={async (purityId, weight, note) => { await issueBulkStock({ karigarId: active.id, purityId, weightGrams: weight, note }); setShowBulk(false); mutateLedger(); }} />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "amber" }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</div>
      <div className={`text-[18px] font-semibold mt-0.5 mono ${tone === "amber" ? "text-amber-700" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function BulkStockModal({ karigar, tiers, onClose, onDone }: {
  karigar: ProdKarigar; tiers: { id: string; label: string; percent: number }[];
  onClose: () => void; onDone: (purityId: string, weight: number, note: string) => void;
}) {
  const pure = tiers.find((t) => t.percent === 100) ?? tiers[0];
  const [purityId, setPurityId] = useState(pure?.id ?? "");
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("Bulk stock replenishment");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-md shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100"><h2 className="text-[14px] font-semibold">Issue Bulk Stock — {karigar.name}</h2></div>
        <div className="p-4 space-y-3">
          <p className="text-[11px] text-slate-500">A running-stock advance — not tied to any job card. He draws against this across designs.</p>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Purity</label>
            <select className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={purityId} onChange={(e) => setPurityId(e.target.value)}>
              {tiers.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Weight (g) *</label>
            <input type="number" step="0.001" min="0" className="w-full h-9 px-2 border border-slate-200 rounded text-[12px] mono" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0.000" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Note</label>
            <input className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-3 rounded border border-slate-200 text-[12px]">Cancel</button>
          <button disabled={!(Number(weight) > 0) || !purityId} onClick={() => onDone(purityId, Number(weight), note)} className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] font-medium disabled:opacity-50">Issue Stock</button>
        </div>
      </div>
    </div>
  );
}
