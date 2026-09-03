"use client";

import { useState } from "react";
import Link from "next/link";
import { useProdKarigars, useLedger, useLabourLedger, useProdSettings, issueBulkStock, recordBulkReceipt, createKarigar, updateKarigar, type ProdKarigar } from "@/lib/production";

const SPEC_OPTS = ["Casting", "Meenakari", "Jadai", "Kundan", "Setting", "Fitting"];

const money = (v: number) => `₹ ${Math.round(v).toLocaleString("en-IN")}`;
const gm = (v: number) => `${v.toFixed(3)} g`;
const SPECS = ["all", "Casting", "Meenakari", "Jadai", "Kundan", "Setting", "Fitting"];

function defaultRateLabel(k: ProdKarigar): string | null {
  if (k.specialization === "Casting" && k.defaultWastagePct != null) return `${k.defaultWastagePct}% wastage`;
  if (k.specialization === "Meenakari" && k.defaultRatePerGm != null) return `₹${k.defaultRatePerGm}/gm`;
  if (k.defaultFlatLabour != null) return `₹${k.defaultFlatLabour} flat`;
  return null;
}

export default function KarigarLedgerPage() {
  const { data: karigars, mutate: mutateKarigars } = useProdKarigars();
  const { data: ledger, mutate: mutateLedger } = useLedger();
  const { data: labourLedger } = useLabourLedger();
  const { data: settings } = useProdSettings();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [spec, setSpec] = useState("all");
  const [showBulk, setShowBulk] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [karigarForm, setKarigarForm] = useState<null | { mode: "new" | "edit"; k?: ProdKarigar }>(null);
  const [ledgerTab, setLedgerTab] = useState<"metal" | "labour">("metal");

  if (!karigars || !ledger || !settings) return <div className="text-slate-400 p-4 text-sm">Loading…</div>;
  const active = karigars.find((k) => k.id === selectedId) ?? karigars[0];
  const entries = active ? ledger[active.name] ?? [] : [];
  const labourEntries = active ? labourLedger?.[active.name] ?? [] : [];
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
                <h1 className="text-[16px] font-semibold text-slate-900 flex items-center gap-2">
                  {active.name} — {active.specialization}
                  <button onClick={() => setKarigarForm({ mode: "edit", k: active })} className="text-[11px] text-blue-700 hover:underline font-normal">Edit</button>
                </h1>
                <p className="text-[11px] text-slate-500 mt-0.5">{active.contact ? `${active.contact} · ` : ""}Running pure-silver-equivalent account · labour earned {money(active.labourEarned)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setKarigarForm({ mode: "new" })} className="h-7 px-2.5 rounded border border-slate-200 text-[11px] text-slate-700 hover:bg-slate-50">+ New Karigar</button>
                <button onClick={() => setShowBulk(true)} className="h-7 px-2.5 rounded bg-blue-800 text-white text-[11px] font-medium hover:bg-blue-900">+ Issue Bulk Stock</button>
                <button onClick={() => setShowReceipt(true)} className="h-7 px-2.5 rounded bg-emerald-700 text-white text-[11px] font-medium hover:bg-emerald-800">+ Receive Bulk Findings</button>
              </div>
            </div>
            {active.holding.length > 0 && (
              <div className="bg-amber-50/60 border-b border-amber-200 px-4 py-2.5">
                <div className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold mb-1.5">Currently Holding (पास में)</div>
                <div className="flex flex-wrap gap-2">
                  {active.holding.map((h, i) => (
                    <Link key={i} href={`/job-cards/${h.jobId}`} className="bg-white border border-amber-200 rounded px-2.5 py-1.5 text-[11px] hover:border-amber-300">
                      <span className="mono text-blue-800">{h.jobId}</span>
                      <span className="text-amber-700 ml-1.5 mono">{h.weight.toFixed(3)} @ {h.purity} ({h.stage})</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-1 px-4 pt-2 border-b border-slate-100">
              {(["metal", "labour"] as const).map((t) => (
                <button key={t} onClick={() => setLedgerTab(t)}
                  className={`px-2.5 h-8 text-[12px] border-b-2 -mb-px ${ledgerTab === t ? "border-blue-800 text-blue-900 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                  {t === "metal" ? "Metal Ledger (मेटल)" : `Labour Ledger (मज़दूरी) · ${money(active.labourEarned)}`}
                </button>
              ))}
            </div>
            {ledgerTab === "metal" ? (
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
            ) : (
              <div className="overflow-auto max-h-[520px]">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="h-8 text-left border-b border-slate-200">
                      {["Date", "Job Card", "Stage", "Basis", "Qty × Rate", "Amount"].map((h) => <th key={h} className="px-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {labourEntries.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-[12px] text-slate-400">No labour earned yet.</td></tr>}
                    {labourEntries.map((l, i) => (
                      <tr key={i} className="border-b border-slate-50 h-9">
                        <td className="px-3 text-[11px] mono text-slate-500">{l.date}</td>
                        <td className="px-3 text-[11px]">
                          <Link href={`/job-cards/${l.jobCardId}`} className="mono text-blue-800 hover:underline" title="Open job card — full labour breakdown there">{l.jobCardId}</Link>
                        </td>
                        <td className="px-3 text-[11px] text-slate-600">{l.stage}</td>
                        <td className="px-3 text-[11px] text-slate-600">{l.basis}</td>
                        <td className="px-3 text-[11px] mono text-slate-500">{l.basis === "Flat" ? "—" : `${l.qty} × ₹${l.rate}`}</td>
                        <td className="px-3 text-[11px] mono font-semibold text-slate-900">{money(l.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {labourEntries.length > 0 && (
                    <tfoot><tr className="h-8 bg-slate-50 border-t border-slate-200"><td colSpan={5} className="px-3 text-[11px] text-right font-semibold text-slate-600">Total earned</td><td className="px-3 text-[11px] mono font-bold text-slate-900">{money(active.labourEarned)}</td></tr></tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {showBulk && active && (
        <BulkStockModal karigar={active} tiers={settings.tiers} onClose={() => setShowBulk(false)}
          onDone={async (purityId, weight, note) => { await issueBulkStock({ karigarId: active.id, purityId, weightGrams: weight, note }); setShowBulk(false); mutateLedger(); }} />
      )}
      {showReceipt && active && (
        <BulkReceiptModal karigar={active} tiers={settings.tiers} findingNames={settings.findingNames ?? []} defaultWastagePct={settings.defaultRates.fittingWastagePct} baseRate={settings.baseRate} onClose={() => setShowReceipt(false)}
          onDone={async (purityId, weight, label, wastagePercent, note) => { await recordBulkReceipt({ karigarId: active.id, purityId, weightGrams: weight, label, wastagePercent, note }); setShowReceipt(false); mutateLedger(); }} />
      )}
      {karigarForm && (
        <KarigarForm mode={karigarForm.mode} karigar={karigarForm.k} onClose={() => setKarigarForm(null)}
          onDone={() => { setKarigarForm(null); mutateKarigars(); }} />
      )}
    </div>
  );
}

function KarigarForm({ mode, karigar, onClose, onDone }: { mode: "new" | "edit"; karigar?: ProdKarigar; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(karigar?.name ?? "");
  const [spec, setSpec] = useState(karigar?.specialization ?? "Casting");
  const [contact, setContact] = useState(karigar?.contact ?? "");
  const [wastage, setWastage] = useState(karigar?.defaultWastagePct == null ? "" : String(karigar.defaultWastagePct));
  const [ratePerGm, setRatePerGm] = useState(karigar?.defaultRatePerGm == null ? "" : String(karigar.defaultRatePerGm));
  const [flat, setFlat] = useState(karigar?.defaultFlatLabour == null ? "" : String(karigar.defaultFlatLabour));
  const [openingBalance, setOpeningBalance] = useState(karigar?.openingBalance ? String(karigar.openingBalance) : "0");
  const [openingBalanceDate, setOpeningBalanceDate] = useState(karigar?.openingBalanceDate || new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name) return;
    setBusy(true);
    const body = {
      name, specialization: spec, contact: contact || undefined,
      defaultWastagePct: wastage === "" ? null : Number(wastage),
      defaultRatePerGm: ratePerGm === "" ? null : Number(ratePerGm),
      defaultFlatLabour: flat === "" ? null : Number(flat),
      openingBalance: openingBalance === "" ? 0 : Number(openingBalance),
      openingBalanceDate,
    };
    try {
      if (mode === "new") await createKarigar(body);
      else await updateKarigar(karigar!.id, body);
      onDone();
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-md shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100"><h2 className="text-[14px] font-semibold">{mode === "new" ? "New Karigar" : `Edit ${karigar?.name}`}</h2></div>
        <div className="p-4 space-y-3">
          <L label="Name *"><input className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={name} onChange={(e) => setName(e.target.value)} /></L>
          <div className="grid grid-cols-2 gap-3">
            <L label="Specialization"><select className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={spec} onChange={(e) => setSpec(e.target.value)}>{SPEC_OPTS.map((s) => <option key={s}>{s}</option>)}</select></L>
            <L label="Contact"><input className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={contact} onChange={(e) => setContact(e.target.value)} /></L>
          </div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold pt-1">Default rates (specialization-dependent)</div>
          {spec === "Casting" && <L label="Default wastage %"><input type="number" className="w-full h-9 px-2 border border-slate-200 rounded text-[12px] mono" value={wastage} onChange={(e) => setWastage(e.target.value)} /></L>}
          {spec === "Meenakari" && <L label="Default ₹/gram"><input type="number" className="w-full h-9 px-2 border border-slate-200 rounded text-[12px] mono" value={ratePerGm} onChange={(e) => setRatePerGm(e.target.value)} /></L>}
          {(spec === "Jadai" || spec === "Kundan" || spec === "Setting" || spec === "Fitting") && <L label="Default flat labour ₹"><input type="number" className="w-full h-9 px-2 border border-slate-200 rounded text-[12px] mono" value={flat} onChange={(e) => setFlat(e.target.value)} /></L>}
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold pt-1">Opening balance</div>
          <div className="grid grid-cols-2 gap-3">
            <L label="Opening balance (g, pure-eq)">
              <input type="number" step="0.001" className="w-full h-9 px-2 border border-slate-200 rounded text-[12px] mono" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
            </L>
            <L label="As of">
              <input type="date" className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={openingBalanceDate} onChange={(e) => setOpeningBalanceDate(e.target.value)} />
            </L>
          </div>
          <p className="text-[11px] text-slate-400">+ve = he owes, -ve = we owe him. Shows as the first row in his ledger (dated as above) — every later bulk issue/receipt reconciles against this, not zero.</p>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-3 rounded border border-slate-200 text-[12px]">Cancel</button>
          <button disabled={!name || busy} onClick={save} className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] font-medium disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{label}</label>{children}</div>;
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

// The reverse of Issue Bulk Stock — a karigar (typically Fitting) hands bulk
// -made findings back to the store, off metal they were already holding. One
// ledger credit, not tied to any job card — a job card's own Fitting output
// only records what got used, never the karigar's own account.
function BulkReceiptModal({ karigar, tiers, findingNames, defaultWastagePct, baseRate, onClose, onDone }: {
  karigar: ProdKarigar; tiers: { id: string; label: string; percent: number }[]; findingNames: { id: string; label: string }[];
  defaultWastagePct: number; baseRate: number;
  onClose: () => void; onDone: (purityId: string, weight: number, label: string, wastagePercent: number, note: string) => void;
}) {
  const pure = tiers.find((t) => t.percent === 100) ?? tiers[0];
  const [purityId, setPurityId] = useState(pure?.id ?? "");
  const [weight, setWeight] = useState("");
  const [label, setLabel] = useState(findingNames[0]?.label ?? "");
  const [wastagePercent, setWastagePercent] = useState(String(defaultWastagePct));
  const [note, setNote] = useState("");
  const purity = tiers.find((t) => t.id === purityId);
  const wastageWeight = (Number(weight) || 0) * (Number(wastagePercent) || 0) / 100;
  const narration = weight && purity
    ? `Received ${Number(weight).toFixed(3)}g ${label || "findings"} @ ${purity.label} from ${karigar.name}${wastageWeight > 0 ? ` (+${wastageWeight.toFixed(3)}g wastage @ pure, credited)` : ""}`
    : "";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-md shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100"><h2 className="text-[14px] font-semibold">Receive Bulk Findings — {karigar.name}</h2></div>
        <div className="p-4 space-y-3">
          <p className="text-[11px] text-slate-500">He made these in bulk, off metal already issued to him. Crediting it here settles that against his account — not tied to any job card; a job card's Fitting output later just records what got used from store stock, with no effect on his ledger.</p>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Item (कोई भी item)</label>
            <input list="finding-name-suggestions" className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Wire / Push Clip / Kadi / …" />
            <datalist id="finding-name-suggestions">
              {findingNames.map((n) => <option key={n.id} value={n.label} />)}
            </datalist>
          </div>
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
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Wastage % (credited @ pure, same as Casting/Fitting)</label>
            <input type="number" step="0.1" min="0" className="w-full h-9 px-2 border border-slate-200 rounded text-[12px] mono" value={wastagePercent} onChange={(e) => setWastagePercent(e.target.value)} />
            {wastageWeight > 0 && (
              <p className="text-[11px] text-emerald-700 mt-1">+{wastageWeight.toFixed(3)}g wastage credited @ pure (₹{Math.round(wastageWeight * baseRate).toLocaleString("en-IN")} pure-eq, informational only — no job card to charge it to)</p>
            )}
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Note</label>
            <input className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder={narration || "Bulk findings received"} />
          </div>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-3 rounded border border-slate-200 text-[12px]">Cancel</button>
          <button disabled={!(Number(weight) > 0) || !purityId} onClick={() => onDone(purityId, Number(weight), label, Number(wastagePercent) || 0, note || narration)} className="h-8 px-3 rounded bg-emerald-700 text-white text-[12px] font-medium disabled:opacity-50">Receive</button>
        </div>
      </div>
    </div>
  );
}
