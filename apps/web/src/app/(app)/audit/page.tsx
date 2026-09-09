"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks";

interface AuditItem {
  id: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "APPROVE";
  entityType: string;
  entityId: string;
  beforeJson: unknown;
  afterJson: unknown;
  ipAddress: string | null;
  createdAt: string;
  user: { name: string; role: string } | null;
}
interface AuditResp {
  items: AuditItem[];
  total: number;
  page: number;
  pageSize: number;
}

const ACTION_STYLE: Record<AuditItem["action"], string> = {
  CREATE: "bg-emerald-100 text-emerald-800",
  UPDATE: "bg-blue-100 text-blue-800",
  DELETE: "bg-rose-100 text-rose-700",
  APPROVE: "bg-amber-100 text-amber-800",
};

const ENTITY_OPTIONS = [
  { value: "", label: "All records" },
  { value: "ProdJobCard", label: "Job cards" },
  { value: "AppRole", label: "Roles" },
  { value: "ChangeRequest", label: "Change requests" },
  { value: "User", label: "Users" },
];

export default function AuditPage() {
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const qs = new URLSearchParams({ pageSize: "100" });
  if (entityType) qs.set("entityType", entityType);
  const { data } = useApi<AuditResp>(`/api/audit-logs?${qs.toString()}`);

  const items = (data?.items ?? []).filter((i) => !action || i.action === action);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-[18px] font-semibold text-slate-900">Audit Log</h1>
          <p className="text-[12px] text-slate-500">Every create, update, delete and approval — who did it and when.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className="h-8 px-2 rounded border border-slate-200 text-[12px]">
            {ENTITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={action} onChange={(e) => setAction(e.target.value)} className="h-8 px-2 rounded border border-slate-200 text-[12px]">
            <option value="">All actions</option>
            {["CREATE", "UPDATE", "DELETE", "APPROVE"].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <table className="w-full border-collapse">
          <thead className="bg-slate-50">
            <tr className="h-9 text-left border-b border-slate-200">
              {["When", "Who", "Action", "Record", "Details"].map((h) => (
                <th key={h} className="px-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!data && <tr><td colSpan={5} className="py-8 text-center text-[12px] text-slate-400">Loading…</td></tr>}
            {data && items.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-[12px] text-slate-400">No matching audit entries.</td></tr>}
            {items.map((i) => {
              const snap = (i.action === "DELETE" ? i.beforeJson : i.afterJson) ?? i.beforeJson;
              return (
                <tr key={i.id} className="border-b border-slate-50 align-top">
                  <td className="px-3 py-2 text-[11px] mono text-slate-500 whitespace-nowrap">{new Date(i.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2 text-[11px] text-slate-700 whitespace-nowrap">{i.user?.name ?? "—"}<div className="text-[10px] text-slate-400">{i.user?.role}</div></td>
                  <td className="px-3 py-2"><span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${ACTION_STYLE[i.action]}`}>{i.action}</span></td>
                  <td className="px-3 py-2 text-[11px] text-slate-700">{i.entityType}<div className="text-[10px] mono text-slate-400">{i.entityId.slice(0, 10)}</div></td>
                  <td className="px-3 py-2 text-[11px] text-slate-600 max-w-[420px]">
                    {snap ? <pre className="whitespace-pre-wrap break-words text-[10px] text-slate-500 font-mono">{JSON.stringify(snap, null, 0)}</pre> : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
