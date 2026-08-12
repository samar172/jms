"use client";

import Link from "next/link";
import { useApi, useKarigars, useProcessStages } from "@/lib/hooks";
import { formatWeight, formatINR, formatDate } from "@/lib/format";
import { FileText, Briefcase, Package, BadgeCheck, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { EstimateStatusPill } from "@/components/StatusPill";

interface JobStage {
  id: string;
  status: string;
  karigar?: { id: string; name: string } | null;
  processStage: { name: string; sequenceOrder: number };
}

interface JobCardRow {
  id: string;
  status: string;
  targetDeliveryDate: string | null;
  createdAt: string;
  product: { serialNo: string; designName: string; images: { thumbnailUrl: string }[] };
  stages: JobStage[];
}

interface EstimateRow {
  id: string;
  status: string;
  netAmount: string;
}

interface OwnerStats {
  goldInStockG: number;
  goldWithKarigarsG: number;
  jobsInProduction: number;
  overdueJobs: number;
  receivable: number;
  payableToKarigars: number;
  totalChizzatG: number;
  avgChizzatPct: number;
  pipeline: Record<string, number>;
  needsAttention: string[];
}

function activeStageOf(jc: JobCardRow) {
  const sorted = [...jc.stages].sort((a, b) => a.processStage.sequenceOrder - b.processStage.sequenceOrder);
  return sorted.find((s) => s.status !== "APPROVED" && s.status !== "PENDING") ?? sorted[sorted.length - 1];
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: ownerStats } = useApi<OwnerStats>("/api/dashboard/owner");
  const { data: jobCards } = useApi<JobCardRow[]>("/api/job-cards");
  const { data: estimates } = useApi<EstimateRow[]>("/api/estimates");
  const { data: processStages } = useProcessStages();
  const { data: karigars } = useKarigars();

  const pendingEst = estimates?.filter((e) => e.status === "DRAFT" || e.status === "SUBMITTED") ?? [];
  const pendingEstValue = pendingEst.reduce((s, e) => s + Number(e.netAmount), 0);
  
  const activeJobs = jobCards?.filter((j) => j.status !== "CLOSED") ?? [];
  const overdueJobs = activeJobs.filter((j) => j.targetDeliveryDate && new Date(j.targetDeliveryDate) < new Date());
  
  const dispatchedThisMonth = 0; // Placeholder

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mb-1.5">
          <span>Overview</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900">Production Dashboard</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[19px] font-semibold text-slate-900 leading-tight">Production Dashboard</h1>
            <div className="text-[12px] text-slate-500 mt-0.5">
              {activeJobs.length} live jobs across the floor · {pendingEst.length} estimates awaiting decision
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {ownerStats?.needsAttention && ownerStats.needsAttention.length > 0 && (
          <div className="bg-err-bg border border-err-bd rounded-md p-3 mb-4 space-y-1">
            <div className="text-xs font-semibold text-err-tx uppercase tracking-wider mb-2">Needs Attention</div>
            {ownerStats.needsAttention.map((msg, idx) => (
              <div key={idx} className="text-sm text-err-tx flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-err-tx shrink-0"></span> {msg}
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <button onClick={() => router.push("/costing")} className="text-left bg-white border border-slate-200 rounded-md p-3 hover:border-slate-300 transition-colors shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] uppercase tracking-wider font-semibold">Pending Estimates</span>
              <FileText size={14} />
            </div>
            <div className="text-[20px] font-semibold text-slate-900 mt-1 tabular-nums">{pendingEst.length}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{formatINR(pendingEstValue)} value</div>
          </button>

          <button onClick={() => router.push("/job-cards")} className="text-left bg-white border border-slate-200 rounded-md p-3 hover:border-slate-300 transition-colors shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] uppercase tracking-wider font-semibold">Jobs In Production</span>
              <Briefcase size={14} className={overdueJobs.length > 0 ? "text-rose-600" : ""} />
            </div>
            <div className="text-[20px] font-semibold text-slate-900 mt-1 tabular-nums">{activeJobs.length}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{overdueJobs.length} overdue</div>
          </button>

          <button onClick={() => router.push("/ledger/gold")} className="text-left bg-white border border-slate-200 rounded-md p-3 hover:border-slate-300 transition-colors shadow-sm">
            <div className="flex items-center justify-between text-amber-600">
              <span className="text-[10px] uppercase tracking-wider font-semibold">Gold Out w/ Karigars</span>
              <Package size={14} />
            </div>
            <div className="text-[20px] font-semibold text-slate-900 mt-1 tabular-nums">{formatWeight(ownerStats?.goldWithKarigarsG ?? 0)} g</div>
            <div className="text-[11px] text-slate-500 mt-0.5">across floor</div>
          </button>

          <button onClick={() => router.push("/qc")} className="text-left bg-white border border-slate-200 rounded-md p-3 hover:border-slate-300 transition-colors shadow-sm">
            <div className="flex items-center justify-between text-blue-600">
              <span className="text-[10px] uppercase tracking-wider font-semibold">Hallmark In Queue</span>
              <BadgeCheck size={14} />
            </div>
            <div className="text-[20px] font-semibold text-slate-900 mt-1 tabular-nums">0</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Pending QC</div>
          </button>

          <button onClick={() => router.push("/dispatch")} className="text-left bg-white border border-slate-200 rounded-md p-3 hover:border-slate-300 transition-colors shadow-sm">
            <div className="flex items-center justify-between text-emerald-600">
              <span className="text-[10px] uppercase tracking-wider font-semibold">Dispatched (MTD)</span>
              <Truck size={14} />
            </div>
            <div className="text-[20px] font-semibold text-slate-900 mt-1 tabular-nums">{formatINR(dispatchedThisMonth)}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">value delivered</div>
          </button>
        </div>

        <div className="grid lg:grid-cols-3 gap-3 mb-4">
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-md shadow-sm">
            <div className="h-9 px-3 flex items-center justify-between border-b border-slate-100">
              <span className="text-[12px] font-semibold text-slate-900">Active Jobs — stage wise</span>
              <Link href="/job-cards" className="text-[11px] text-blue-800 hover:underline">View all →</Link>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-1.5 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Job</th>
                  <th className="px-3 py-1.5 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Item</th>
                  <th className="px-3 py-1.5 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Stage</th>
                  <th className="px-3 py-1.5 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Due</th>
                </tr>
              </thead>
              <tbody>
                {activeJobs.slice(0, 6).map((j) => {
                  const s = activeStageOf(j);
                  const isOverdue = j.targetDeliveryDate && new Date(j.targetDeliveryDate) < new Date();
                  return (
                    <tr key={j.id} className="border-b border-slate-100 h-9 hover:bg-slate-50 cursor-pointer" onClick={() => router.push(`/job-cards/${j.id}`)}>
                      <td className="px-3 text-[12px] mono text-blue-800">{j.id}</td>
                      <td className="px-3 text-[12px] text-slate-900">{j.product.serialNo}</td>
                      <td className="px-3">
                        <span className="console-pill neu">{s?.processStage.name ?? "—"}</span>
                        {isOverdue && <span className="text-[10px] text-rose-600 font-medium ml-1">OVERDUE</span>}
                      </td>
                      <td className="px-3 text-[12px] text-slate-600 tabular-nums">{j.targetDeliveryDate ? formatDate(j.targetDeliveryDate) : "—"}</td>
                    </tr>
                  );
                })}
                {activeJobs.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-xs text-mute">No active jobs</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-slate-200 rounded-md shadow-sm">
            <div className="h-9 px-3 flex items-center justify-between border-b border-slate-100">
              <span className="text-[12px] font-semibold text-slate-900">Karigar Network</span>
              <Link href="/karigars" className="text-[11px] text-blue-800 hover:underline">View all →</Link>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-1.5 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Karigar</th>
                  <th className="px-3 py-1.5 text-right text-[10px] uppercase tracking-wider font-semibold text-slate-500">Specialization</th>
                </tr>
              </thead>
              <tbody>
                {karigars?.slice(0, 6).map((k) => (
                  <tr key={k.id} className="border-b border-slate-100 h-9">
                    <td className="px-3 text-[12px] text-slate-900">
                      {k.name}
                      <div className="text-[10px] text-slate-400">{k.employmentType}</div>
                    </td>
                    <td className="px-3 text-[12px] text-right text-slate-600">{k.specialization ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-2">
          {processStages?.sort((a,b) => a.sequenceOrder - b.sequenceOrder).map((ps) => {
            const count = ownerStats?.pipeline?.[ps.name] ?? 0;
            return (
              <div key={ps.id} className="bg-white border border-slate-200 rounded-md p-2 shadow-sm text-center flex flex-col items-center justify-center">
                <div className="text-[9.5px] uppercase tracking-wider text-slate-400 font-semibold truncate w-full">{ps.name}</div>
                <div className={`text-[20px] font-semibold mt-1 tabular-nums ${count > 0 ? 'text-ink' : 'text-slate-300'}`}>{count}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
