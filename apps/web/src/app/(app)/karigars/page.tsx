"use client";

import { useState } from "react";
import Link from "next/link";
import { useProdKarigars, useLedger, useLabourLedger, useProdSettings, issueBulkStock, recordBulkReceipt, editBulkStock, deleteBulkStock, editBulkReceipt, deleteBulkReceipt, createKarigar, updateKarigar, type ProdKarigar } from "@/lib/production";
import { usePermissions } from "@/lib/permissions";

const SPEC_OPTS = ["Casting", "Meenakari", "Jadai", "Kundan", "Setting", "Fitting"];

const money = (v: number) => `₹ ${Math.round(v).toLocaleString("en-IN")}`;
const gm = (v: number) => `${v.toFixed(3)} g`;
// Time-of-day of a ledger transaction, in the viewer's local timezone (IST).
const fmtTime = (iso?: string) => {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
};
const SPECS = ["all", "Casting", "Meenakari", "Jadai", "Kundan", "Setting", "Fitting"];
// Particulars label = the ledger type without its Dr/Cr suffix.
const stripDrCr = (type: string) => type.replace(/\s*\((?:Dr|Cr)\)$/, "");
const distinct = (xs: string[]) => Array.from(new Set(xs.filter((x) => x && x !== "—"))).sort();
// Debit/credit split for a metal row (negative pureEq flips side; see table).
const metalSide = (e: { type: string; pureEq: number }) => {
  const baseDebit = e.type === "Issue (Dr)" || e.type === "Opening Balance";
  const onDebit = e.pureEq >= 0 ? baseDebit : !baseDebit;
  const amt = Math.abs(e.pureEq);
  return { onDebit, debit: onDebit ? amt : 0, credit: onDebit ? 0 : amt };
};
// Generic comparator: numbers numerically, everything else as text.
const cmp = (a: unknown, b: unknown) =>
  typeof a === "number" && typeof b === "number" ? a - b : String(a ?? "").localeCompare(String(b ?? ""));

