"use client";

import { useState } from "react";
import Link from "next/link";
import { useItemMasters, useProdSettings, createItemMaster } from "@/lib/production";
import { resolveMediaUrl } from "@/lib/api";

const CATEGORIES = ["Necklace Set", "Ring", "Earrings", "Bangles", "Anklets", "Coin / Idol", "Chain", "Toe Ring", "Bracelet", "Pendant"];

export default function ItemMasterPage() {
  const [tab, setTab] = useState<"active" | "archived">("active");
  const { data: items, mutate } = useItemMasters(tab === "archived");
  const [showNew, setShowNew] = useState(false);

  return (
    <div className="flex flex-col">
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mb-1"><span>Production</span><span className="text-slate-300">/</span><span className="text-slate-900">Item Master</span></div>
          <h1 className="text-[20px] font-semibold text-slate-900">Item Master</h1>
          <p className="text-[11px] text-slate-500 mt-0.5">{items?.length ?? 0} designs · each can have many job cards (repeat batches)</p>
        </div>
        <button onClick={() => setShowNew(true)} className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] font-medium hover:bg-blue-900">+ New Design</button>
      </div>

      <div className="flex items-center gap-1 mb-3 border-b border-slate-200">
        {(["active", "archived"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 h-8 text-[12px] border-b-2 -mb-px ${tab === t ? "border-blue-800 text-blue-900 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {t === "active" ? "Active" : "Archived"}
          </button>
        ))}
      </div>

      {items?.length === 0 && (
        <div className="py-12 text-center text-[13px] text-slate-400">
          {tab === "archived" ? "No archived designs." : "No designs yet."}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {items?.map((it) => (
          <Link key={it.id} href={it.serialNo ? `/products/${it.serialNo}` : "#"} className="bg-white border border-slate-200 rounded-md overflow-hidden hover:border-slate-300 hover:shadow-sm transition">
            <div className="aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
              {(it.imageFullUrl || it.imageUrl) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={resolveMediaUrl(it.imageFullUrl || it.imageUrl!)} alt={it.name} loading="lazy" className="w-full h-full object-contain" />
              ) : <span className="text-slate-300 text-[11px]">No image</span>}
            </div>
            <div className="p-2.5">
              <div className="text-[12px] font-medium text-slate-900 truncate">{it.name}</div>
              <div className="text-[10px] text-slate-500">{it.category}{it.designCode ? ` · ${it.designCode}` : ""}</div>
              <div className="flex items-center justify-between mt-1.5 text-[10px]">
                <span className="text-slate-600">{it.targetPurity} · {it.estGrossWeight}g</span>
                <span className="text-blue-800 font-medium">{it.jobCardCount} job card{it.jobCardCount === 1 ? "" : "s"}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {showNew && <NewItemModal onClose={() => setShowNew(false)} onDone={() => { setShowNew(false); mutate(); }} />}
    </div>
  );
}

function NewItemModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { data: settings } = useProdSettings();
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [designCode, setDesignCode] = useState("");
  const [targetPurity, setTargetPurity] = useState("");
  const [estGrossWeight, setEst] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name || !targetPurity) return;
    setBusy(true);
    try {
      await createItemMaster({ name, category, designCode: designCode || undefined, targetPurity, estGrossWeight: Number(estGrossWeight) || 0, notes: notes || undefined });
      onDone();
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-md shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between"><h2 className="text-[14px] font-semibold">New Design</h2><button onClick={onClose} className="text-slate-400">✕</button></div>
        <div className="p-4 space-y-3">
          <Field label="Design name *"><input className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category"><select className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Design code"><input className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={designCode} onChange={(e) => setDesignCode(e.target.value)} placeholder="SLV-NK-142" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target purity *"><select className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={targetPurity} onChange={(e) => setTargetPurity(e.target.value)}><option value="">Select…</option>{settings?.tiers.map((t) => <option key={t.id} value={t.label}>{t.label}</option>)}</select></Field>
            <Field label="Est. gross weight (g)"><input type="number" step="0.001" className="w-full h-9 px-2 border border-slate-200 rounded text-[12px] mono" value={estGrossWeight} onChange={(e) => setEst(e.target.value)} /></Field>
          </div>
          <Field label="Notes"><input className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-3 rounded border border-slate-200 text-[12px]">Cancel</button>
          <button disabled={!name || !targetPurity || busy} onClick={submit} className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] font-medium disabled:opacity-50">{busy ? "Creating…" : "Create Design"}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{label}</label>{children}</div>;
}
