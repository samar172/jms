"use client";

import { useRouter } from "next/navigation";
import { useProdKarigars, useJobCards } from "@/lib/production";
import { StatusPill } from "../job-cards/page";

const money = (v: number) => `₹ ${Math.round(v).toLocaleString("en-IN")}`;
const gm = (v: number) => `${v.toFixed(3)} g`;
const STAGES = ["Casting", "Meenakari", "Jadai", "Setting", "Fitting"];

export default function DashboardPage() {
  const router = useRouter();
  const { data: karigars } = useProdKarigars();
  const { data: jobCards } = useJobCards();

  const rows = jobCards ?? [];
  const open = rows.filter((r) => r.status !== "Closed");
  const silverHeld = (karigars ?? []).reduce((s, k) => s + Math.max(0, k.balance), 0);
  const labourAccrued = rows.reduce((s, r) => s + r.labour, 0);
  const queue: Record<string, number> = {};
  for (const st of STAGES) queue[st] = open.filter((r) => r.activeStage === st).length;
  const needsAttention = open.filter((r) => r.status === "On Hold" || r.status === "Reconciliation");

  return (
    <div className="flex flex-col">
      <h1 className="text-[20px] font-semibold text-slate-900 mb-4">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi label="Silver held by karigars" value={gm(silverHeld)} tone="amber" onClick={() => router.push("/karigars")} />
        <Kpi label="Labour accrued" value={money(labourAccrued)} />
        <Kpi label="Open job cards" value={String(open.length)} onClick={() => router.push("/job-cards")} />
        <Kpi label="Needs attention" value={String(needsAttention.length)} tone={needsAttention.length ? "rose" : undefined} />
      </div>

      <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mb-4">
        {STAGES.map((st) => (
          <div key={st} className="bg-white border border-slate-200 rounded-md p-2.5 text-center">
            <div className="text-[9.5px] uppercase tracking-wider text-slate-400 font-semibold">{st}</div>
            <div className={`text-[20px] font-semibold mt-0.5 ${queue[st] > 0 ? "text-slate-900" : "text-slate-300"}`}>{queue[st]}</div>
          </div>
        ))}
      </div>

      {needsAttention.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-md p-3 mb-4">
          <div className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider mb-2">Needs Attention</div>
          {needsAttention.map((r) => (
            <button key={r.id} onClick={() => router.push(`/job-cards/${r.id}`)} className="flex items-center gap-2 text-[12px] text-rose-800 hover:underline">
              <span className="mono">{r.id}</span> · {r.itemName} · {r.status}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-md">
        <div className="px-4 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-100 flex items-center justify-between">
          Open Job Cards
        </div>
        <table className="w-full border-collapse">
          <tbody>
            {open.slice(0, 8).map((r) => (
              <tr key={r.id} onClick={() => router.push(`/job-cards/${r.id}`)} className="border-b border-slate-50 h-10 cursor-pointer hover:bg-slate-50">
                <td className="px-4 text-[12px] mono text-blue-800">{r.id}</td>
                <td className="px-3 text-[12px] text-slate-900">{r.itemName}</td>
                <td className="px-3 text-[12px] text-slate-600">{r.activeStage ?? "Not issued"}</td>
                <td className="px-3"><StatusPill status={r.status} /></td>
              </tr>
            ))}
            {open.length === 0 && <tr><td className="px-4 py-8 text-center text-[12px] text-slate-400">No open job cards.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, onClick }: { label: string; value: string; tone?: "amber" | "rose"; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="text-left bg-white border border-slate-200 rounded-md p-3 hover:border-slate-300 disabled:cursor-default" disabled={!onClick}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</div>
      <div className={`text-[20px] font-semibold mt-0.5 mono ${tone === "amber" ? "text-amber-700" : tone === "rose" ? "text-rose-600" : "text-slate-900"}`}>{value}</div>
    </button>
  );
}