// Clickable, sortable column header.
function SortTh({ label, colKey, sort, onSort, align = "left", tone }: {
  label: string; colKey: string; sort: { key: string; dir: "asc" | "desc" }; onSort: (k: string) => void;
  align?: "left" | "right"; tone?: string;
}) {
  const active = sort.key === colKey;
  return (
    <th className={`px-3 ${align === "right" ? "text-right" : "text-left"} text-[10px] uppercase tracking-wider font-semibold ${tone ?? "text-slate-500"}`}>
      <button type="button" onClick={() => onSort(colKey)} className={`inline-flex items-center gap-0.5 hover:opacity-70 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}<span className="text-[9px] opacity-60">{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

function defaultRateLabel(k: ProdKarigar): string | null {
  if (k.specialization === "Casting" && k.defaultWastagePct != null) return `${k.defaultWastagePct}% wastage`;
  if (k.specialization === "Meenakari" && k.defaultRatePerGm != null) return `₹${k.defaultRatePerGm}/gm`;
  if (k.defaultFlatLabour != null) return `₹${k.defaultFlatLabour} flat`;
  return null;
}

export default function KarigarLedgerPage() {
  const perms = usePermissions();
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
  const [lq, setLq] = useState("");        // ledger search (stage / job / particulars)
  const [lFrom, setLFrom] = useState("");   // date from
  const [lTo, setLTo] = useState("");       // date to
  const [fStage, setFStage] = useState("all");
  const [fJob, setFJob] = useState("all");
  const [fPart, setFPart] = useState("all");   // metal: particulars
  const [fBasis, setFBasis] = useState("all"); // labour: basis
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "", dir: "asc" });
  const toggleSort = (key: string) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  const [bulkEdit, setBulkEdit] = useState<null | { id: string; initial: { purityId: string; weight: number; note: string; date: string } }>(null);
  const [receiptEdit, setReceiptEdit] = useState<null | { id: string; initial: { purityId: string; weight: number; label: string; wastagePercent: number; date: string } }>(null);

  if (!karigars || !ledger || !settings) return <div className="text-slate-400 p-4 text-sm">Loading…</div>;
  const active = karigars.find((k) => k.id === selectedId) ?? karigars[0];
  const entries = active ? ledger[active.name] ?? [] : [];
  const labourEntries = active ? labourLedger?.[active.name] ?? [] : [];
  const closing = entries.length ? entries[entries.length - 1].balance : 0;
  // Ledger filters (date range + free text over stage/job/particulars), applied
  // to both tabs. Rows keep their true running balance — this only hides rows.
  const lqNorm = lq.trim().toLowerCase();
  const inRange = (d: string) => (!lFrom || d >= lFrom) && (!lTo || d <= lTo);
  const matchText = (parts: (string | null | undefined)[]) => !lqNorm || parts.some((v) => (v ?? "").toLowerCase().includes(lqNorm));
  const ledgerFiltered = !!(lqNorm || lFrom || lTo || fStage !== "all" || fJob !== "all" || fPart !== "all" || fBasis !== "all");
  // Dropdown options built from the current karigar's rows (per tab).
  const stageOpts = distinct((ledgerTab === "metal" ? entries.map((e) => e.stage) : labourEntries.map((l) => l.stage)));
  const jobOpts = distinct((ledgerTab === "metal" ? entries.map((e) => e.jobCardId) : labourEntries.map((l) => l.jobCardId)));
  const partOpts = distinct(entries.map((e) => stripDrCr(e.type)));
  const basisOpts = distinct(labourEntries.map((l) => l.basis));
  // Sort the displayed rows when a sort column is chosen (natural order otherwise).
  const applySort = <T,>(rows: T[], val: (r: T) => unknown) => {
    if (!sort.key) return rows;
    const out = [...rows].sort((a, b) => cmp(val(a), val(b)));
    return sort.dir === "desc" ? out.reverse() : out;
  };
  const metalVal = (e: (typeof entries)[number]) => {
    switch (sort.key) {
      case "date": return e.at ?? e.date;
      case "stage": return e.stage;
      case "job": return e.jobCardId;
      case "particulars": return stripDrCr(e.type);
      case "weight": return e.weight;
      case "debit": return metalSide(e).debit;
      case "credit": return metalSide(e).credit;
      case "balance": return e.balance;
      default: return 0;
    }
  };
  const labourVal = (l: (typeof labourEntries)[number]) => {
    switch (sort.key) {
      case "date": return l.date;
      case "job": return l.jobCardId;
      case "stage": return l.stage;
      case "basis": return l.basis;
      case "amount": return l.amount;
      default: return 0;
    }
  };
  const shownEntries = applySort(
    entries.filter((e) => inRange(e.date) && matchText([e.stage, e.jobCardId, e.type])
      && (fStage === "all" || e.stage === fStage) && (fJob === "all" || e.jobCardId === fJob) && (fPart === "all" || stripDrCr(e.type) === fPart)),
    metalVal,
  );
  const shownLabour = applySort(
    labourEntries.filter((l) => inRange(l.date) && matchText([l.stage, l.jobCardId, l.basis, l.note])
      && (fStage === "all" || l.stage === fStage) && (fJob === "all" || l.jobCardId === fJob) && (fBasis === "all" || l.basis === fBasis)),
    labourVal,
  );
  const tierId = (label: string) => settings.tiers.find((t) => t.label === label)?.id ?? "";
  const refreshLedger = () => { mutateLedger(); mutateKarigars(); };

  function openEditEntry(e: (typeof entries)[number]) {
    if (e.sourceType === "bulkIssue") {
      setBulkEdit({ id: e.sourceId, initial: { purityId: tierId(e.purity), weight: e.weight, note: "", date: e.date } });
    } else if (e.sourceType === "bulkReceipt") {
      const receiveRow = entries.find((x) => x.sourceId === e.sourceId && x.type === "Bulk Receive (Cr)");
      const wastageRow = entries.find((x) => x.sourceId === e.sourceId && x.type === "Wastage Deduction (Cr)");
      const label = (receiveRow?.stage ?? e.stage).replace(/^Bulk Receive — /, "").replace(/ \(wastage\)$/, "").replace(/^Bulk Receive$/, "");
      const w = receiveRow?.weight ?? e.weight;
      const wastagePercent = wastageRow && w ? +((wastageRow.weight / w) * 100).toFixed(2) : 0;
      setReceiptEdit({ id: e.sourceId, initial: { purityId: tierId(receiveRow?.purity ?? e.purity), weight: w, label, wastagePercent, date: (receiveRow ?? e).date } });
    } else if (e.sourceType === "opening" && active) {
      setKarigarForm({ mode: "edit", k: active });
    }
  }
  async function deleteEntry(e: (typeof entries)[number]) {
    if (e.sourceType === "bulkIssue") { if (!confirm("Delete this bulk stock issue? The ledger will re-balance.")) return; await deleteBulkStock(e.sourceId); }
    else if (e.sourceType === "bulkReceipt") { if (!confirm("Delete this bulk receipt? The ledger will re-balance.")) return; await deleteBulkReceipt(e.sourceId); }
    else return;
    refreshLedger();
  }
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
            {perms.can("karigars", "ADD") && (
              <button onClick={() => setKarigarForm({ mode: "new" })} className="h-8 w-full rounded bg-blue-800 text-white text-[12px] font-medium hover:bg-blue-900">+ New Karigar</button>
            )}
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
                  <div className={`text-[11px] mono mt-0.5 ${(ledger[k.name] ?? []).length === 0 ? "text-slate-400" : bal > 0.05 ? "text-amber-700" : bal < -0.05 ? "text-blue-700" : "text-emerald-700"}`}>
                    {(ledger[k.name] ?? []).length === 0 ? "No transactions yet" : bal > 0.05 ? `${gm(bal)} outstanding` : bal < -0.05 ? `${gm(Math.abs(bal))} in credit` : "Fully settled"}
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
                  {perms.can("karigars", "UPDATE") && (
                    <button onClick={() => setKarigarForm({ mode: "edit", k: active })} className="text-[11px] text-blue-700 hover:underline font-normal">Edit</button>
                  )}
                </h1>
                <p className="text-[11px] text-slate-500 mt-0.5">{active.contact ? `${active.contact} · ` : ""}Running pure-silver-equivalent account · labour earned {money(active.labourEarned)}</p>
              </div>
              <div className="flex items-center gap-2">
                {perms.can("karigars", "ADD") && (
                  <button onClick={() => setKarigarForm({ mode: "new" })} className="h-7 px-2.5 rounded border border-slate-200 text-[11px] text-slate-700 hover:bg-slate-50">+ New Karigar</button>
                )}
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
            <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50/60">
              <input value={lq} onChange={(e) => setLq(e.target.value)} placeholder="Search stage, job, particulars…" className="h-7 w-48 px-2 rounded border border-slate-200 text-[12px] outline-none focus:border-blue-400" />
              <select value={fStage} onChange={(e) => setFStage(e.target.value)} className="h-7 px-1.5 rounded border border-slate-200 text-[12px]" title="Filter by stage">
                <option value="all">All stages</option>
                {stageOpts.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={fJob} onChange={(e) => setFJob(e.target.value)} className="h-7 px-1.5 rounded border border-slate-200 text-[12px]" title="Filter by job">
                <option value="all">All jobs</option>
                {jobOpts.map((j) => <option key={j} value={j}>{j}</option>)}
              </select>
              {ledgerTab === "metal" ? (
                <select value={fPart} onChange={(e) => setFPart(e.target.value)} className="h-7 px-1.5 rounded border border-slate-200 text-[12px]" title="Filter by particulars">
                  <option value="all">All particulars</option>
                  {partOpts.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (
                <select value={fBasis} onChange={(e) => setFBasis(e.target.value)} className="h-7 px-1.5 rounded border border-slate-200 text-[12px]" title="Filter by basis">
                  <option value="all">All bases</option>
                  {basisOpts.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              )}
              <label className="flex items-center gap-1 text-[11px] text-slate-500">
                From <input type="date" value={lFrom} max={lTo || undefined} onChange={(e) => setLFrom(e.target.value)} className="h-7 px-1.5 rounded border border-slate-200 text-[12px]" />
              </label>
              <label className="flex items-center gap-1 text-[11px] text-slate-500">
                To <input type="date" value={lTo} min={lFrom || undefined} onChange={(e) => setLTo(e.target.value)} className="h-7 px-1.5 rounded border border-slate-200 text-[12px]" />
              </label>
              {(ledgerFiltered || sort.key) && (
                <button onClick={() => { setLq(""); setLFrom(""); setLTo(""); setFStage("all"); setFJob("all"); setFPart("all"); setFBasis("all"); setSort({ key: "", dir: "asc" }); }} className="h-7 px-2.5 rounded border border-slate-200 text-[11px] text-slate-600 hover:bg-white">Clear</button>
              )}
              <span className="text-[11px] text-slate-400 ml-auto">{ledgerTab === "metal" ? `${shownEntries.length} of ${entries.length}` : `${shownLabour.length} of ${labourEntries.length}`} rows</span>
            </div>
            {ledgerTab === "metal" ? (
              <div className="overflow-auto max-h-[520px]">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="h-8 border-b border-slate-200">
                      <SortTh label="Date" colKey="date" sort={sort} onSort={toggleSort} />
                      <SortTh label="Stage" colKey="stage" sort={sort} onSort={toggleSort} />
                      <SortTh label="Job" colKey="job" sort={sort} onSort={toggleSort} />
                      <SortTh label="Particulars" colKey="particulars" sort={sort} onSort={toggleSort} />
                      <SortTh label="Weight" colKey="weight" sort={sort} onSort={toggleSort} align="right" />
                      <SortTh label="Debit (g)" colKey="debit" sort={sort} onSort={toggleSort} align="right" tone="text-rose-600" />
                      <SortTh label="Credit (g)" colKey="credit" sort={sort} onSort={toggleSort} align="right" tone="text-emerald-700" />
                      <SortTh label="Balance" colKey="balance" sort={sort} onSort={toggleSort} align="right" />
                      <th className="px-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {entries.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-[12px] text-slate-400">No transactions yet — issue bulk stock to start.</td></tr>}
                    {entries.length > 0 && shownEntries.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-[12px] text-slate-400">No rows match these filters.</td></tr>}
                    {shownEntries.map((e, i) => {
                      // Debit = metal going TO the karigar (issued / opening he holds);
                      // Credit = metal coming BACK (returns, findings, wastage written off).
                      // A signed amount (only Opening Balance can be negative — a
                      // credit brought forward, i.e. we owe him) flips to the other
                      // side and is shown as a positive figure there.
                      const baseDebit = e.type === "Issue (Dr)" || e.type === "Opening Balance";
                      const onDebit = e.pureEq >= 0 ? baseDebit : !baseDebit;
                      const shown = Math.abs(e.pureEq).toFixed(3);
                      const particulars = e.type.replace(/\s*\((?:Dr|Cr)\)$/, "");
                      return (
                      <tr key={i} className="border-b border-slate-50 h-8">
                        <td className="px-3 text-[11px] mono text-slate-500 whitespace-nowrap leading-tight">
                          <div>{e.date}</div>
                          {fmtTime(e.at) && <div className="text-[10px] text-slate-400">{fmtTime(e.at)}</div>}
                        </td>
                        <td className="px-3 text-[11px] text-slate-600">{e.stage}</td>
                        <td className="px-3 text-[11px] mono text-blue-800">
                          {e.sourceType === "jobcard" && e.jobCardId !== "—"
                            ? <Link href={`/job-cards/${e.jobCardId}`} className="hover:underline" title="Edit on the job card">{e.jobCardId}</Link>
                            : e.jobCardId}
                        </td>
                        <td className="px-3 text-[11px] text-slate-700">{particulars}</td>
                        <td className="px-3 text-[11px] mono text-right text-slate-600 whitespace-nowrap">{e.weight.toFixed(3)} @ {e.purity}</td>
                        <td className="px-3 text-[11px] mono text-right text-rose-600">{onDebit ? shown : ""}</td>
                        <td className="px-3 text-[11px] mono text-right text-emerald-700">{onDebit ? "" : shown}</td>
                        <td className="px-3 text-[11px] mono text-right font-semibold text-slate-900" title={e.balance < 0 ? "Credit — we owe the karigar" : e.balance > 0 ? "Debit — karigar owes us" : ""}>
                          {Math.abs(e.balance).toFixed(3)}{e.balance < -0.0005 ? " Cr" : e.balance > 0.0005 ? " Dr" : ""}
                        </td>
                        <td className="px-3 text-right whitespace-nowrap">
                          {(e.sourceType === "bulkIssue" || e.sourceType === "bulkReceipt") ? (
                            <>
                              {perms.can("karigars", "UPDATE") && <button onClick={() => openEditEntry(e)} className="text-[11px] text-blue-700 hover:underline mr-2">Edit</button>}
                              {perms.can("karigars", "DELETE") && <button onClick={() => deleteEntry(e)} className="text-[11px] text-rose-600 hover:underline">Delete</button>}
                            </>
                          ) : e.sourceType === "opening" && perms.can("karigars", "UPDATE") ? (
                            <button onClick={() => openEditEntry(e)} className="text-[11px] text-blue-700 hover:underline">Edit</button>
                          ) : e.sourceType === "jobcard" && e.jobCardId !== "—" ? (
                            <Link href={`/job-cards/${e.jobCardId}`} className="text-[11px] text-slate-400 hover:text-blue-700">on job card →</Link>
                          ) : null}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                  {entries.length > 0 && (
                    <tfoot><tr className="h-8 bg-slate-50 border-t border-slate-200"><td colSpan={7} className="px-3 text-[11px] text-right font-semibold text-slate-600">Closing balance</td><td className="px-3 text-[11px] mono text-right font-bold text-slate-900">{gm(Math.abs(closing))}{closing < -0.0005 ? " Cr" : closing > 0.0005 ? " Dr" : ""}</td><td /></tr></tfoot>
                  )}
                </table>
              </div>
            ) : (
              <div className="overflow-auto max-h-[520px]">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="h-8 text-left border-b border-slate-200">
                      <SortTh label="Date" colKey="date" sort={sort} onSort={toggleSort} />
                      <SortTh label="Job Card" colKey="job" sort={sort} onSort={toggleSort} />
                      <SortTh label="Stage" colKey="stage" sort={sort} onSort={toggleSort} />
                      <SortTh label="Basis" colKey="basis" sort={sort} onSort={toggleSort} />
                      <th className="px-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Qty × Rate</th>
                      <SortTh label="Amount" colKey="amount" sort={sort} onSort={toggleSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {labourEntries.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-[12px] text-slate-400">No labour earned yet.</td></tr>}
                    {labourEntries.length > 0 && shownLabour.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-[12px] text-slate-400">No rows match these filters.</td></tr>}
                    {shownLabour.map((l, i) => (
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
                    <tfoot><tr className="h-8 bg-slate-50 border-t border-slate-200"><td colSpan={5} className="px-3 text-[11px] text-right font-semibold text-slate-600">{ledgerFiltered ? "Total (filtered)" : "Total earned"}</td><td className="px-3 text-[11px] mono font-bold text-slate-900">{money(ledgerFiltered ? shownLabour.reduce((s, l) => s + l.amount, 0) : active.labourEarned)}</td></tr></tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        )}
        {!active && (
          <div className="flex-1 bg-white border border-slate-200 rounded-md p-12 text-center">
            <p className="text-[13px] text-slate-500">No karigars yet.</p>
            {perms.can("karigars", "ADD") && (
              <button onClick={() => setKarigarForm({ mode: "new" })} className="mt-3 h-8 px-4 rounded bg-blue-800 text-white text-[12px] font-medium hover:bg-blue-900">+ Add your first karigar</button>
            )}
          </div>
        )}
      </div>

      {showBulk && active && (
        <BulkStockModal karigar={active} tiers={settings.tiers} onClose={() => setShowBulk(false)}
          onDone={async (purityId, weight, note, date) => { await issueBulkStock({ karigarId: active.id, purityId, weightGrams: weight, note, issueDate: date }); setShowBulk(false); refreshLedger(); }} />
      )}
      {showReceipt && active && (
        <BulkReceiptModal karigar={active} tiers={settings.tiers} findingNames={settings.findingNames ?? []} defaultWastagePct={settings.defaultRates.fittingWastagePct} baseRate={settings.baseRate} onClose={() => setShowReceipt(false)}
          onDone={async (purityId, weight, label, wastagePercent, note, date) => { await recordBulkReceipt({ karigarId: active.id, purityId, weightGrams: weight, label, wastagePercent, note, receiptDate: date }); setShowReceipt(false); refreshLedger(); }} />
      )}
      {bulkEdit && active && (
        <BulkStockModal karigar={active} tiers={settings.tiers} initial={bulkEdit.initial} editing onClose={() => setBulkEdit(null)}
          onDone={async (purityId, weight, note, date) => { await editBulkStock(bulkEdit.id, { purityId, weightGrams: weight, note, issueDate: date }); setBulkEdit(null); refreshLedger(); }} />
      )}
      {receiptEdit && active && (
        <BulkReceiptModal karigar={active} tiers={settings.tiers} findingNames={settings.findingNames ?? []} defaultWastagePct={settings.defaultRates.fittingWastagePct} baseRate={settings.baseRate} initial={receiptEdit.initial} editing onClose={() => setReceiptEdit(null)}
          onDone={async (purityId, weight, label, wastagePercent, note, date) => { await editBulkReceipt(receiptEdit.id, { purityId, weightGrams: weight, label, wastagePercent, receiptDate: date }); setReceiptEdit(null); refreshLedger(); }} />
      )}
      {karigarForm && (
        <KarigarForm mode={karigarForm.mode} karigar={karigarForm.k} onClose={() => setKarigarForm(null)}
          onDone={() => { setKarigarForm(null); refreshLedger(); }} />
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
              <input type="number" step="0.001" placeholder="e.g. 50 or -50" className="w-full h-9 px-2 border border-slate-200 rounded text-[12px] mono" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
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

function BulkStockModal({ karigar, tiers, initial, editing, onClose, onDone }: {
  karigar: ProdKarigar; tiers: { id: string; label: string; percent: number }[];
  initial?: { purityId: string; weight: number; note: string; date?: string }; editing?: boolean;
  onClose: () => void; onDone: (purityId: string, weight: number, note: string, date: string) => void;
}) {
  const pure = tiers.find((t) => t.percent === 100) ?? tiers[0];
  const [purityId, setPurityId] = useState(initial?.purityId ?? pure?.id ?? "");
  const [weight, setWeight] = useState(initial ? String(initial.weight) : "");
  const [note, setNote] = useState(initial?.note ?? "Bulk stock replenishment");
  const [date, setDate] = useState(initial?.date || new Date().toISOString().slice(0, 10));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-md shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100"><h2 className="text-[14px] font-semibold">{editing ? "Edit Bulk Stock Issue" : "Issue Bulk Stock"} — {karigar.name}</h2></div>
        <div className="p-4 space-y-3">
          <p className="text-[11px] text-slate-500">A running-stock advance — not tied to any job card. He draws against this across designs.</p>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Purity</label>
            <select className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={purityId} onChange={(e) => setPurityId(e.target.value)}>
              {tiers.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Weight (g) *</label>
              <input type="number" step="0.001" min="0" className="w-full h-9 px-2 border border-slate-200 rounded text-[12px] mono" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0.000" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Date *</label>
              <input type="date" max={new Date().toISOString().slice(0, 10)} className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Note</label>
            <input className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-3 rounded border border-slate-200 text-[12px]">Cancel</button>
          <button disabled={!(Number(weight) > 0) || !purityId || !date} onClick={() => onDone(purityId, Number(weight), note, date)} className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] font-medium disabled:opacity-50">{editing ? "Save" : "Issue Stock"}</button>
        </div>
      </div>
    </div>
  );
}

// The reverse of Issue Bulk Stock — a karigar (typically Fitting) hands bulk
// -made findings back to the store, off metal they were already holding. One
// ledger credit, not tied to any job card — a job card's own Fitting output
// only records what got used, never the karigar's own account.
function BulkReceiptModal({ karigar, tiers, findingNames, defaultWastagePct, baseRate, initial, editing, onClose, onDone }: {
  karigar: ProdKarigar; tiers: { id: string; label: string; percent: number }[]; findingNames: { id: string; label: string }[];
  defaultWastagePct: number; baseRate: number;
  initial?: { purityId: string; weight: number; label: string; wastagePercent: number; date?: string }; editing?: boolean;
  onClose: () => void; onDone: (purityId: string, weight: number, label: string, wastagePercent: number, note: string, date: string) => void;
}) {
  const pure = tiers.find((t) => t.percent === 100) ?? tiers[0];
  const [purityId, setPurityId] = useState(initial?.purityId ?? pure?.id ?? "");
  const [weight, setWeight] = useState(initial ? String(initial.weight) : "");
  const [label, setLabel] = useState(initial?.label ?? findingNames[0]?.label ?? "");
  const [wastagePercent, setWastagePercent] = useState(String(initial?.wastagePercent ?? defaultWastagePct));
  const [note, setNote] = useState("");
  const [date, setDate] = useState(initial?.date || new Date().toISOString().slice(0, 10));
  const purity = tiers.find((t) => t.id === purityId);
  const wastageWeight = (Number(weight) || 0) * (Number(wastagePercent) || 0) / 100;
  const narration = weight && purity
    ? `Received ${Number(weight).toFixed(3)}g ${label || "findings"} @ ${purity.label} from ${karigar.name}${wastageWeight > 0 ? ` (+${wastageWeight.toFixed(3)}g wastage @ pure, credited)` : ""}`
    : "";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-md shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100"><h2 className="text-[14px] font-semibold">{editing ? "Edit Bulk Receipt" : "Receive Bulk Findings"} — {karigar.name}</h2></div>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Weight (g) *</label>
              <input type="number" step="0.001" min="0" className="w-full h-9 px-2 border border-slate-200 rounded text-[12px] mono" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0.000" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Date *</label>
              <input type="date" max={new Date().toISOString().slice(0, 10)} className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
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
          <button disabled={!(Number(weight) > 0) || !purityId || !date} onClick={() => onDone(purityId, Number(weight), label, Number(wastagePercent) || 0, note || narration, date)} className="h-8 px-3 rounded bg-emerald-700 text-white text-[12px] font-medium disabled:opacity-50">{editing ? "Save" : "Receive"}</button>
        </div>
      </div>
    </div>
  );
}
