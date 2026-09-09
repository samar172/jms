"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { RESOURCES, RESOURCE_LABELS, CHANGE_REQUEST_ACTIONS } from "@jms/shared";

interface CR {
  id: string;
  requester: { id: string; name: string } | null;
  reviewer: { id: string; name: string } | null;
  resource: string;
  targetId: string | null;
  action: string;
  summary: string;
  details: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "APPLIED" | "CANCELLED";
  reviewNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

const STATUS_STYLE: Record<CR["status"], string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-blue-100 text-blue-800",
  REJECTED: "bg-rose-100 text-rose-700",
  APPLIED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-slate-100 text-slate-500",
};

export default function RequestsPage() {
  const { user } = useAuth();
  const admin = !!user?.isSuperAdmin;
  const [scope, setScope] = useState<"mine" | "all">(admin ? "all" : "mine");
  const { data: rows, mutate } = useApi<CR[]>(
    `/api/change-requests${scope === "mine" ? "?mine=1" : ""}`,
  );
  const [showNew, setShowNew] = useState(false);

  async function decide(id: string, decision: "APPROVED" | "REJECTED") {
    const reviewNote = decision === "REJECTED" ? window.prompt("Reason (optional):") ?? undefined : undefined;
    await apiFetch(`/api/change-requests/${id}/decide`, { method: "PATCH", body: { decision, reviewNote } });
    await mutate();
  }
  async function markApplied(id: string) {
    await apiFetch(`/api/change-requests/${id}/applied`, { method: "PATCH" });
    await mutate();
  }
  async function cancel(id: string) {
    await apiFetch(`/api/change-requests/${id}/cancel`, { method: "PATCH" });
    await mutate();
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[18px] font-semibold text-slate-900">Change Requests</h1>
          <p className="text-[12px] text-slate-500">
            {admin
              ? "Approve or reject requests, then make the change and mark it applied."
              : "Ask an owner to add, update or delete something you can't change yourself."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {admin && (
            <div className="flex rounded border border-slate-200 overflow-hidden text-[12px]">
              {(["all", "mine"] as const).map((s) => (
                <button key={s} onClick={() => setScope(s)}
                  className={`px-3 h-8 ${scope === s ? "bg-blue-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                  {s === "all" ? "All" : "Mine"}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setShowNew(true)} className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] font-medium hover:bg-blue-900">
            + New Request
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <table className="w-full border-collapse">
          <thead className="bg-slate-50">
            <tr className="h-9 text-left border-b border-slate-200">
              {["Status", "Panel", "Action", "Summary", "By", "When", ""].map((h) => (
                <th key={h} className="px-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows && <tr><td colSpan={7} className="py-8 text-center text-[12px] text-slate-400">Loading…</td></tr>}
            {rows?.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-[12px] text-slate-400">No requests.</td></tr>}
            {rows?.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 align-top">
                <td className="px-3 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                </td>
                <td className="px-3 py-2 text-[11px] text-slate-700">{RESOURCE_LABELS[r.resource as keyof typeof RESOURCE_LABELS] ?? r.resource}</td>
                <td className="px-3 py-2 text-[11px] text-slate-600">{r.action}</td>
                <td className="px-3 py-2 text-[12px] text-slate-800">
                  {r.summary}
                  {r.details && <div className="text-[11px] text-slate-500 mt-0.5">{r.details}</div>}
                  {r.reviewNote && <div className="text-[11px] text-rose-500 mt-0.5">Note: {r.reviewNote}</div>}
                </td>
                <td className="px-3 py-2 text-[11px] text-slate-600">{r.requester?.name ?? "—"}</td>
                <td className="px-3 py-2 text-[11px] mono text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {admin && r.status === "PENDING" && (
                    <>
                      <button onClick={() => decide(r.id, "APPROVED")} className="text-[11px] text-emerald-700 hover:underline mr-2">Approve</button>
                      <button onClick={() => decide(r.id, "REJECTED")} className="text-[11px] text-rose-600 hover:underline">Reject</button>
                    </>
                  )}
                  {admin && r.status === "APPROVED" && (
                    <button onClick={() => markApplied(r.id)} className="text-[11px] text-blue-700 hover:underline">Mark applied</button>
                  )}
                  {!admin && r.status === "PENDING" && r.requester?.id === user?.id && (
                    <button onClick={() => cancel(r.id)} className="text-[11px] text-slate-500 hover:underline">Cancel</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNew && <NewRequest onClose={() => setShowNew(false)} onDone={() => { setShowNew(false); mutate(); }} />}
    </div>
  );
}

function NewRequest({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [resource, setResource] = useState<string>(RESOURCES[1]); // job_cards
  const [action, setAction] = useState<string>("UPDATE");
  const [targetId, setTargetId] = useState("");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setError(null);
    try {
      await apiFetch("/api/change-requests", {
        method: "POST",
        body: { resource, action, targetId: targetId || undefined, summary, details: details || undefined },
      });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not submit the request.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg w-[480px] max-w-[95vw] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100"><h2 className="text-[14px] font-semibold">New Change Request</h2></div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] text-slate-600">Panel</span>
              <select value={resource} onChange={(e) => setResource(e.target.value)} className="mt-1 h-8 w-full px-2 rounded border border-slate-200 text-[12px]">
                {RESOURCES.map((r) => <option key={r} value={r}>{RESOURCE_LABELS[r]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-600">Action</span>
              <select value={action} onChange={(e) => setAction(e.target.value)} className="mt-1 h-8 w-full px-2 rounded border border-slate-200 text-[12px]">
                {CHANGE_REQUEST_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-[11px] text-slate-600">Which record? (id / number, optional)</span>
            <input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="e.g. N-001, or a rate name" className="mt-1 h-8 w-full px-2 rounded border border-slate-200 text-[12px]" />
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-600">Summary</span>
            <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What do you want changed?" className="mt-1 h-8 w-full px-2 rounded border border-slate-200 text-[12px]" />
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-600">Details (optional)</span>
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} placeholder="Old value → new value, reason, etc." className="mt-1 w-full px-2 py-1.5 rounded border border-slate-200 text-[12px]" />
          </label>
          {error && <p className="text-[12px] text-rose-600">{error}</p>}
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-3 rounded border border-slate-200 text-[12px]">Cancel</button>
          <button onClick={submit} disabled={busy || summary.trim().length < 3} className="h-8 px-3 rounded bg-blue-800 text-white text-[12px] font-medium disabled:opacity-50">
            {busy ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </div>
    </div>
  );
}
