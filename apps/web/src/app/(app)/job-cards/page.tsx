"use client";

import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { formatDate } from "@/lib/format";
import { EstimateStatusPill } from "@/components/StatusPill";

interface JobStage {
  id: string;
  status: string;
  processStageId: string;
  processStage: { name: string; sequenceOrder: number };
  karigar?: { name: string } | null;
  wastageRecord?: { exceptionStatus: string } | null;
}
interface JobCardRow {
  id: string;
  jobNo: string | null;
  createdAt: string;
  targetDeliveryDate: string | null;
  product: { serialNo: string; designName: string };
  customer?: { name: string } | null;
  estimate?: { grossWeightG: string | null } | null;
  stages: JobStage[];
}

function activeStageOf(jc: JobCardRow): JobStage | undefined {
  return jc.stages.find((s) => s.status !== "APPROVED") ?? jc.stages[jc.stages.length - 1];
}

export default function JobCardsPage() {
  const { data: jobCards } = useApi<JobCardRow[]>("/api/job-cards");

  const overdueJobs = (jobCards ?? []).filter(j => j.targetDeliveryDate && new Date(j.targetDeliveryDate).getTime() < Date.now());

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3.5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mb-1.5">
            <span>Sales</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-900">Job Cards</span>
          </div>
          <h1 className="text-[19px] font-semibold flex items-center gap-2.5 text-slate-900">
            Job Cards / Orders
            <span className="text-[11px] text-slate-500 font-normal">{jobCards?.length ?? 0} jobs · {overdueJobs.length} overdue against due date</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/costing" className="h-7 px-3 rounded bg-blue-800 text-white text-[12px] font-medium flex items-center gap-1.5 hover:bg-blue-900">
            <span className="font-bold">+</span> New Job Card
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-sm">
          <input
            placeholder="Filter by job no., item, party…"
            className="w-full h-8 px-2 text-[12px] border border-slate-200 rounded outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white border border-slate-200 rounded-md">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="w-9 px-3 py-2"></th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Job No.</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Item</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Party</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Karigar</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Due Date</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider font-semibold text-slate-500">GW Est</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-slate-500">Stage</th>
              <th className="w-9"></th>
            </tr>
          </thead>
          <tbody>
            {(jobCards ?? []).map(j => {
              const activeStage = activeStageOf(j);
              const overdue = j.targetDeliveryDate && new Date(j.targetDeliveryDate).getTime() < Date.now();
              return (
                <tr key={j.id} className="border-b border-slate-100 h-9 hover:bg-slate-50 cursor-pointer" onClick={() => window.location.href = `/job-cards/${j.id}`}>
                  <td className="px-3 text-center">{overdue ? <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span> : ""}</td>
                  <td className="px-3 text-[12px] mono text-blue-800 font-medium">
                    <Link href={`/job-cards/${j.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{j.jobNo ?? j.id}</Link>
                  </td>
                  <td className="px-3 text-[12px] text-slate-900">{j.product.designName}</td>
                  <td className="px-3 text-[12px] text-slate-600">{j.customer?.name ?? "—"}</td>
                  <td className={`px-3 text-[12px] ${!activeStage?.karigar ? 'text-slate-400 italic' : 'text-slate-600'}`}>{activeStage?.karigar?.name ?? "Unassigned"}</td>
                  <td className="px-3 text-[12px] text-slate-600 tabular">{j.targetDeliveryDate ? formatDate(j.targetDeliveryDate.toString()).split(',')[0] : "—"}</td>
                  <td className="px-3 text-[12px] text-right tabular mono">{j.estimate?.grossWeightG ? `${Number(j.estimate.grossWeightG).toFixed(3)} g` : "—"}</td>
                  <td className="px-3">
                    <EstimateStatusPill status={activeStage?.processStage?.name ?? "Done"} />
                  </td>
                  <td className="px-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <button className="w-6 h-6 grid place-items-center rounded hover:bg-slate-200">
                      <span className="w-4 h-4 text-slate-500 font-bold flex items-center justify-center">...</span>
                    </button>
                  </td>
                </tr>
              )
            })}
            {!jobCards?.length && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-[12px] text-slate-500">No jobs match these filters</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
