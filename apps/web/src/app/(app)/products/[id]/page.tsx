"use client";

import { use, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useItemMaster, useProdSettings, createJobCard, updateItemMaster, uploadItemImage, deleteItemImage, archiveItemMaster, unarchiveItemMaster, deleteItemMaster } from "@/lib/production";
import { resolveMediaUrl, ApiError } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import { StatusPill } from "../../job-cards/page";

export default function ItemMasterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: item, mutate } = useItemMaster(id);
  const { data: settings } = useProdSettings();
  const perms = usePermissions();
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickingSeries, setPickingSeries] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!item) return <div className="text-slate-400 p-4 text-sm">Loading…</div>;

  const open = item.jobCards.filter((j) => j.status !== "Closed").length;
  const canDelete = item.jobCards.length === 0;

  async function archive() {
    setBusy(true);
    try { await archiveItemMaster(item!.id); await mutate(); }
    catch (e) { alert(e instanceof ApiError ? e.message : "Could not archive."); }
    finally { setBusy(false); }
  }
  async function unarchive() {
    setBusy(true);
    try { await unarchiveItemMaster(item!.id); await mutate(); }
    catch (e) { alert(e instanceof ApiError ? e.message : "Could not restore."); }
    finally { setBusy(false); }
  }
  async function deleteDesign() {
    if (!window.confirm(`Permanently delete design ${item!.name}? This cannot be undone.`)) return;
    setBusy(true);
    try { await deleteItemMaster(item!.id); router.push("/products"); }
    catch (e) { alert(e instanceof ApiError ? e.message : "Could not delete."); setBusy(false); }
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      await uploadItemImage(item!.id, file);
      await mutate();
    } catch (err) {
      alert((err as Error).message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeImage(imageId: string) {
    if (!confirm("Remove this image?")) return;
    await deleteItemImage(imageId);
    await mutate();
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
            {item.isArchived && <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-600 uppercase tracking-wide">Archived</span>}
          </h1>
          <p className="text-[12px] text-slate-500">{item.category}{item.designCode ? ` · ${item.designCode}` : ""} · {item.targetPurity} · est. {item.estGrossWeight}g</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setPickingSeries(true)} className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] font-medium hover:bg-blue-900">
            <span className="font-bold">+</span> Create Job Card
          </button>
          <button onClick={() => setEditing((v) => !v)} className="h-8 px-3 rounded border border-slate-200 text-[12px] text-slate-700 hover:bg-slate-50">{editing ? "Cancel" : "Edit"}</button>
          {perms.can("items", "UPDATE") && (
            item.isArchived ? (
              <button onClick={unarchive} disabled={busy} className="h-8 px-3 rounded border border-emerald-300 text-emerald-700 text-[12px] font-medium hover:bg-emerald-50 disabled:opacity-50">Restore</button>
            ) : (
              <button onClick={archive} disabled={busy} className="h-8 px-3 rounded border border-slate-200 text-[12px] text-slate-700 hover:bg-slate-50 disabled:opacity-50">Archive</button>
            )
          )}
          {perms.can("items", "DELETE") && (
            <button
              onClick={deleteDesign}
              disabled={busy || !canDelete}
              title={canDelete ? "Delete this design" : "Has job cards — archive instead"}
              className="h-8 px-3 rounded border border-rose-300 text-rose-700 text-[12px] font-medium hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-1 space-y-3">
          <div className="bg-slate-100 border border-slate-200 rounded-md overflow-hidden aspect-square flex items-center justify-center relative group">
            {item.images[0]?.url ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveMediaUrl(item.images[0].fullUrl || item.images[0].url)}
                  alt={item.name}
                  onClick={() => setLightbox(true)}
                  className="w-full h-full object-contain cursor-zoom-in"
                  title="Click to enlarge"
                />
                <button
                  onClick={() => removeImage(item.images[0].id)}
                  className="absolute top-2 right-2 h-6 w-6 rounded-full bg-slate-900/60 text-white text-[12px] opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-600"
                  title="Remove image"
                >✕</button>
              </>
            ) : <span className="text-slate-300 text-[12px]">No image</span>}
          </div>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="hidden" onChange={onPickImage} />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="w-full h-8 rounded border border-slate-200 text-[12px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : item.images[0] ? "Replace Image" : "+ Add Image"}
          </button>
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

      {pickingSeries && (
        <SeriesPickModal itemMasterId={item.id} jobCardSeries={settings?.jobCardSeries ?? []} onClose={() => setPickingSeries(false)}
          onCreated={(jobNo) => { setPickingSeries(false); router.push(`/job-cards/${jobNo}`); }} />
      )}

      {lightbox && item.images[0] && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6 cursor-zoom-out" onClick={() => setLightbox(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolveMediaUrl(item.images[0].fullUrl || item.images[0].url)}
            alt={item.name}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button onClick={() => setLightbox(false)} className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/20 text-white text-[16px] hover:bg-white/30">✕</button>
        </div>
      )}
    </div>
  );
}

function SeriesPickModal({ itemMasterId, jobCardSeries, onClose, onCreated }: {
  itemMasterId: string; jobCardSeries: { id: string; name: string; effectiveFrom: string }[];
  onClose: () => void; onCreated: (jobNo: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const availableSeries = jobCardSeries.filter((s) => s.effectiveFrom <= today);
  const [seriesId, setSeriesId] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!seriesId) return;
    setBusy(true);
    try {
      const jc = await createJobCard({ itemMasterId, seriesId });
      onCreated(jc.jobNo);
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-md shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100"><h2 className="text-[14px] font-semibold">Create Job Card</h2></div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Job No. Series *</label>
            <select className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
              <option value="">Select a series…</option>
              {availableSeries.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {availableSeries.length === 0 && <p className="text-[11px] text-amber-700 mt-1">No effective series yet — add one in Settings first.</p>}
          </div>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-3 rounded border border-slate-200 text-[12px]">Cancel</button>
          <button disabled={!seriesId || busy} onClick={submit} className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] font-medium disabled:opacity-50">{busy ? "Creating…" : "Create"}</button>
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
