"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  useJobCard, useProdKarigars, useProdSettings,
  assignKarigar, castOutput, issueMaterial, reconcile, editReconcile, cancelReconcile, jadaiOutput, findingOutput,
  issueStones, approveStage, closeJobCard, reopenJobCard, toggleHold,
  STAGE_HI, type JobCardDetail,
} from "@/lib/production";
import type { Stage, Assignment, MaterialIssue } from "@jms/shared";
import { StatusPill } from "../page";

const money = (v: number) => `₹ ${Math.round(v).toLocaleString("en-IN")}`;
const gm = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(3)} g`);

export default function JobCardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, mutate } = useJobCard(id);
  const { data: karigars } = useProdKarigars();
  const { data: settings } = useProdSettings();
  const [reopenOpen, setReopenOpen] = useState(false);

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
          <CostingSummary data={data} />
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
function CostingSummary({ data }: { data: JobCardDetail }) {
  const t = data.totals;
  const Row = SumRow;
  return (
    <div className="bg-white border border-slate-200 rounded-md">
      <div className="px-4 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-100">Costing Summary</div>
      <div className="divide-y divide-slate-50">
        <Row label={`Net Metal (${t.currentPurity})`} value={gm(t.currentWeight)} />
        <Row label="Pure equivalent" value={gm(t.pureEq)} />
        <Row label="Gross weight (w/ stones)" value={gm(t.grossWeight)} />
        <Row label={`Silver value @ ₹${data.baseRate}/g`} value={money(t.effectiveSilverValue)} />
        <Row label="Labour accrued" value={money(t.labour)} />
        <Row label="Stones consumed" value={money(t.stonesConsumed)} />
        <Row label="Est. cost to date" value={money(t.estimatedCostToDate)} strong />
        <Row label="Today's sale value" value={money(t.todaysSaleValue)} />
      </div>
      {data.stonesByType.length > 0 && (
        <div className="border-t border-slate-100 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Stones by type</div>
          {data.stonesByType.map((s) => (
            <div key={s.type} className="flex justify-between text-[11px] text-slate-600"><span>{s.type} ({s.carat.toFixed(2)}ct)</span><span className="mono">{money(s.value)}</span></div>
          ))}
        </div>
      )}
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
  const [modal, setModal] = useState<null | { kind: string; assignment: Assignment; issue?: MaterialIssue; labourRate?: number }>(null);
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
  const allReconciled = stage.assignments.length > 0 && stage.assignments.every((a) => {
    const hasWork = stage.stage === "Fitting" ? a.issues.length + a.labour.length + a.stones.length > 0 : a.issues.length > 0;
    return hasWork && a.issues.every((i) => i.status === "Reconciled");
  });

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
          <span className={`inline-flex items-center h-5 px-1.5 rounded border text-[11px] font-medium ${stage.status === "Approved" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : stage.status === "In Progress" ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>{stage.status}</span>
          {labourTotal > 0 && <span className="text-[11px] mono text-slate-500">{money(labourTotal)}</span>}
        </div>
        <div className="flex items-center gap-2">
          {stage.status !== "Approved" && (
            <button onClick={() => setAdding(true)} className="h-7 px-2.5 rounded border border-slate-200 text-[11px] text-slate-700 hover:bg-slate-50">+ Add Karigar</button>
          )}
          {allReconciled && stage.status !== "Approved" && (
            <button onClick={async () => { await approveStage(jobNo, stage.stage); onChange(); }} className="h-7 px-2.5 rounded bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700">Approve Stage</button>
          )}
        </div>
      </div>

      <div className="p-2.5 space-y-2">
        {stage.assignments.length === 0 && <p className="text-[12px] text-slate-400 px-1">No karigar assigned to this stage yet.</p>}
        {stage.assignments.map((a) => (
          <div key={a.id} className="border border-slate-100 rounded p-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] font-medium text-slate-800">{a.karigar}</span>
              {stage.status !== "Approved" && (
                <div className="flex gap-1.5">
                  {stage.stage === "Casting" && a.issues.length === 0 && <ActBtn onClick={() => setModal({ kind: "cast", assignment: a })}>Record Cast Output</ActBtn>}
                  {stage.stage === "Jadai" && a.issues.length === 0 && <ActBtn onClick={() => setModal({ kind: "jadai", assignment: a })}>Record Jadai Output</ActBtn>}
                  {stage.stage === "Fitting" && <ActBtn onClick={() => setModal({ kind: "finding", assignment: a })}>Record Finding Output</ActBtn>}
                  {(isMeenakari || isSetting) && <ActBtn onClick={() => setModal({ kind: "issue", assignment: a })}>+ Issue Material</ActBtn>}
                  {isSetting && <ActBtn onClick={() => setModal({ kind: "stones", assignment: a })}>+ Issue Stones</ActBtn>}
                </div>
              )}
            </div>
            {/* Issues */}
            {a.issues.map((i) => (
              <div key={i.id} className="flex items-center justify-between text-[11px] text-slate-600 py-0.5">
                <span>
                  {i.fromBulkStock ? "Bulk output" : `Issued ${gm(i.issuedWeight)} @ ${i.purity}`}
                  {i.status === "Reconciled" && ` → ${gm(i.returnedWeight)} @ ${i.returnedPurity}${i.dustWeight ? `, dust ${gm(i.dustWeight)}` : ""}${i.wastageWeight ? `, wastage ${gm(i.wastageWeight)}` : ""}`}
                </span>
                {i.status === "Issued" && stage.status !== "Approved" && (
                  <ActBtn onClick={() => setModal({ kind: "reconcile", assignment: a, issue: i })}>Receive &amp; Reconcile</ActBtn>
                )}
                {i.status === "Reconciled" && !i.fromBulkStock && stage.status !== "Approved" && (
                  <span className="flex gap-1">
                    <ActBtn onClick={() => setModal({ kind: "editReconcile", assignment: a, issue: i, labourRate: a.labour.find((l) => l.id === i.labourEntryId)?.rate })}>Edit</ActBtn>
                    <button onClick={() => cancelReconcileIssue(i.id)} className="h-6 px-2 rounded border border-rose-200 text-[11px] text-rose-600 hover:bg-rose-50">Cancel</button>
                  </span>
                )}
              </div>
            ))}
            {/* Stones */}
            {a.stones.map((s) => (
              <div key={s.id} className="text-[11px] text-slate-500 py-0.5">💎 {s.type} · {s.qtyIssued} · {money(s.valueIssued)}{s.valueReturned > 0 ? ` (returned ${money(s.valueReturned)})` : ""}</div>
            ))}
            {/* Labour */}
            {a.labour.map((l) => (
              <div key={l.id} className="text-[11px] text-slate-500 py-0.5">🧾 {l.basis} · {money(l.amount)} <span className="text-slate-400">{l.note}</span></div>
            ))}
          </div>
        ))}
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
  modal: { kind: string; assignment: Assignment; issue?: MaterialIssue; labourRate?: number }; onClose: () => void; onDone: () => void;
}) {
  const dr = settings.defaultRates;
  const pure = settings.tiers.find((x) => x.percent === 100)?.label ?? "24K";
  const isEdit = modal.kind === "editReconcile";
  const pc0 = String(modal.issue?.pieceCount ?? pieceCount ?? 1);

  // shared fields
  const [returnedWeight, setReturnedWeight] = useState("");
  const [wastagePercent, setWastagePercent] = useState(String(stage.stage === "Casting" ? dr.castingWastagePct : ""));
  const [pieces, setPieces] = useState(pc0);
  const [weight, setWeight] = useState("");
  const [dust, setDust] = useState(isEdit ? String(modal.issue?.dustWeight ?? 0) : "0");
  const [ratePerGm, setRatePerGm] = useState(isEdit && modal.labourRate != null ? String(modal.labourRate) : String(dr.meenakariRatePerGm));
  const [flat, setFlat] = useState(isEdit && modal.labourRate != null ? String(modal.labourRate) : "");
  const [labourAmount, setLabourAmount] = useState("");
  const [stoneType, setStoneType] = useState("Polki");
  const [stoneCarat, setStoneCarat] = useState("");
  const [stoneRate, setStoneRate] = useState("");
  const [stonePieces, setStonePieces] = useState("");
  const [busy, setBusy] = useState(false);

  const issue = modal.issue;
  const issuedW = Number(issue?.issuedWeight ?? 0);
  const finished = +(issuedW - (Number(dust) || 0)).toFixed(3);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); onDone(); } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  }

  const title: Record<string, string> = {
    cast: "Record Cast Output", jadai: "Record Jadai Output", finding: "Record Finding Output",
    issue: `Issue Material — ${stage.stage}`, reconcile: `Receive & Reconcile — ${stage.stage}`,
    editReconcile: `Edit Output — ${stage.stage}`, stones: "Issue Stones",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-md shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">{title[modal.kind]}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="p-4 space-y-3">
          {modal.kind === "cast" && (<>
            <F label="Returned weight (g) — finished piece(s) *"><I value={returnedWeight} onChange={setReturnedWeight} /></F>
            <p className="text-[11px] text-slate-500">Purity locked to {targetPurity}. Drawn from karigar&apos;s 24K running stock.</p>
            <F label="Number of pieces *"><I value={pieces} onChange={setPieces} step="1" /></F>
            <F label="Wastage % (charged as extra silver weight)"><I value={wastagePercent} onChange={setWastagePercent} step="0.1" /></F>
          </>)}

          {modal.kind === "jadai" && (<>
            <F label="Number of pieces *"><I value={pieces} onChange={setPieces} step="1" /></F>
            <F label={`Kundan gold weight (g) @ ${pure} *`}><I value={weight} onChange={setWeight} /></F>
            <F label="Labour (₹) — manual"><I value={labourAmount} onChange={setLabourAmount} step="1" /></F>
            <div className="border-t border-slate-100 pt-2">
              <div className="text-[11px] font-medium text-slate-600 mb-1">Polki / Diamond (optional)</div>
              <div className="grid grid-cols-4 gap-1.5">
                <input placeholder="Name" className="h-8 px-1.5 border border-slate-200 rounded text-[11px]" value={stoneType} onChange={(e) => setStoneType(e.target.value)} />
                <input placeholder="Pcs" className="h-8 px-1.5 border border-slate-200 rounded text-[11px]" value={stonePieces} onChange={(e) => setStonePieces(e.target.value)} />
                <input placeholder="Carat" className="h-8 px-1.5 border border-slate-200 rounded text-[11px]" value={stoneCarat} onChange={(e) => setStoneCarat(e.target.value)} />
                <input placeholder="₹/ct" className="h-8 px-1.5 border border-slate-200 rounded text-[11px]" value={stoneRate} onChange={(e) => setStoneRate(e.target.value)} />
              </div>
            </div>
          </>)}

          {modal.kind === "finding" && (<>
            <F label="Number of pieces *"><I value={pieces} onChange={setPieces} step="1" /></F>
            <F label={`Silver finding weight (g) @ ${pure}`}><I value={weight} onChange={setWeight} /></F>
            <F label="Finding type"><input className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={stoneType} onChange={(e) => setStoneType(e.target.value)} placeholder="Wire / Push Cap / Clip Cap" /></F>
            <F label="Labour (₹) — flat"><I value={labourAmount} onChange={setLabourAmount} step="1" /></F>
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
          </>)}

          {modal.kind === "stones" && (<>
            <F label="Stone type"><input className="w-full h-9 px-2 border border-slate-200 rounded text-[12px]" value={stoneType} onChange={(e) => setStoneType(e.target.value)} /></F>
            <div className="grid grid-cols-3 gap-2">
              <F label="Pieces"><I value={stonePieces} onChange={setStonePieces} step="1" /></F>
              <F label="Carat"><I value={stoneCarat} onChange={setStoneCarat} step="0.01" /></F>
              <F label="₹/carat"><I value={stoneRate} onChange={setStoneRate} step="1" /></F>
            </div>
          </>)}
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-3 rounded border border-slate-200 text-[12px]">Cancel</button>
          <button disabled={busy} className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] font-medium hover:bg-blue-900 disabled:opacity-50"
            onClick={() => run(async () => {
              const A = modal.assignment.id;
              if (modal.kind === "cast") return castOutput(jobNo, { assignmentId: A, returnedWeight: Number(returnedWeight), wastagePercent: Number(wastagePercent) || 0, pieceCount: Number(pieces) });
              if (modal.kind === "jadai") {
                const stones = stoneType && Number(stoneCarat) > 0 ? [{ name: stoneType, pieces: Number(stonePieces) || 0, carat: Number(stoneCarat), rate: Number(stoneRate) || 0 }] : [];
                return jadaiOutput(jobNo, { assignmentId: A, weight: Number(weight), labourAmount: Number(labourAmount) || 0, pieceCount: Number(pieces), stones });
              }
              if (modal.kind === "finding") {
                const findings = Number(weight) > 0 ? [{ type: stoneType || "Wire", weight: Number(weight), karat: pure }] : [];
                return findingOutput(jobNo, { assignmentId: A, pieceCount: Number(pieces), labourAmount: Number(labourAmount) || 0, findings, items: [] });
              }
              if (modal.kind === "issue") return issueMaterial(A, { purity: targetPurity, issuedWeight: Number(weight), pieceCount: Number(pieces) || undefined });
              if (modal.kind === "reconcile" || isEdit) {
                const body: Record<string, unknown> = { returnedWeight: finished, returnedPurity: issue?.purity ?? targetPurity, dustWeight: Number(dust) || 0, pieceCount: Number(pieces) };
                if (stage.stage === "Meenakari") body.ratePerGm = Number(ratePerGm) || 0;
                else body.flatLabourAmount = Number(flat) || 0;
                return isEdit ? editReconcile(issue!.id, body) : reconcile(issue!.id, body);
              }
              if (modal.kind === "stones") {
                const carat = Number(stoneCarat) || 0; const rate = Number(stoneRate) || 0;
                return issueStones(A, { type: stoneType, qtyIssued: `${stonePieces || 0} pcs / ${carat} ct`, valueIssued: +(carat * rate).toFixed(2), piecesCount: Number(stonePieces) || null, carat: carat || null, ratePerCarat: rate || null });
              }
            })}>
            {busy ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{label}</label>{children}</div>;
}
function I({ value, onChange, step = "0.001" }: { value: string; onChange: (v: string) => void; step?: string }) {
  return <input type="number" step={step} min="0" className="w-full h-9 px-2 border border-slate-200 rounded text-[12px] mono" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" />;
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
