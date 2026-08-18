"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useItemMaster, useProdSettings, createJobCard, updateItemMaster } from "@/lib/production";
import { StatusPill } from "../../job-cards/page";

export default function ItemMasterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: item, mutate } = useItemMaster(id);
  const { data: settings } = useProdSettings();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);

  if (!item) return <div className="text-slate-400 p-4 text-sm">Loading…</div>;

  const open = item.jobCards.filter((j) => j.status !== "Closed").length;

  async function createJC() {
    setCreating(true);
    try {
      const jc = await createJobCard({ itemMasterId: item!.id });
      router.push(`/job-cards/${jc.jobNo}`);
    } finally { setCreating(false); }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mb-1">
        <Link href="/products" className="hover:text-blue-800">Item Master</Link>
        <span className="text-slate-300">/</span><span className="text-slate-900">{item.name}</span>
      </div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900 flex items-center gap-2">
            <span className="mono text-blue-800">{item.serialNo}</span> {item.name}
          </h1>
          <p className="text-[12px] text-slate-500">{item.category}{item.designCode ? ` · ${item.designCode}` : ""} · {item.targetPurity} · est. {item.estGrossWeight}g</p>
        </div>
        <div className="flex gap-2">
          <button onClick={createJC} disabled={creating} className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] font-medium hover:bg-blue-900 disabled:opacity-50">
            <span className="font-bold">+</span> {creating ? "Creating…" : "Create Job Card"}
          </button>
          <button onClick={() => setEditing((v) => !v)} className="h-8 px-3 rounded border border-slate-200 text-[12px] text-slate-700 hover:bg-slate-50">{editing ? "Cancel" : "Edit"}</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-1 space-y-3">
          <div className="bg-white border border-slate-200 rounded-md overflow-hidden aspect-square flex items-center justify-center">
            {item.images[0]?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.images[0].url} alt={item.name} className="w-full h-full object-cover" />
            ) : <span className="text-slate-300 text-[12px]">No image</span>}
          </div>
          <div className="bg-white border border-slate-200 rounded-md p-3 grid grid-cols-2 gap-2 text-center">
            <div><div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Job Cards</div><div className="text-[18px] font-semibold text-slate-900">{item.jobCards.length}</div></div>
            <div><div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Open</div><div className="text-[18px] font-semibold text-blue-800">{open}</div></div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {editing ? (
            <EditItemForm item={item} tiers={settings?.tiers ?? []} onDone={() => { setEditing(false); mutate(); }} />
          ) : item.notes ? (
            <div className="bg-white border border-slate-200 rounded-md p-4 text-[12px] text-slate-700">{item.notes}</div>
          ) : null}

          <div className="bg-white border border-slate-200 rounded-md">
            <div className="px-4 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-100">Job Cards (batches)</div>
            <table className="w-full border-collapse">
              <tbody>
                {item.jobCards.length === 0 && <tr><td className="px-4 py-6 text-center text-[12px] text-slate-400">No job cards yet — use “Create Job Card”.</td></tr>}
                {item.jobCards.map((jc) => (
                  <tr key={jc.id} onClick={() => router.push(`/job-cards/${jc.id}`)} className="border-b border-slate-50 h-10 cursor-pointer hover:bg-slate-50">
                    <td className="px-4 text-[12px] mono text-blue-800">{jc.id}</td>
                    <td className="px-3 text-[12px] text-slate-600">{jc.pieceCount ?? "—"} pcs</td>
                    <td className="px-3 text-[12px] mono text-slate-500">{jc.dueDate || "—"}</td>
                    <td className="px-3"><StatusPill status={jc.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditItemForm({ item, tiers, onDone }: { item: NonNullable<ReturnType<typeof useItemMaster>["data"]>; tiers: { id: string; label: string }[]; onDone: () => void }) {
  const [name, setName] = useState(item.name);
  const [designCode, setDesignCode] = useState(item.designCode ?? "");
  const [targetPurity, setTargetPurity] = useState(item.targetPurity);
  const [est, setEst] = useState(String(item.estGrossWeight));
  const [notes, setNotes] = useState(item.notes);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { await updateItemMaster(item.id, { name, designCode: designCode || null, targetPurity, estGrossWeight: Number(est) || 0, notes }); onDone(); }
    finally { setBusy(false); }
  }
  return (
    <div className="bg-white border border-slate-200 rounded-md p-4 space-y-3">
      <div><label className="block text-[11px] font-medium text-slate-600 mb-1">Design name</label><input className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-[11px] font-medium text-slate-600 mb-1">Design code</label><input className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={designCode} onChange={(e) => setDesignCode(e.target.value)} /></div>
        <div><label className="block text-[11px] font-medium text-slate-600 mb-1">Target purity</label><select className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={targetPurity} onChange={(e) => setTargetPurity(e.target.value)}>{tiers.map((t) => <option key={t.id} value={t.label}>{t.label}</option>)}</select></div>
      </div>
      <div><label className="block text-[11px] font-medium text-slate-600 mb-1">Est. gross weight (g)</label><input type="number" className="w-full h-9 px-2 border border-slate-200 rounded text-[12px] mono" value={est} onChange={(e) => setEst(e.target.value)} /></div>
      <div><label className="block text-[11px] font-medium text-slate-600 mb-1">Notes</label><textarea rows={2} className="w-full px-2 py-1 border border-slate-200 rounded text-[12px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <button onClick={save} disabled={busy} className="h-8 px-4 rounded bg-blue-800 text-white text-[12px] font-medium disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
    </div>
  );
}
