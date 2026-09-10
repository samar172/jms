"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useJobCards, useItemMasters, useProdSettings, useDeletedJobCards, createJobCard, type JobCardListRow } from "@/lib/production";
import { resolveMediaUrl, ApiError } from "@/lib/api";

const TABS = ["all", "Draft", "In Production", "On Hold", "Reconciliation", "Closed", "Deleted"];
const COLS: { key: string; label: string; align?: string }[] = [
  { key: "id", label: "Job No." },
  { key: "itemName", label: "Item" },
  { key: "stage", label: "Stage" },
  { key: "dueDate", label: "Due Date" },
  { key: "createdAt", label: "Created" },
  { key: "linked", label: "Linked" },
  { key: "grossWeightEst", label: "GW Est", align: "text-right" },
  { key: "status", label: "Status" },
];
const today = () => new Date().toISOString().slice(0, 10);

export default function JobCardsPage() {
  const router = useRouter();
  const { data: jobCards, mutate } = useJobCards();
  const { data: deleted } = useDeletedJobCards();
  const [activeTab, setActiveTab] = useState("all");
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [stage, setStage] = useState("all");
  const [series, setSeries] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortKey, setSortKey] = useState<string>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showNew, setShowNew] = useState(false);
  const [preview, setPreview] = useState<{ url: string; x: number; y: number } | null>(null);

  const rows = jobCards ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const t of TABS.slice(1)) c[t] = rows.filter((r) => r.status === t).length;
    return c;
  }, [rows]);
  const overdue = rows.filter((r) => r.status !== "Closed" && r.dueDate && r.dueDate < today()).length;

  const catOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category).filter(Boolean))).sort(),
    [rows],
  );
  const stageOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.activeStage).filter((s): s is string => !!s))).sort(),
    [rows],
  );
  const seriesOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.series).filter((s): s is string => !!s))).sort(),
    [rows],
  );

  const visible = rows.filter((r) => {
    if (activeTab !== "all" && r.status !== activeTab) return false;
    if (cat !== "all" && r.category !== cat) return false;
    if (stage !== "all" && r.activeStage !== stage) return false;
    if (series !== "all" && r.series !== series) return false;
    if (fromDate && (r.createdAt || "") < fromDate) return false;
    if (toDate && (r.createdAt || "") > toDate) return false;
    if (overdueOnly && !(r.status !== "Closed" && r.dueDate && r.dueDate < today())) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      return r.id.toLowerCase().includes(q) || r.itemName.toLowerCase().includes(q);
    }
    return true;
  });
  const activeFilters =
    cat !== "all" || stage !== "all" || series !== "all" || overdueOnly ||
    !!fromDate || !!toDate || query.trim().length > 0;

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }
  const sortVal = (r: JobCardListRow, key: string): string | number => {
    switch (key) {
      case "id": return r.id;
      case "itemName": return r.itemName;
      case "stage": return r.activeStage ?? "";
      case "dueDate": return r.dueDate ?? "";
      case "createdAt": return r.createdAt ?? "";
      case "grossWeightEst": return r.grossWeightEst;
      case "status": return r.status;
      case "linked": return r.linked.length;
      default: return "";
    }
  };
  const sorted = [...visible].sort((a, b) => {
    const av = sortVal(a, sortKey), bv = sortVal(b, sortKey);
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <div className="flex-1 flex flex-col">
      <div className="mb-3">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mb-1">
          <span>Production</span><span className="text-slate-300">/</span><span className="text-slate-900">Job Cards</span>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-[21px] font-semibold text-slate-900 leading-tight">Job Cards</h1>
            <p className="text-[11px] text-slate-500 mt-0.5">{rows.length} jobs · {overdue} overdue against due date</p>
          </div>
          <button onClick={() => setShowNew(true)} className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] font-medium hover:bg-blue-900">
            <span className="font-bold">+</span> New Job Card (नया)
          </button>
        </div>
        <div className="flex items-center gap-1 mt-2 border-b border-slate-200">
          {TABS.map((t) => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-2.5 h-8 text-[12px] border-b-2 -mb-px ${activeTab === t ? "border-blue-800 text-blue-900 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
              {t === "all" ? "All" : t} <span className="text-slate-400 ml-1">{t === "Deleted" ? (deleted?.length ?? 0) : (counts[t] || 0)}</span>
            </button>
          ))}
        </div>
        {activeTab !== "Deleted" && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by job no., item…"
              className="h-7 w-64 px-2 rounded border border-slate-200 text-[12px] outline-none focus:border-blue-400" />
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-7 px-2 rounded border border-slate-200 text-[12px]">
              <option value="all">All categories</option>
              {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={stage} onChange={(e) => setStage(e.target.value)} className="h-7 px-2 rounded border border-slate-200 text-[12px]">
              <option value="all">All stages</option>
              {stageOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {seriesOptions.length > 0 && (
              <select value={series} onChange={(e) => setSeries(e.target.value)} className="h-7 px-2 rounded border border-slate-200 text-[12px]">
                <option value="all">All series</option>
                {seriesOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <label className="flex items-center gap-1 text-[12px] text-slate-600">
              From
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="h-7 px-1.5 rounded border border-slate-200 text-[12px]" />
            </label>
            <label className="flex items-center gap-1 text-[12px] text-slate-600">
              To
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="h-7 px-1.5 rounded border border-slate-200 text-[12px]" />
            </label>
            <label className="flex items-center gap-1.5 text-[12px] text-slate-600">
              <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
              Overdue only
            </label>
            {activeFilters && (
              <button onClick={() => { setQuery(""); setCat("all"); setStage("all"); setSeries("all"); setFromDate(""); setToDate(""); setOverdueOnly(false); }}
                className="h-7 px-2.5 rounded border border-slate-200 text-[12px] text-slate-600 hover:bg-slate-50">Clear</button>
            )}
            <span className="text-[11px] text-slate-400 ml-auto">{visible.length} of {rows.length}</span>
          </div>
        )}
      </div>

      {activeTab === "Deleted" ? (
        <div className="flex-1 overflow-auto bg-white border border-slate-200 rounded-md">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr className="h-9 border-b border-slate-200 text-left">
                {["Job No.", "Item", "Stages", "Deleted by", "Deleted at"].map((h) => (
                  <th key={h} className="px-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!deleted && <tr><td colSpan={5} className="py-10 text-center text-[13px] text-slate-400">Loading…</td></tr>}
              {deleted?.length === 0 && <tr><td colSpan={5} className="py-14 text-center text-[13px] text-slate-500">No job cards have been deleted.</td></tr>}
              {deleted?.map((d, i) => (
                <tr key={i} className="border-b border-slate-100 h-12">
                  <td className="px-3 text-[12px] mono text-slate-700 font-medium">{d.jobNo}</td>
                  <td className="px-3 text-[12px] text-slate-800">{d.item ?? "—"}{d.serialNo && <span className="text-[10px] text-slate-400 ml-1">{d.serialNo}</span>}</td>
                  <td className="px-3 text-[12px] mono text-slate-600">{d.stages ?? "—"}</td>
                  <td className="px-3 text-[12px] text-slate-700">{d.deletedBy}</td>
                  <td className="px-3 text-[12px] mono text-slate-500">{new Date(d.deletedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
      <div className="flex-1 overflow-auto bg-white border border-slate-200 rounded-md">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr className="h-9 border-b border-slate-200 text-left">
              <th className="px-3 w-12"></th>
              {COLS.map((col) => (
                <th key={col.key} onClick={() => toggleSort(col.key)}
                  className={`px-3 text-[10px] uppercase tracking-wider font-semibold cursor-pointer select-none whitespace-nowrap ${sortKey === col.key ? "text-blue-700" : "text-slate-500 hover:text-slate-700"} ${col.align ?? ""}`}>
                  {col.label}{sortKey === col.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={9} className="py-14 text-center text-[13px] text-slate-500">No job cards match these filters</td></tr>
            )}
            {sorted.map((r: JobCardListRow) => {
              const overdueRow = r.status !== "Closed" && r.dueDate && r.dueDate < today();
              return (
                <tr key={r.id} onClick={() => router.push(`/job-cards/${r.id}`)} className="border-b border-slate-100 cursor-pointer h-12 hover:bg-slate-50">
                  <td className="px-3">
                    <div
                      className="w-8 h-8 rounded bg-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0"
                      onMouseEnter={(e) => {
                        const src = r.imageFullUrl || r.thumbnailUrl;
                        if (src) setPreview({ url: resolveMediaUrl(src), x: e.clientX, y: e.clientY });
                      }}
                      onMouseMove={(e) => setPreview((p) => (p ? { ...p, x: e.clientX, y: e.clientY } : p))}
                      onMouseLeave={() => setPreview(null)}
                    >
                      {r.thumbnailUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={resolveMediaUrl(r.thumbnailUrl)} alt={r.itemName} className="w-full h-full object-cover" />
                        : <span className="text-slate-300 text-[9px]">—</span>}
                    </div>
                  </td>
                  <td className="px-3 text-[12px] mono text-blue-800 font-medium">{r.id}</td>
                  <td className="px-3 text-[12px]">
                    <div className="text-slate-900">{r.itemName}</div>
                    <div className="text-[10px] text-slate-400">{r.category}</div>
                  </td>
                  <td className="px-3 text-[12px] text-slate-700">{r.activeStage ?? <span className="text-slate-400">Not issued</span>}</td>
                  <td className={`px-3 text-[12px] mono ${overdueRow ? "text-rose-600 font-medium" : "text-slate-600"}`}>{r.dueDate || "—"}</td>
                  <td className="px-3 text-[11px] mono text-slate-500 whitespace-nowrap">{r.createdAt || "—"}</td>
                  <td className="px-3 text-[11px] whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {r.linked.length === 0
                      ? <span className="text-slate-300">—</span>
                      : r.linked.map((ln) => (
                          <button key={ln} onClick={() => router.push(`/job-cards/${ln}`)} className="mono text-blue-700 hover:underline mr-1.5">{ln}</button>
                        ))}
                  </td>
                  <td className="px-3 text-[12px] text-right mono text-slate-700">{r.grossWeightEst}g</td>
                  <td className="px-3"><StatusPill status={r.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {preview && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg shadow-2xl border border-slate-200 bg-white p-1"
          style={{
            left: Math.min(preview.x + 16, (typeof window !== "undefined" ? window.innerWidth : 1200) - 288),
            top: Math.min(preview.y + 16, (typeof window !== "undefined" ? window.innerHeight : 800) - 288),
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview.url} alt="preview" className="w-64 h-64 object-contain" />
        </div>
      )}

      {showNew && <NewJobCardModal onClose={() => setShowNew(false)} onCreated={(jobNo) => { setShowNew(false); mutate(); router.push(`/job-cards/${jobNo}`); }} />}
    </div>
  );
}

const JC_STYLE: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700 border-slate-200",
  "In Production": "bg-blue-50 text-blue-800 border-blue-200",
  "On Hold": "bg-amber-50 text-amber-800 border-amber-200",
  Reconciliation: "bg-violet-50 text-violet-800 border-violet-200",
  Closed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  Pending: "bg-slate-100 text-slate-600 border-slate-200",
  "In Progress": "bg-amber-50 text-amber-800 border-amber-200",
  Approved: "bg-emerald-50 text-emerald-800 border-emerald-200",
};
export const STATUS_HI: Record<string, string> = {
  Draft: "ड्राफ्ट", "In Production": "उत्पादन में", "On Hold": "होल्ड पर", Reconciliation: "मिलान",
  Closed: "बंद", Pending: "लंबित", "In Progress": "चालू", Approved: "स्वीकृत", Issued: "जारी", Reconciled: "मिलान हुआ",
};
export function StatusPill({ status }: { status: string }) {
  const hi = STATUS_HI[status];
  return <span className={`inline-flex items-center h-5 px-1.5 rounded border text-[11px] font-medium whitespace-nowrap ${JC_STYLE[status] || JC_STYLE.Draft}`}>{status}{hi ? ` · ${hi}` : ""}</span>;
}

function NewJobCardModal({ onClose, onCreated }: { onClose: () => void; onCreated: (jobNo: string) => void }) {
  const { data: items } = useItemMasters();
  const { data: settings } = useProdSettings();
  const [itemMasterId, setItemMasterId] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [number, setNumber] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [pieceCount, setPieceCount] = useState("1");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = items?.find((i) => i.id === itemMasterId);
  const today = new Date().toISOString().slice(0, 10);
  const availableSeries = (settings?.jobCardSeries ?? []).filter((s) => s.effectiveFrom <= today);
  const selName = availableSeries.find((s) => s.id === seriesId)?.name;

  async function submit() {
    if (!itemMasterId || !seriesId || !number.trim()) return;
    setBusy(true); setError(null);
    try {
      const jc = await createJobCard({ itemMasterId, seriesId, number: number.trim(), dueDate: dueDate || undefined, pieceCount: Number(pieceCount) || undefined, notes: notes || undefined });
      onCreated(jc.jobNo);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the job card.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-md shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">New Job Card (नया)</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Item Master (design) *</label>
            <select className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={itemMasterId} onChange={(e) => setItemMasterId(e.target.value)}>
              <option value="">Select a design…</option>
              {items?.map((i) => <option key={i.id} value={i.id}>{i.name} · {i.targetPurity}</option>)}
            </select>
            {chosen && <p className="text-[11px] text-slate-500 mt-1">Target purity {chosen.targetPurity} · est. {chosen.estGrossWeight}g · locked at creation.</p>}
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Job No. Series *</label>
            <select className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
              <option value="">Select a series…</option>
              {availableSeries.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {availableSeries.length === 0 && <p className="text-[11px] text-amber-700 mt-1">No effective series yet — add one in Settings first.</p>}
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Job Card Number *</label>
            <input className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. 015" />
            {selName && number.trim() && <p className="text-[11px] text-slate-500 mt-1">Full no.: <span className="mono font-medium text-slate-800">{selName}-{number.trim()}</span></p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Pieces</label>
              <input type="number" min="1" className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={pieceCount} onChange={(e) => setPieceCount(e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Due Date</label>
              <input type="date" className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Notes</label>
            <input className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="text-[11px] text-rose-600">{error}</p>}
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-3 rounded border border-slate-200 text-[12px] text-slate-700 hover:bg-slate-50">Cancel</button>
          <button disabled={!itemMasterId || !seriesId || !number.trim() || busy} onClick={submit} className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] font-medium hover:bg-blue-900 disabled:opacity-50">
            {busy ? "Creating…" : "Create Job Card"}
          </button>
        </div>
      </div>
    </div>
  );
}
