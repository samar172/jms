"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePermissions } from "@/lib/permissions";
import {
  useJobCard, useJobCards, useProdKarigars, useProdSettings,
  assignKarigar, castOutput, editCastOutput, issueMaterial, reconcile, editReconcile, cancelReconcile, jadaiOutput, editJadaiOutput, kundanOutput, editKundanOutput, findingOutput, editFindingOutput,
  issueStones, returnStones, editStone, removeStone, removeIssue, removeAssignment, clearAssignmentOutput, approveStage, unapproveStage, closeJobCard, reopenJobCard, toggleHold, updateJobCardMeta,
  linkJobCard, unlinkJobCard,
  STAGE_HI, type JobCardDetail,
} from "@/lib/production";
import type { Stage, Assignment, MaterialIssue, StoneEntry, SubItem } from "@jms/shared";
import { wastageLines, labourLines, stoneLines } from "@jms/shared";
import { StatusPill } from "../page";
import { openAuthenticated, apiFetch, ApiError } from "@/lib/api";

const money = (v: number) => `₹ ${Math.round(v).toLocaleString("en-IN")}`;
const gm = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(3)} g`);

export default function JobCardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, mutate } = useJobCard(id);
  const { data: karigars } = useProdKarigars();
  const { data: settings } = useProdSettings();
  const router = useRouter();
  const perms = usePermissions();
  const [reopenOpen, setReopenOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  async function deleteJobCard() {
    if (!window.confirm(`Delete job card ${id}? This removes all its stages, work and ledger effect. This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/production/job-cards/${encodeURIComponent(id)}`, { method: "DELETE" });
      router.push("/job-cards");
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Could not delete the job card.");
      setDeleting(false);
    }
  }

  if (!data || !settings) return <div className="text-slate-400 p-4 text-sm">Loading…</div>;
  const jc = data.jobCard;
  const refresh = () => mutate();

  return (
    <div className="flex flex-col">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mb-1">
            <Link href="/job-cards" className="hover:text-blue-800">Job Cards</Link>
            <span className="text-slate-300">/</span><span className="text-slate-900">{jc.id}</span>
          </div>
          <h1 className="text-[20px] font-semibold flex items-center gap-3 text-slate-900">
            {data.item.name}
            <StatusPill status={jc.status} />
            <span className="text-[12px] font-normal text-slate-500">{jc.targetPurity} · {jc.pieceCount ?? "—"} pcs</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setExportOpen(true)} className="h-8 px-3 rounded border border-slate-200 text-[12px] text-slate-700 hover:bg-slate-50">
            Export PDF
          </button>
          {jc.status !== "Closed" && (
            <button onClick={async () => { await toggleHold(jc.id); refresh(); }} className="h-8 px-3 rounded border border-slate-200 text-[12px] text-slate-700 hover:bg-slate-50">
              {jc.status === "On Hold" ? "Resume" : "Hold"}
            </button>
          )}
          {jc.status !== "Closed" ? (
            <button onClick={async () => { try { await closeJobCard(jc.id); refresh(); } catch (e) { alert((e as Error).message); } }} className="h-8 px-3 rounded bg-emerald-600 text-white text-[12px] font-medium hover:bg-emerald-700">
              Close (OC)
            </button>
          ) : (
            <button onClick={() => setReopenOpen(true)} className="h-8 px-3 rounded border border-amber-300 text-amber-800 text-[12px] font-medium hover:bg-amber-50">
              Reopen (Audited)
            </button>
          )}
          {perms.can("job_cards", "DELETE") && (
            <button onClick={deleteJobCard} disabled={deleting} className="h-8 px-3 rounded border border-rose-300 text-rose-700 text-[12px] font-medium hover:bg-rose-50 disabled:opacity-50">
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-3">
          {jc.stages.map((stage) => (
            <StageCard key={stage.stage} jobNo={jc.id} stage={stage} pieceCount={jc.pieceCount}
              targetPurity={jc.targetPurity} karigars={karigars ?? []} settings={settings} onChange={refresh} />
          ))}
        </div>

        <div className="lg:col-span-1 space-y-4 sticky top-4">
          {data.item.images[0]?.url && (
            <div className="bg-slate-100 border border-slate-200 rounded-md overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.item.images[0].fullUrl || data.item.images[0].url}
                alt={data.item.name}
                onClick={() => setLightbox(true)}
                className="w-full aspect-square object-contain cursor-zoom-in"
                title="Click to enlarge"
              />
            </div>
          )}
          <JobDetailsPanel jobNo={jc.id} dueDate={jc.dueDate} pieceCount={jc.pieceCount} notes={jc.notes} onSaved={refresh} />
          <LinkedCards data={data} jobNo={jc.id} canEdit={perms.can("job_cards", "UPDATE")} onChange={refresh} />
          <CostingSummary data={data} onSaved={refresh} />
          <div className="bg-white border border-slate-200 rounded-md">
            <div className="px-4 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-100">Activity</div>
            <ol className="p-3 space-y-2 max-h-[360px] overflow-auto">
              {[...data.activity].reverse().map((a, i) => (
                <li key={i} className="text-[12px]">
                  <span className="text-slate-400 mono text-[10px]">{a.date}</span>
                  <div className="text-slate-700">{a.text}</div>
                </li>
              ))}
            </ol>
          </div>
          {data.reversals.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-[11px] text-amber-900">
              <div className="font-semibold uppercase tracking-wider mb-1">Reopen History</div>
              {data.reversals.map((r, i) => <div key={i}>{r.date} — {r.reason} (by {r.approvedBy})</div>)}
            </div>
          )}
        </div>
      </div>

      {reopenOpen && <ReopenModal onClose={() => setReopenOpen(false)} onDone={async (reason, by) => { await reopenJobCard(jc.id, { reason, approvedBy: by }); setReopenOpen(false); refresh(); }} />}
      {exportOpen && <ExportPdfModal jobNo={jc.id} onClose={() => setExportOpen(false)} />}

      {lightbox && data.item.images[0] && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6 cursor-zoom-out" onClick={() => setLightbox(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.item.images[0].fullUrl || data.item.images[0].url}
            alt={data.item.name}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button onClick={() => setLightbox(false)} className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/20 text-white text-[16px] hover:bg-white/30">✕</button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Costing ---------------------------------- */
function SumRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3 py-1.5 text-[12px] ${strong ? "font-semibold" : ""}`}>
      <span className="text-slate-500">{label}</span><span className="mono text-slate-900">{value}</span>
    </div>
  );
}
function LinkedCards({ data, jobNo, canEdit, onChange }: { data: JobCardDetail; jobNo: string; canEdit: boolean; onChange: () => void }) {
  const { data: allCards } = useJobCards();
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = data.combined;

  // Only existing job cards, excluding this one and those already linked.
  const linkedSet = new Set(data.linked.map((l) => l.jobNo));
  const options = (allCards ?? []).filter((x) => x.id !== jobNo && !linkedSet.has(x.id));

  async function add() {
    if (!target) return;
    setBusy(true); setError(null);
    try { await linkJobCard(jobNo, target); setTarget(""); setAdding(false); onChange(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not link."); }
    finally { setBusy(false); }
  }
  async function remove(t: string) {
    setBusy(true); setError(null);
    try { await unlinkJobCard(jobNo, t); onChange(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not unlink."); }
    finally { setBusy(false); }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-md">
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-slate-100">
        <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Linked Job Cards</span>
        {canEdit && <button onClick={() => setAdding((v) => !v)} className="text-[11px] text-blue-700 hover:underline">{adding ? "Cancel" : "+ Link"}</button>}
      </div>
      <div className="p-3 space-y-2">
        {adding && (
          <div className="flex gap-2">
            <select value={target} onChange={(e) => setTarget(e.target.value)} className="h-8 flex-1 px-2 rounded border border-slate-200 text-[12px]">
              <option value="">Select a job card…</option>
              {options.map((x) => <option key={x.id} value={x.id}>{x.id} · {x.itemName}</option>)}
            </select>
            <button onClick={add} disabled={busy || !target} className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] disabled:opacity-50">Link</button>
          </div>
        )}
        {adding && options.length === 0 && <p className="text-[11px] text-amber-700">No other job cards available to link.</p>}
        {data.linked.length === 0 && !adding && <p className="text-[12px] text-slate-400">No linked job cards.</p>}
        {data.linked.map((l) => (
          <div key={l.jobNo} className="flex items-center justify-between gap-2 border border-slate-100 rounded hover:border-blue-200 hover:bg-blue-50/40">
            <Link href={`/job-cards/${l.jobNo}`} className="flex-1 min-w-0 px-2.5 py-1.5 text-[12px] flex items-center gap-1.5" title={`Open ${l.jobNo}`}>
              <span className="mono text-blue-800 font-medium">{l.jobNo}</span>
              <span className="text-slate-600 truncate">{l.itemName}</span>
              <span className="text-[10px] text-slate-400 shrink-0">{gm(l.grossWeight)} · {money(l.labour)}</span>
              <span className="text-blue-400 ml-auto shrink-0">→</span>
            </Link>
            {canEdit && <button onClick={() => remove(l.jobNo)} disabled={busy} title="Unlink" className="text-slate-400 hover:text-rose-600 text-[13px] shrink-0 pr-2">✕</button>}
          </div>
        ))}
        {error && <p className="text-[11px] text-rose-600">{error}</p>}
        {c && (
          <div className="mt-1 pt-1 border-t border-slate-100">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold px-3 pt-1.5 pb-0.5">Combined · {c.count} cards</div>
            <SumRow label="Gross weight" value={gm(c.grossWeight)} />
            <SumRow label="Pure equivalent" value={gm(c.pureEq)} />
            <SumRow label="Labour" value={money(c.labour)} />
            <SumRow label="Silver value" value={money(c.silverValue)} />
            <SumRow label="Sale value (metal + stones)" value={money(c.saleValue)} strong />
          </div>
        )}
      </div>
    </div>
  );
}

function CostingSummary({ data, onSaved }: { data: JobCardDetail; onSaved: () => void }) {
  const t = data.totals;
  const Row = SumRow;
  const [openSection, setOpenSection] = useState<null | "material" | "labour" | "stones">(null);
  const toggle = (s: "material" | "labour" | "stones") => setOpenSection((v) => (v === s ? null : s));
  const jc = data.jobCard;
  const ll = labourLines(jc);
  const sl = stoneLines(jc);
  return (
    <div className="bg-white border border-slate-200 rounded-md">
      <div className="px-4 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-100">Costing Summary</div>
      <div className="divide-y divide-slate-50">
        <Row label={`Net Metal (${t.currentPurity})`} value={gm(t.currentWeight)} />
        <Row label="Pure equivalent" value={gm(t.pureEq)} />
        <Row label="Gross weight (w/ stones)" value={gm(t.grossWeight)} />
        <Row label={`Silver value @ ₹${data.baseRate}/g`} value={money(t.effectiveSilverValue)} />
        <Row label="Labour accrued" value={money(t.labour)} />
        {(t.wastageWeight > 0 || t.wastageValue > 0) && (
          <Row label="↳ incl. wastage" value={`${gm(t.wastageWeight)} · ${money(t.wastageValue)}`} />
        )}
        <Row label="Stones consumed" value={money(t.stonesConsumed)} />
        <Row label="Est. cost to date" value={money(t.estimatedCostToDate)} strong />
        <Row label="Today's sale value" value={money(t.todaysSaleValue)} />
      </div>
      <button onClick={() => toggle("material")} className="w-full px-3 py-1.5 text-[11px] text-blue-700 hover:bg-slate-50 text-left border-t border-slate-100">
        {openSection === "material" ? "▾" : "▸"} Material Breakdown
      </button>
      {openSection === "material" && <MaterialBreakdown data={data} onSaved={onSaved} />}

      <button onClick={() => toggle("labour")} className="w-full px-3 py-1.5 text-[11px] text-blue-700 hover:bg-slate-50 text-left border-t border-slate-100">
        {openSection === "labour" ? "▾" : "▸"} Labour Breakdown{ll.length > 0 ? ` (${ll.length})` : ""}
      </button>
      {openSection === "labour" && <LabourBreakdown lines={ll} total={t.labour} />}

      <button onClick={() => toggle("stones")} className="w-full px-3 py-1.5 text-[11px] text-blue-700 hover:bg-slate-50 text-left border-t border-slate-100">
        {openSection === "stones" ? "▾" : "▸"} Stones Breakdown{sl.length > 0 ? ` (${sl.length})` : ""}
      </button>
      {openSection === "stones" && <StonesBreakdown lines={sl} totals={t} byType={data.stonesByType} />}
    </div>
  );
}

function LabourBreakdown({ lines, total }: { lines: import("@jms/shared").LabourLine[]; total: number }) {
  if (lines.length === 0) return <div className="border-t border-slate-100 px-3 py-2.5 text-[11px] text-slate-400">No labour recorded yet.</div>;
  return (
    <div className="border-t border-slate-100 px-3 py-2.5 space-y-1.5">
      {lines.map((l, i) => (
        <div key={i} className="flex items-start justify-between text-[11px] gap-2">
          <div>
            <div className="text-slate-700">{l.stage} · {l.karigar}</div>
            <div className="text-slate-400">{l.basis}{l.basis !== "Flat" ? ` · ${l.qty} × ₹${l.rate}` : ""}</div>
          </div>
          <span className="mono text-slate-900 shrink-0">{money(l.amount)}</span>
        </div>
      ))}
      <div className="flex justify-between text-[11px] text-slate-700 font-medium border-t border-slate-50 mt-1 pt-1">
        <span>Total labour</span><span className="mono">{money(total)}</span>
      </div>
    </div>
  );
}

function StonesBreakdown({ lines, totals, byType }: { lines: import("@jms/shared").StoneLine[]; totals: JobCardDetail["totals"]; byType: JobCardDetail["stonesByType"] }) {
  if (lines.length === 0) return <div className="border-t border-slate-100 px-3 py-2.5 text-[11px] text-slate-400">No stones recorded yet.</div>;
  return (
    <div className="border-t border-slate-100 px-3 py-2.5 space-y-2.5">
      <div className="space-y-1.5">
        {lines.map((s, i) => (
          <div key={i} className="text-[11px]">
            <div className="flex items-start justify-between gap-2">
              <div className="text-slate-700">{s.stage} · {s.karigar} · {s.type}</div>
              <span className="mono text-slate-900 shrink-0">{money(s.netValue)}</span>
            </div>
            <div className="text-slate-400">
              Issued {s.qtyIssued || "—"} · {money(s.valueIssued)}
              {(s.valueReturned > 0 || s.qtyReturned) && ` → Returned ${s.qtyReturned || "—"} · ${money(s.valueReturned)}`}
            </div>
          </div>
        ))}
        <div className="flex justify-between text-[11px] text-slate-700 font-medium border-t border-slate-50 mt-1 pt-1">
          <span>Net consumed</span><span className="mono">{money(totals.stonesConsumed)}</span>
        </div>
      </div>
      {byType.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">By type</div>
          {byType.map((s) => (
            <div key={s.type} className="flex justify-between text-[11px] text-slate-600"><span>{s.type} ({s.carat.toFixed(2)}ct)</span><span className="mono">{money(s.value)}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

function MaterialBreakdown({ data, onSaved }: { data: JobCardDetail; onSaved: () => void }) {
  const t = data.totals;
  const jc = data.jobCard;
  const [manual, setManual] = useState(jc.manualSilverValue == null ? "" : String(jc.manualSilverValue));
  const [todayRate, setTodayRate] = useState(jc.todaysSilverRate == null ? "" : String(jc.todaysSilverRate));
  async function save() {
    await updateJobCardMeta(jc.id, {
      manualSilverValue: manual === "" ? null : Number(manual),
      todaysSilverRate: todayRate === "" ? null : Number(todayRate),
    });
    onSaved();
  }
  return (
    <div className="border-t border-slate-100 px-3 py-2.5 space-y-2.5">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Net Metal</div>
        <div className="text-[11px] text-slate-600">{gm(t.currentWeight)} @ {t.currentPurity} · value @ production rate ₹{t.productionRate.toFixed(2)}/g = {money(t.silverValue)}</div>
        <div className="flex items-center gap-2 mt-1.5">
          <label className="text-[11px] text-slate-500 w-32">Manual silver value ₹</label>
          <input type="number" placeholder="(auto)" className="h-7 w-24 px-1.5 border border-slate-200 rounded text-[11px] mono" value={manual} onChange={(e) => setManual(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 mt-1">
          <label className="text-[11px] text-slate-500 w-32">Today&apos;s silver rate ₹/g</label>
          <input type="number" placeholder={`(${data.baseRate})`} className="h-7 w-24 px-1.5 border border-slate-200 rounded text-[11px] mono" value={todayRate} onChange={(e) => setTodayRate(e.target.value)} />
        </div>
        <div className="text-[11px] text-emerald-700 font-medium mt-1">Today&apos;s sale value: {money(t.todaysSaleValue)}</div>
        <button onClick={save} className="mt-1.5 h-6 px-2 rounded bg-blue-800 text-white text-[11px]">Save overrides</button>
      </div>
      {(() => {
        const wl = wastageLines(jc);
        if (wl.length === 0) return null;
        return (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Wastage</div>
            {wl.map((w, i) => (
              <div key={i} className="flex justify-between text-[11px] text-slate-600">
                <span>{w.stage} · {w.karigar}{w.percent != null ? ` (${w.percent}%)` : ""}</span>
                <span className="mono">{gm(w.weight)} · {money(w.value)}</span>
              </div>
            ))}
            <div className="flex justify-between text-[11px] text-slate-700 font-medium border-t border-slate-50 mt-0.5 pt-0.5">
              <span>Total wastage</span><span className="mono">{gm(t.wastageWeight)} · {money(t.wastageValue)}</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function JobDetailsPanel({ jobNo, dueDate, pieceCount, notes, onSaved }: { jobNo: string; dueDate: string; pieceCount: number | null; notes: string; onSaved: () => void }) {
  const [edit, setEdit] = useState(false);
  const [due, setDue] = useState(dueDate || "");
  const [pcs, setPcs] = useState(pieceCount == null ? "" : String(pieceCount));
  const [note, setNote] = useState(notes || "");
  const overdue = dueDate && dueDate < new Date().toISOString().slice(0, 10);
  async function save() {
    await updateJobCardMeta(jobNo, { dueDate: due || null, pieceCount: pcs === "" ? null : Number(pcs), notes: note });
    setEdit(false); onSaved();
  }
  return (
    <div className="bg-white border border-slate-200 rounded-md">
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-slate-100">
        <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Job Details</span>
        <button onClick={() => setEdit((v) => !v)} className="text-[11px] text-blue-700 hover:underline">{edit ? "Cancel" : "Edit"}</button>
      </div>
      <div className="p-4 space-y-2 text-[12px]">
        {edit ? (
          <>
            <label className="block text-[11px] text-slate-500">Delivery Target</label>
            <input type="date" className="h-8 w-full px-2 border border-slate-200 rounded text-[12px]" value={due} onChange={(e) => setDue(e.target.value)} />
            <label className="block text-[11px] text-slate-500">Pieces</label>
            <input type="number" className="h-8 w-full px-2 border border-slate-200 rounded text-[12px] mono" value={pcs} onChange={(e) => setPcs(e.target.value)} />
            <label className="block text-[11px] text-slate-500">Notes</label>
            <textarea className="w-full px-2 py-1 border border-slate-200 rounded text-[12px]" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            <button onClick={save} className="h-7 px-3 rounded bg-blue-800 text-white text-[11px]">Save</button>
          </>
        ) : (
          <>
            <div className="flex justify-between"><span className="text-slate-500">Delivery Target</span><span className={`mono ${overdue ? "text-rose-600 font-medium" : "text-slate-900"}`}>{dueDate || "Not set"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Pieces</span><span className="mono text-slate-900">{pieceCount ?? "—"}</span></div>
            {notes && <div className="text-slate-600 pt-1 border-t border-slate-50">{notes}</div>}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Stage card ------------------------------- */
type Settings = NonNullable<ReturnType<typeof useProdSettings>["data"]>;
type Karigar = NonNullable<ReturnType<typeof useProdKarigars>["data"]>[number];

function StageCard({ jobNo, stage, pieceCount, targetPurity, karigars, settings, onChange }: {
  jobNo: string; stage: Stage; pieceCount: number | null; targetPurity: string;
  karigars: Karigar[]; settings: Settings; onChange: () => void;
}) {
  const [modal, setModal] = useState<null | { kind: string; assignment: Assignment; issue?: MaterialIssue; stone?: StoneEntry; labourRate?: number }>(null);
  const [adding, setAdding] = useState(false);
  const [newKarigar, setNewKarigar] = useState("");

  async function cancelReconcileIssue(issueId: string) {
    if (!confirm("Cancel this reconciliation? It reverts to pending and removes the auto-labour.")) return;
    await cancelReconcile(issueId);
    onChange();
  }

  const isMeenakari = stage.stage === "Meenakari";
  const isSetting = stage.stage === "Setting";
  const labourTotal = stage.assignments.flatMap((a) => a.labour).reduce((s, l) => s + l.amount, 0);
  // A stage is ready to lock when at least one karigar has produced output and
  // no material is still out un-reconciled. An idle karigar (added but nothing
  // recorded yet) must NOT block approval — otherwise a spare assignment strands
  // the whole stage; the manager can leave it or remove it. Output isn't always a
  // material issue (Jadai records only stones/labour), so "produced" = any of
  // issues / stones / labour / sub-items.
  const anyOutput = stage.assignments.some((a) => a.issues.length > 0 || a.stones.length > 0 || a.labour.length > 0 || a.subItems.length > 0);
  const noPendingIssues = stage.assignments.every((a) => a.issues.every((i) => i.status === "Reconciled"));
  const allReconciled = stage.assignments.length > 0 && anyOutput && noPendingIssues;

  async function removeKarigar(assignmentId: string, name: string) {
    if (!confirm(`Remove ${name} from ${stage.stage}? (Only works if nothing is recorded against them yet.)`)) return;
    try { await removeAssignment(assignmentId); onChange(); } catch (e) { alert((e as Error).message); }
  }
  async function removeIssueRow(issueId: string) {
    if (!confirm("Remove this issued material line?")) return;
    try { await removeIssue(issueId); onChange(); } catch (e) { alert((e as Error).message); }
  }
  async function removeStoneRow(stoneId: string) {
    if (!confirm("Remove this stone?")) return;
    try { await removeStone(stoneId); onChange(); } catch (e) { alert((e as Error).message); }
  }
  async function clearOutput(assignmentId: string, name: string) {
    if (!confirm(`Clear all of ${name}'s recorded ${stage.stage} output? This wipes their material / stones / labour on this stage (the karigar stays assigned).`)) return;
    try { await clearAssignmentOutput(assignmentId); onChange(); } catch (e) { alert((e as Error).message); }
  }

  async function addKarigar() {
    if (!newKarigar) return;
    await assignKarigar(jobNo, stage.stage, newKarigar);
    setAdding(false); setNewKarigar(""); onChange();
  }

  return (
    <div className="bg-white border border-slate-200 rounded overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50/60 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[13px] text-slate-900">{stage.stage} ({STAGE_HI[stage.stage]})</span>
          <StatusPill status={stage.status} />
          {labourTotal > 0 && <span className="text-[11px] mono text-slate-500">{money(labourTotal)}</span>}
        </div>
        <div className="flex items-center gap-2">
          {stage.status !== "Approved" && (
            <button onClick={() => setAdding(true)} className="h-7 px-2.5 rounded border border-slate-200 text-[11px] text-slate-700 hover:bg-slate-50">+ Add Karigar (जोड़ें)</button>
          )}
          {allReconciled && stage.status !== "Approved" && (
            <button onClick={async () => { await approveStage(jobNo, stage.stage); onChange(); }} className="h-7 px-2.5 rounded bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700">Approve Stage (स्वीकृत)</button>
          )}
          {stage.status === "Approved" && (
            <button
              onClick={async () => { if (confirm("Unlock this approved stage for editing? You can re-approve when done.")) { await unapproveStage(jobNo, stage.stage); onChange(); } }}
              className="h-7 px-2.5 rounded border border-amber-300 text-amber-800 text-[11px] font-medium hover:bg-amber-50">Edit Stage (संपादित करें)</button>
          )}
        </div>
      </div>

      <div className="p-2.5 space-y-2">
        {stage.assignments.length === 0 && <p className="text-[12px] text-slate-400 px-1">No karigar assigned to this stage yet.</p>}
        {stage.assignments.map((a) => {
          // Output is "recorded" once this karigar has produced anything on the
          // stage — a returned material issue, stones, labour or sub-items. Not
          // every stage writes a material issue (Jadai records only stones/labour),
          // so keying the Record→Edit flip off issues alone would strand them.
          const hasOutput = a.issues.length > 0 || a.stones.length > 0 || a.labour.length > 0 || a.subItems.length > 0;
          return (
          <div key={a.id} className="border border-slate-100 rounded p-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-1.5">
                <span className="text-[12px] font-medium text-slate-800">{a.karigar}</span>
                {stage.status !== "Approved" && !hasOutput && (
                  <button onClick={() => removeKarigar(a.id, a.karigar)} title="Remove this karigar (added by mistake)"
                    className="text-[11px] text-rose-500 hover:text-rose-700 leading-none">✕ remove</button>
                )}
              </span>
              {stage.status !== "Approved" && (
                <div className="flex gap-1.5">
                  {stage.stage === "Casting" && !hasOutput && <ActBtn onClick={() => setModal({ kind: "cast", assignment: a })}>Record Cast Output</ActBtn>}
                  {stage.stage === "Casting" && hasOutput && <ActBtn onClick={() => setModal({ kind: "castEdit", assignment: a })}>Edit Cast Output (संपादित करें)</ActBtn>}
                  {stage.stage === "Jadai" && !hasOutput && <ActBtn onClick={() => setModal({ kind: "jadai", assignment: a })}>Record Jadai Output</ActBtn>}
                  {stage.stage === "Jadai" && hasOutput && <ActBtn onClick={() => setModal({ kind: "jadaiEdit", assignment: a })}>Edit Jadai Output (संपादित करें)</ActBtn>}
                  {stage.stage === "Kundan" && !hasOutput && <ActBtn onClick={() => setModal({ kind: "kundan", assignment: a })}>Record Kundan Output</ActBtn>}
                  {stage.stage === "Kundan" && hasOutput && <ActBtn onClick={() => setModal({ kind: "kundanEdit", assignment: a })}>Edit Kundan Output (संपादित करें)</ActBtn>}
                  {stage.stage === "Fitting" && !hasOutput && <ActBtn onClick={() => setModal({ kind: "finding", assignment: a })}>Record Finding Output</ActBtn>}
                  {stage.stage === "Fitting" && hasOutput && <ActBtn onClick={() => setModal({ kind: "findingEdit", assignment: a })}>Edit Finding Output (संपादित करें)</ActBtn>}
                  {["Casting", "Jadai", "Kundan", "Fitting"].includes(stage.stage) && hasOutput && (
                    <button onClick={() => clearOutput(a.id, a.karigar)} title="Wipe this karigar's recorded output on this stage" className="h-6 px-2 rounded border border-rose-200 text-[11px] text-rose-600 hover:bg-rose-50">Remove output</button>
                  )}
                  {(isMeenakari || isSetting) && <ActBtn onClick={() => setModal({ kind: "issue", assignment: a })}>+ Issue Material</ActBtn>}
                  {isSetting && <ActBtn onClick={() => setModal({ kind: "stones", assignment: a })}>+ Issue Stones</ActBtn>}
                </div>
              )}
            </div>
            {/* Issues — wastage-tracking rows are 0-weight bookkeeping already shown
                in the labour note below, so they're skipped here to avoid a
                confusing "Bulk output → 0.000 g" line. */}
            {a.issues.filter((i) => !i.label?.startsWith("Wastage")).map((i) => (
              <div key={i.id} className="flex items-center justify-between text-[11px] text-slate-600 py-0.5">
                <span>
                  {i.fromBulkStock
                    ? (i.label || "Bulk output")
                    : `Issued ${gm(i.issuedWeight)} @ ${i.purity}`}
                  {i.status === "Reconciled" && ` → ${gm(i.returnedWeight)} @ ${i.returnedPurity}${i.dustWeight ? `, dust ${gm(i.dustWeight)}` : ""}${i.wastageWeight ? `, wastage ${gm(i.wastageWeight)}` : ""}`}
                  {!i.fromBulkStock && i.label ? ` (${i.label})` : ""}
                </span>
                {i.status === "Issued" && stage.status !== "Approved" && (
                  <span className="flex gap-1">
                    <ActBtn onClick={() => setModal({ kind: "reconcile", assignment: a, issue: i })}>Receive &amp; Reconcile</ActBtn>
                    <button onClick={() => removeIssueRow(i.id)} className="h-6 px-2 rounded border border-rose-200 text-[11px] text-rose-600 hover:bg-rose-50">Remove</button>
                  </span>
                )}
                {i.status === "Reconciled" && !i.fromBulkStock && stage.status !== "Approved" && (
                  <span className="flex gap-1">
                    <ActBtn onClick={() => setModal({ kind: "editReconcile", assignment: a, issue: i, labourRate: a.labour.find((l) => l.id === i.labourEntryId)?.rate })}>Edit</ActBtn>
                    <button onClick={() => cancelReconcileIssue(i.id)} className="h-6 px-2 rounded border border-rose-200 text-[11px] text-rose-600 hover:bg-rose-50">Cancel</button>
                  </span>
                )}
              </div>
            ))}
            {/* Sub-items (casting breakdown, karigar-wise) */}
            {a.subItems.length > 0 && (
              <div className="mt-1 ml-3 border-l-2 border-slate-100 pl-2">
                {a.subItems.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-[11px] text-slate-500 py-0.5">
                    <span className="text-slate-700 font-medium">{s.name}</span>
                    <span className="mono">{s.pieces} pcs</span>
                    <span className="mono">{s.weightG != null ? gm(s.weightG) : "—"}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Stones */}
            {a.stones.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-[11px] text-slate-500 py-0.5">
                <span>💎 {s.type} · {s.qtyIssued} · {money(s.valueIssued)}{s.valueReturned > 0 ? ` (returned ${s.caratReturned ? `${s.caratReturned}ct / ` : ""}${money(s.valueReturned)} — net ${money(s.valueIssued - s.valueReturned)})` : ""}</span>
                {stage.status !== "Approved" && (
                  <span className="flex gap-1">
                    <ActBtn onClick={() => setModal({ kind: "stoneEdit", assignment: a, stone: s })}>Edit</ActBtn>
                    <ActBtn onClick={() => setModal({ kind: "stoneReturn", assignment: a, stone: s })}>Return</ActBtn>
                    <button onClick={() => removeStoneRow(s.id)} className="h-6 px-2 rounded border border-rose-200 text-[11px] text-rose-600 hover:bg-rose-50">Remove</button>
                  </span>
                )}
              </div>
            ))}
            {/* Labour */}
            {a.labour.map((l) => (
              <div key={l.id} className="text-[11px] text-slate-500 py-0.5">🧾 {l.basis} · {money(l.amount)} <span className="text-slate-400">{l.note}</span></div>
            ))}
          </div>
          );
        })}
      </div>

      {adding && (
        <div className="px-3 pb-3 flex items-center gap-2">
          <select className="h-8 px-2 border border-slate-200 rounded text-[12px] flex-1" value={newKarigar} onChange={(e) => setNewKarigar(e.target.value)}>
            <option value="">Select karigar…</option>
            {[...karigars].sort((a, b) => (a.specialization === stage.stage ? -1 : 1) - (b.specialization === stage.stage ? -1 : 1)).map((k) => (
              <option key={k.id} value={k.id}>{k.name}{k.specialization ? ` · ${k.specialization}` : ""} (holding {k.balance.toFixed(1)}g)</option>
            ))}
          </select>
          <button onClick={addKarigar} disabled={!newKarigar} className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] disabled:opacity-50">Add</button>
          <button onClick={() => setAdding(false)} className="h-8 px-3 rounded border border-slate-200 text-[12px]">Cancel</button>
        </div>
      )}

      {modal && (
        <StageModal jobNo={jobNo} stage={stage} pieceCount={pieceCount} targetPurity={targetPurity} settings={settings}
          modal={modal} onClose={() => setModal(null)} onDone={() => { setModal(null); onChange(); }} />
      )}
    </div>
  );
}

function ActBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="h-6 px-2 rounded border border-blue-200 text-[11px] text-blue-700 hover:bg-blue-50">{children}</button>;
}

/* ------------------------------- Stage modals ----------------------------- */
function StageModal({ jobNo, stage, pieceCount, targetPurity, settings, modal, onClose, onDone }: {
  jobNo: string; stage: Stage; pieceCount: number | null; targetPurity: string; settings: Settings;
  modal: { kind: string; assignment: Assignment; issue?: MaterialIssue; stone?: StoneEntry; labourRate?: number }; onClose: () => void; onDone: () => void;
}) {
  const dr = settings.defaultRates;
  const pure = settings.tiers.find((x) => x.percent === 100)?.label ?? "24K";
  const isEdit = modal.kind === "editReconcile";
  // Jadai edit: prefill from the already-recorded output on this assignment.
  const isJadaiEdit = modal.kind === "jadaiEdit";
  const isCastEdit = modal.kind === "castEdit";
  const isFindingEdit = modal.kind === "findingEdit";
  const isKundanEdit = modal.kind === "kundanEdit";
  const isStoneEdit = modal.kind === "stoneEdit";
  const jIssue = isJadaiEdit ? modal.assignment.issues.find((i) => i.fromBulkStock) : undefined;
  const cIssue = isCastEdit ? modal.assignment.issues.find((i) => i.fromBulkStock) : undefined;
  const kIssue = isKundanEdit ? modal.assignment.issues.find((i) => i.fromBulkStock) : undefined;
  const jLabour = isJadaiEdit ? modal.assignment.labour.reduce((s, l) => s + l.amount, 0) : 0;
  const fLabour = isFindingEdit ? modal.assignment.labour.filter((l) => l.basis !== "Wastage %").reduce((s, l) => s + l.amount, 0) : 0;
  const kLabour = isKundanEdit ? modal.assignment.labour.reduce((s, l) => s + l.amount, 0) : 0;
  const pc0 = String(jIssue?.pieceCount ?? cIssue?.pieceCount ?? modal.issue?.pieceCount ?? pieceCount ?? 1);

  // shared fields
  const subNames = settings.subItemNames ?? [];
  const [subRows, setSubRows] = useState<{ name: string; pieces: string; weight: string }[]>(
    isCastEdit && modal.assignment.subItems.length > 0
      ? modal.assignment.subItems.map((s) => ({ name: s.name, pieces: String(s.pieces), weight: s.weightG != null ? String(s.weightG) : "" }))
      : [{ name: subNames[0]?.label ?? "", pieces: "", weight: "" }],
  );
  const subTotalPieces = subRows.reduce((s, r) => s + (Number(r.pieces) || 0), 0);
  const subTotalWeight = subRows.reduce((s, r) => s + (Number(r.weight) || 0), 0);
  const [wastagePercent, setWastagePercent] = useState(String(
    isCastEdit ? (cIssue?.wastagePercent ?? 0) : stage.stage === "Casting" ? dr.castingWastagePct : "",
  ));
  const [pieces, setPieces] = useState(pc0);
  const [weight, setWeight] = useState(
    isJadaiEdit && jIssue?.returnedWeight != null ? String(jIssue.returnedWeight)
      : isKundanEdit && kIssue?.returnedWeight != null ? String(kIssue.returnedWeight)
      : "",
  );
  const [dust, setDust] = useState(isEdit ? String(modal.issue?.dustWeight ?? 0) : "0");
  const [workType, setWorkType] = useState(isEdit ? (modal.issue?.label ?? "") : (settings.workTypeNames?.[0]?.label ?? ""));
  const [ratePerGm, setRatePerGm] = useState(isEdit && modal.labourRate != null ? String(modal.labourRate) : String(dr.meenakariRatePerGm));
  const [flat, setFlat] = useState(isEdit && modal.labourRate != null ? String(modal.labourRate) : "");
  const [labourAmount, setLabourAmount] = useState((isJadaiEdit && jLabour > 0) ? String(jLabour) : (isFindingEdit && fLabour > 0) ? String(fLabour) : (isKundanEdit && kLabour > 0) ? String(kLabour) : "");
  const [stoneType, setStoneType] = useState(isStoneEdit ? (modal.stone?.type ?? "") : "Polki");
  const [stoneCarat, setStoneCarat] = useState(isStoneEdit && modal.stone?.carat != null ? String(modal.stone.carat) : "");
  const [stoneRate, setStoneRate] = useState(isStoneEdit && modal.stone?.ratePerCarat != null ? String(modal.stone.ratePerCarat) : "");
  const [stonePieces, setStonePieces] = useState(isStoneEdit && modal.stone?.piecesCount != null ? String(modal.stone.piecesCount) : "");
  // stone return
  const [retCarat, setRetCarat] = useState("");
  const [retPieces, setRetPieces] = useState("");
  const [retValue, setRetValue] = useState("");
  // multi-row inputs (Jadai stones, Fitting findings + other items)
  const [stoneRows, setStoneRows] = useState<{ name: string; pieces: string; carat: string; rate: string }[]>(
    isJadaiEdit && modal.assignment.stones.length > 0
      ? modal.assignment.stones.map((s) => ({ name: s.type, pieces: s.piecesCount != null ? String(s.piecesCount) : "", carat: s.carat != null ? String(s.carat) : "", rate: s.ratePerCarat != null ? String(s.ratePerCarat) : "" }))
      : [{ name: "Polki", pieces: "", carat: "", rate: "" }],
  );
  const findingIssues = isFindingEdit ? modal.assignment.issues.filter((i) => !i.label?.startsWith("Wastage")) : [];
  const findingWastageOf = (type: string) => modal.assignment.issues.find((i) => i.label === `Wastage — ${type}`)?.wastagePercent ?? 0;
  const [findingRows, setFindingRows] = useState<{ type: string; weight: string; karat: string; wastagePercent: string }[]>(
    findingIssues.length > 0
      ? findingIssues.map((i) => ({ type: i.label ?? "Finding", weight: i.returnedWeight != null ? String(i.returnedWeight) : "", karat: i.returnedPurity ?? pure, wastagePercent: String(findingWastageOf(i.label ?? "Finding")) }))
      : [{ type: "Wire", weight: "", karat: pure, wastagePercent: String(dr.fittingWastagePct) }],
  );
  const [itemRows, setItemRows] = useState<{ type: string; amount: string; carat: string }[]>(
    isFindingEdit && modal.assignment.stones.length > 0
      ? modal.assignment.stones.map((s) => ({ type: s.type, amount: String(s.valueIssued), carat: s.carat != null ? String(s.carat) : "" }))
      : [],
  );
  const [busy, setBusy] = useState(false);

  const issue = modal.issue;
  const issuedW = Number(issue?.issuedWeight ?? 0);
  const finished = +(issuedW - (Number(dust) || 0)).toFixed(3);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); onDone(); } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  }

  const title: Record<string, string> = {
    cast: "Record Cast Output", castEdit: "Edit Cast Output (संपादित करें)", jadai: "Record Jadai Output", jadaiEdit: "Edit Jadai Output (संपादित करें)", kundan: "Record Kundan Output", kundanEdit: "Edit Kundan Output (संपादित करें)", finding: "Record Finding Output", findingEdit: "Edit Finding Output (संपादित करें)",
    issue: `Issue Material — ${stage.stage}`, reconcile: `Receive & Reconcile — ${stage.stage}`,
    editReconcile: `Edit Output — ${stage.stage}`, stones: "Issue Stones", stoneEdit: "Edit Stone (संपादित करें)",
    stoneReturn: "Return Stones (वापसी)",
  };

  // stone-return derived amount: auto = returned carat × original ₹/carat, unless overridden
  const st = modal.stone;
  const stRate = st?.ratePerCarat ?? (st && st.carat ? st.valueIssued / st.carat : 0);
  const retValueAuto = +(((Number(retCarat) || 0) * (stRate || 0))).toFixed(2);
  const retValueEff = retValue !== "" ? Number(retValue) : retValueAuto;

  // Jadai labour derived amount: auto = total stone pieces × Settings' ₹/stone
  // rate, unless overridden — same auto/override pattern as stone-return above.
  const jadaiStonePieces = stoneRows.reduce((s, r) => s + (Number(r.pieces) || 0), 0);
  const jadaiLabourAuto = +(jadaiStonePieces * dr.jadaiRatePerStone).toFixed(2);
  const jadaiLabourEff = labourAmount !== "" ? Number(labourAmount) : jadaiLabourAuto;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-md shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">{title[modal.kind]}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="p-4 space-y-3">
          {(modal.kind === "cast" || modal.kind === "castEdit") && (<>
            {modal.kind === "castEdit" && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">Editing recorded output — correct the sub-item rows / wastage, then Confirm. This replaces the earlier entry.</p>
            )}
            <p className="text-[11px] text-slate-500">Purity locked to {targetPurity}. Drawn from karigar&apos;s 24K running stock. Break the output down row-wise — sub-item name, pieces and weight.</p>
            <div className="border-t border-slate-100 pt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-slate-600">Sub-items (उप-आइटम)</span>
                <button type="button" onClick={() => setSubRows((r) => [...r, { name: subNames[0]?.label ?? "", pieces: "", weight: "" }])} className="h-6 px-2 rounded border border-slate-200 text-[11px] hover:bg-slate-50">+ Add Row</button>
              </div>
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 mb-1 text-[10px] text-slate-400 px-0.5">
                <span>Name (नाम)</span><span>Pieces</span><span>Weight (g)</span><span></span>
              </div>
              {subNames.length === 0 && <p className="text-[11px] text-amber-700">No sub-item names configured — add them in Settings first.</p>}
              {subRows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 mb-1.5 items-center">
                  <select className="h-8 px-1 border border-slate-200 rounded text-[11px] min-w-0 w-full" value={row.name} onChange={(e) => setSubRows((r) => r.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}>
                    {subNames.map((t) => <option key={t.id} value={t.label}>{t.label}</option>)}
                  </select>
                  <input placeholder="Pcs" className="h-8 px-1.5 border border-slate-200 rounded text-[11px] mono min-w-0 w-full" value={row.pieces} onChange={(e) => setSubRows((r) => r.map((x, i) => i === idx ? { ...x, pieces: e.target.value } : x))} />
                  <input placeholder="g" className="h-8 px-1.5 border border-slate-200 rounded text-[11px] mono min-w-0 w-full" value={row.weight} onChange={(e) => setSubRows((r) => r.map((x, i) => i === idx ? { ...x, weight: e.target.value } : x))} />
                  <button type="button" onClick={() => setSubRows((r) => r.filter((_, i) => i !== idx))} className="text-rose-500 text-[13px] w-5">✕</button>
                </div>
              ))}
              <p className="text-[11px] text-emerald-700 font-medium mt-1">Total: {subTotalPieces} pcs · {subTotalWeight.toFixed(3)} g</p>
            </div>
            <F label="Wastage % (charged as extra silver weight)"><I value={wastagePercent} onChange={setWastagePercent} step="0.1" /></F>
          </>)}

          {(modal.kind === "jadai" || modal.kind === "jadaiEdit") && (<>
            {modal.kind === "jadaiEdit" && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">Editing recorded output — correct the pieces / stone rates / labour, then Confirm. This replaces the earlier entry. (Kundan gold is recorded in the Kundan stage.)</p>
            )}
            <F label="Number of pieces *"><I value={pieces} onChange={setPieces} step="1" /></F>
            <F label={`Labour (₹) — auto: ${jadaiStonePieces} pcs × ₹${dr.jadaiRatePerStone}/stone`}>
              <I value={labourAmount} onChange={setLabourAmount} step="1" placeholder={String(jadaiLabourAuto)} />
            </F>
            {labourAmount === "" && jadaiLabourAuto > 0 && <p className="text-[11px] text-emerald-700 -mt-2">Will charge {money(jadaiLabourAuto)} (edit above to override)</p>}
            <div className="border-t border-slate-100 pt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-slate-600">Polki / Diamond</span>
                <button type="button" onClick={() => setStoneRows((r) => [...r, { name: "", pieces: "", carat: "", rate: "" }])} className="h-6 px-2 rounded border border-slate-200 text-[11px] hover:bg-slate-50">+ Add Stone</button>
              </div>
              {stoneRows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-1.5 mb-1.5 items-center">
                  <input placeholder="Name" className="h-8 px-1.5 border border-slate-200 rounded text-[11px] min-w-0 w-full" value={row.name} onChange={(e) => setStoneRows((r) => r.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} />
                  <input placeholder="Pcs" className="h-8 px-1.5 border border-slate-200 rounded text-[11px] mono min-w-0 w-full" value={row.pieces} onChange={(e) => setStoneRows((r) => r.map((x, i) => i === idx ? { ...x, pieces: e.target.value } : x))} />
                  <input placeholder="Carat" className="h-8 px-1.5 border border-slate-200 rounded text-[11px] mono min-w-0 w-full" value={row.carat} onChange={(e) => setStoneRows((r) => r.map((x, i) => i === idx ? { ...x, carat: e.target.value } : x))} />
                  <input placeholder="₹/ct" className="h-8 px-1.5 border border-slate-200 rounded text-[11px] mono min-w-0 w-full" value={row.rate} onChange={(e) => setStoneRows((r) => r.map((x, i) => i === idx ? { ...x, rate: e.target.value } : x))} />
                  <button type="button" onClick={() => setStoneRows((r) => r.filter((_, i) => i !== idx))} className="text-rose-500 text-[13px] w-5">✕</button>
                </div>
              ))}
            </div>
          </>)}

          {(modal.kind === "kundan" || modal.kind === "kundanEdit") && (<>
            {modal.kind === "kundanEdit" && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">Editing recorded output — correct the kundan gold weight / labour, then Confirm. This replaces the earlier entry.</p>
            )}
            <p className="text-[11px] text-slate-500">Kundan gold is set onto the piece here — its weight adds to the piece&apos;s net metal @ {pure}.</p>
            <F label={`Kundan gold weight (g) @ ${pure} *`}><I value={weight} onChange={setWeight} /></F>
            <F label="Labour (₹) — manual"><I value={labourAmount} onChange={setLabourAmount} step="1" /></F>
          </>)}

          {(modal.kind === "finding" || modal.kind === "findingEdit") && (<>
            {modal.kind === "findingEdit" && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">Editing recorded output — correct findings / items / labour, then Confirm. This replaces the earlier entry.</p>
            )}
            <F label="Number of pieces *"><I value={pieces} onChange={setPieces} step="1" /></F>
            <F label="Labour (₹) — flat"><I value={labourAmount} onChange={setLabourAmount} step="1" /></F>
            <div className="border-t border-slate-100 pt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-slate-600">Silver Findings</span>
                <button type="button" onClick={() => setFindingRows((r) => [...r, { type: settings.findingNames?.[0]?.label ?? "Wire", weight: "", karat: pure, wastagePercent: String(dr.fittingWastagePct) }])} className="h-6 px-2 rounded border border-slate-200 text-[11px] hover:bg-slate-50">+ Add Finding</button>
              </div>
              {(settings.findingNames?.length ?? 0) === 0 && <p className="text-[11px] text-amber-700 mb-1">No finding names configured — add them in Settings first.</p>}
              <div className="grid grid-cols-[1fr_0.8fr_0.8fr_0.8fr_auto] gap-1.5 mb-1 text-[10px] text-slate-400 px-0.5">
                <span>Type</span><span>Weight (g)</span><span>Purity</span><span>Wastage %</span><span></span>
              </div>
              {findingRows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_0.8fr_0.8fr_0.8fr_auto] gap-1.5 mb-1.5 items-center">
                  <select className="h-8 px-1 border border-slate-200 rounded text-[11px] min-w-0 w-full" value={row.type} onChange={(e) => setFindingRows((r) => r.map((x, i) => i === idx ? { ...x, type: e.target.value } : x))}>
                    {!settings.findingNames?.some((n) => n.label === row.type) && row.type && <option value={row.type}>{row.type}</option>}
                    {settings.findingNames?.map((n) => <option key={n.id} value={n.label}>{n.label}</option>)}
                  </select>
                  <input placeholder="Weight g" className="h-8 px-1.5 border border-slate-200 rounded text-[11px] mono min-w-0 w-full" value={row.weight} onChange={(e) => setFindingRows((r) => r.map((x, i) => i === idx ? { ...x, weight: e.target.value } : x))} />
                  <select className="h-8 px-1 border border-slate-200 rounded text-[11px] min-w-0 w-full" value={row.karat} onChange={(e) => setFindingRows((r) => r.map((x, i) => i === idx ? { ...x, karat: e.target.value } : x))}>
                    {settings.tiers.map((t) => <option key={t.label} value={t.label}>{t.label}</option>)}
                  </select>
                  <input placeholder="%" className="h-8 px-1.5 border border-slate-200 rounded text-[11px] mono min-w-0 w-full" value={row.wastagePercent} onChange={(e) => setFindingRows((r) => r.map((x, i) => i === idx ? { ...x, wastagePercent: e.target.value } : x))} />
                  <button type="button" onClick={() => setFindingRows((r) => r.filter((_, i) => i !== idx))} className="text-rose-500 text-[13px] w-5">✕</button>
                </div>
              ))}
              <p className="text-[11px] text-slate-500 mt-0.5">
                Findings total: {findingRows.reduce((s, r) => s + (Number(r.weight) || 0), 0).toFixed(3)} g
                {" · "}Wastage (priced @ pure): {findingRows.reduce((s, r) => s + (Number(r.weight) || 0) * (Number(r.wastagePercent) || 0) / 100, 0).toFixed(3)} g
                {" ("}₹{findingRows.reduce((s, r) => s + (Number(r.weight) || 0) * (Number(r.wastagePercent) || 0) / 100 * settings.baseRate, 0).toFixed(0)})
              </p>
            </div>
            <div className="border-t border-slate-100 pt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-slate-600">Other Flat Items</span>
                <button type="button" onClick={() => setItemRows((r) => [...r, { type: "Stone", amount: "", carat: "" }])} className="h-6 px-2 rounded border border-slate-200 text-[11px] hover:bg-slate-50">+ Add Item</button>
              </div>
              {itemRows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 mb-1.5 items-center">
                  <input placeholder="Type" className="h-8 px-1.5 border border-slate-200 rounded text-[11px] min-w-0 w-full" value={row.type} onChange={(e) => setItemRows((r) => r.map((x, i) => i === idx ? { ...x, type: e.target.value } : x))} />
                  <input placeholder="Amount ₹" className="h-8 px-1.5 border border-slate-200 rounded text-[11px] mono min-w-0 w-full" value={row.amount} onChange={(e) => setItemRows((r) => r.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))} />
                  <input placeholder="Carat (opt)" className="h-8 px-1.5 border border-slate-200 rounded text-[11px] mono min-w-0 w-full" value={row.carat} onChange={(e) => setItemRows((r) => r.map((x, i) => i === idx ? { ...x, carat: e.target.value } : x))} />
                  <button type="button" onClick={() => setItemRows((r) => r.filter((_, i) => i !== idx))} className="text-rose-500 text-[13px] w-5">✕</button>
                </div>
              ))}
            </div>
          </>)}

          {modal.kind === "issue" && (<>
            <p className="text-[11px] text-slate-500">Purity locked to {targetPurity}.</p>
            <F label="Weight (g) *"><I value={weight} onChange={setWeight} /></F>
            {stage.stage === "Setting" && <F label="Number of pieces *"><I value={pieces} onChange={setPieces} step="1" /></F>}
          </>)}

          {(modal.kind === "reconcile" || isEdit) && (<>
            <p className="text-[11px] text-slate-500">Issued {gm(issuedW)} @ {issue?.purity}. Finished = issued − dust = <b>{gm(finished)}</b></p>
            <F label="Number of pieces *"><I value={pieces} onChange={setPieces} step="1" /></F>
            <F label="Dust recovered (g) *"><I value={dust} onChange={setDust} /></F>
            {stage.stage === "Meenakari"
              ? <F label="Labour rate (₹/gram on finished)"><I value={ratePerGm} onChange={setRatePerGm} step="1" /></F>
              : <F label="Labour (₹) — flat"><I value={flat} onChange={setFlat} step="1" /></F>}
            <F label="Work type (reference only — कोई असर नहीं)">
              <select className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={workType} onChange={(e) => setWorkType(e.target.value)}>
                <option value="">—</option>
                {!settings.workTypeNames?.some((n) => n.label === workType) && workType && <option value={workType}>{workType}</option>}
                {settings.workTypeNames?.map((n) => <option key={n.id} value={n.label}>{n.label}</option>)}
              </select>
            </F>
          </>)}

          {(modal.kind === "stones" || modal.kind === "stoneEdit") && (<>
            {modal.kind === "stoneEdit" && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">Editing an issued stone — correct the type / pieces / carat / rate, then Confirm. Value is recomputed as carat × ₹/ct.</p>
            )}
            <F label="Stone type"><input className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={stoneType} onChange={(e) => setStoneType(e.target.value)} /></F>
            <div className="grid grid-cols-3 gap-2">
              <F label="Pieces"><I value={stonePieces} onChange={setStonePieces} step="1" /></F>
              <F label="Carat"><I value={stoneCarat} onChange={setStoneCarat} step="0.01" /></F>
              <F label="₹/carat"><I value={stoneRate} onChange={setStoneRate} step="1" /></F>
            </div>
          </>)}

          {modal.kind === "stoneReturn" && st && (<>
            <p className="text-[11px] text-slate-500">
              Issued <b>{st.type}</b> · {st.qtyIssued} · {money(st.valueIssued)}
              {stRate ? ` (₹${stRate.toFixed(0)}/ct)` : ""}. Record what the karigar returns — it is deducted from net stone value and gross weight.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <F label="Pieces returned"><I value={retPieces} onChange={setRetPieces} step="1" /></F>
              <F label="Carat returned *"><I value={retCarat} onChange={setRetCarat} step="0.01" /></F>
            </div>
            <F label="Value returned ₹ (auto from ₹/ct)"><I value={retValue} onChange={setRetValue} step="1" /></F>
            <p className="text-[11px] text-emerald-700 font-medium">Deducting {retCarat || 0}ct · {money(retValueEff)} → net consumed {money(st.valueIssued - retValueEff)}</p>
          </>)}
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-3 rounded border border-slate-200 text-[12px]">Cancel</button>
          <button disabled={busy} className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] font-medium hover:bg-blue-900 disabled:opacity-50"
            onClick={() => run(async () => {
              const A = modal.assignment.id;
              if (modal.kind === "cast" || modal.kind === "castEdit") {
                const subItems = subRows.filter((r) => r.name.trim() && (Number(r.pieces) > 0 || Number(r.weight) > 0)).map((r) => ({ name: r.name.trim(), pieces: Number(r.pieces) || 0, weightG: r.weight !== "" ? Number(r.weight) : null }));
                if (subItems.length === 0) throw new Error("Add at least one sub-item row (pieces or weight).");
                const payload = { assignmentId: A, returnedWeight: subTotalWeight, wastagePercent: Number(wastagePercent) || 0, pieceCount: subTotalPieces, subItems };
                return modal.kind === "castEdit" ? editCastOutput(jobNo, payload) : castOutput(jobNo, payload);
              }
              if (modal.kind === "jadai" || modal.kind === "jadaiEdit") {
                if (!Number(pieces)) throw new Error("Enter the number of pieces.");
                const stones = stoneRows.filter((r) => r.name.trim() && Number(r.carat) > 0).map((r) => ({ name: r.name.trim(), pieces: Number(r.pieces) || 0, carat: Number(r.carat), rate: Number(r.rate) || 0 }));
                // Kundan gold is recorded in the dedicated Kundan stage, not here.
                const payload = { assignmentId: A, weight: 0, labourAmount: jadaiLabourEff, pieceCount: Number(pieces), stones };
                return modal.kind === "jadaiEdit" ? editJadaiOutput(jobNo, payload) : jadaiOutput(jobNo, payload);
              }
              if (modal.kind === "kundan" || modal.kind === "kundanEdit") {
                if (!Number(weight)) throw new Error("Enter the kundan gold weight.");
                const payload = { assignmentId: A, weight: Number(weight), labourAmount: Number(labourAmount) || 0 };
                return modal.kind === "kundanEdit" ? editKundanOutput(jobNo, payload) : kundanOutput(jobNo, payload);
              }
              if (modal.kind === "finding" || modal.kind === "findingEdit") {
                if (!Number(pieces)) throw new Error("Enter the number of pieces.");
                const findings = findingRows.filter((r) => Number(r.weight) > 0).map((r) => ({ type: r.type || "Finding", weight: Number(r.weight), karat: r.karat || pure, wastagePercent: Number(r.wastagePercent) || 0 }));
                const items = itemRows.filter((r) => Number(r.amount) > 0).map((r) => ({ type: r.type || "Item", amount: Number(r.amount), carat: Number(r.carat) || 0 }));
                const payload = { assignmentId: A, pieceCount: Number(pieces), labourAmount: Number(labourAmount) || 0, findings, items };
                return modal.kind === "findingEdit" ? editFindingOutput(jobNo, payload) : findingOutput(jobNo, payload);
              }
              if (modal.kind === "issue") return issueMaterial(A, { purity: targetPurity, issuedWeight: Number(weight), pieceCount: Number(pieces) || undefined });
              if (modal.kind === "reconcile" || isEdit) {
                if (finished < 0) throw new Error(`Dust recovered (${gm(Number(dust) || 0)}) can't be more than the issued weight (${gm(issuedW)}).`);
                const body: Record<string, unknown> = { returnedWeight: finished, returnedPurity: issue?.purity ?? targetPurity, dustWeight: Number(dust) || 0, pieceCount: Number(pieces), workType };
                if (stage.stage === "Meenakari") body.ratePerGm = Number(ratePerGm) || 0;
                else body.flatLabourAmount = Number(flat) || 0;
                return isEdit ? editReconcile(issue!.id, body) : reconcile(issue!.id, body);
              }
              if (modal.kind === "stones") {
                const carat = Number(stoneCarat) || 0; const rate = Number(stoneRate) || 0;
                return issueStones(A, { type: stoneType, qtyIssued: `${stonePieces || 0} pcs / ${carat} ct`, valueIssued: +(carat * rate).toFixed(2), piecesCount: Number(stonePieces) || null, carat: carat || null, ratePerCarat: rate || null });
              }
              if (modal.kind === "stoneEdit" && modal.stone) {
                if (!stoneType.trim()) throw new Error("Enter the stone type.");
                return editStone(modal.stone.id, { type: stoneType.trim(), piecesCount: stonePieces === "" ? null : Number(stonePieces), carat: stoneCarat === "" ? null : Number(stoneCarat), ratePerCarat: stoneRate === "" ? null : Number(stoneRate) });
              }
              if (modal.kind === "stoneReturn" && st) {
                const carat = Number(retCarat) || 0;
                return returnStones(st.id, { qtyReturned: `${retPieces || 0} pcs / ${carat} ct`, valueReturned: retValueEff, caratReturned: carat || null });
              }
            })}>
            {busy ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportPdfModal({ jobNo, onClose }: { jobNo: string; onClose: () => void }) {
  const [profitPct, setProfitPct] = useState("0");
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      await openAuthenticated(`/api/production/job-cards/${jobNo}/pdf?profitPct=${Number(profitPct) || 0}`);
      onClose();
    } catch (e) {
      alert((e as Error).message || "Failed to generate PDF");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-md shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100"><h2 className="text-[14px] font-semibold">Export PDF</h2></div>
        <div className="p-4 space-y-3">
          <p className="text-[11px] text-slate-500">Metal / stones / labour breakdown, item photo, and a costing summary — ready to print or share.</p>
          <F label="Profit % (for Grand Total — optional)"><I value={profitPct} onChange={setProfitPct} step="0.1" /></F>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-3 rounded border border-slate-200 text-[12px]">Cancel</button>
          <button disabled={busy} onClick={download} className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] font-medium disabled:opacity-50">{busy ? "Generating…" : "Download PDF"}</button>
        </div>
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{label}</label>{children}</div>;
}
function I({ value, onChange, step = "0.001", placeholder = "0" }: { value: string; onChange: (v: string) => void; step?: string; placeholder?: string }) {
  return <input type="number" step={step} min="0" className="w-full h-9 px-2 border border-slate-200 rounded text-[12px] mono" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
}

function ReopenModal({ onClose, onDone }: { onClose: () => void; onDone: (reason: string, by: string) => void }) {
  const [reason, setReason] = useState("");
  const [by, setBy] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-md shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100"><h2 className="text-[14px] font-semibold">Reopen (Audited)</h2></div>
        <div className="p-4 space-y-3">
          <F label="Reason *"><input className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={reason} onChange={(e) => setReason(e.target.value)} /></F>
          <F label="Approved by *"><input className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={by} onChange={(e) => setBy(e.target.value)} /></F>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-3 rounded border border-slate-200 text-[12px]">Cancel</button>
          <button disabled={!reason || !by} onClick={() => onDone(reason, by)} className="h-8 px-3 rounded bg-amber-600 text-white text-[12px] font-medium disabled:opacity-50">Reopen</button>
        </div>
      </div>
    </div>
  );
}
