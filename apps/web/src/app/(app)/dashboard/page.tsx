"use client";

import Link from "next/link";
import { ClipboardList, Gem, TriangleAlert, FileText } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { StatCard } from "@/components/StatCard";
import { JobStageStatusPill } from "@/components/StatusPill";
import { formatWeight, formatPct } from "@/lib/format";

interface DashboardKpis {
  jobsInProgress: number;
  goldWithKarigarsG: number;
  wastageThisMonthPct: number;
  wastageToleranceThisMonthPct: number;
  pendingEstimates: number | null;
}

interface JobStage {
  id: string;
  status: string;
  karigar?: { name: string } | null;
  processStage: { name: string };
}

interface JobCardRow {
  id: string;
  targetDeliveryDate: string | null;
  createdAt: string;
  product: { serialNo: string; designName: string; images: { thumbnailUrl: string }[] };
  stages: JobStage[];
}

interface WastageAlert {
  wastageRecordId: string;
  karigarName: string;
  serialNo: string;
  wastagePct: string;
}

function daysOpen(createdAt: string) {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
}

export default function DashboardPage() {
  const { data: kpis } = useApi<DashboardKpis>("/api/dashboard");
  const { data: jobCards } = useApi<JobCardRow[]>("/api/job-cards");
  const { data: alerts } = useApi<WastageAlert[]>("/api/dashboard/wastage-alerts");

  const wastageTone =
    kpis && kpis.wastageThisMonthPct > kpis.wastageToleranceThisMonthPct ? "warning" : "default";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ClipboardList} label="Jobs in Progress" value={String(kpis?.jobsInProgress ?? "—")} />
        <StatCard icon={Gem} label="Gold with Karigars" value={formatWeight(kpis?.goldWithKarigarsG)} />
        <StatCard
          icon={TriangleAlert}
          label="Wastage This Month"
          value={formatPct(kpis?.wastageThisMonthPct)}
          sub={kpis ? `tolerance ${formatPct(kpis.wastageToleranceThisMonthPct)}` : undefined}
          tone={wastageTone}
        />
        <StatCard
          icon={FileText}
          label="Pending Estimates"
          value={kpis?.pendingEstimates === null ? "—" : String(kpis?.pendingEstimates ?? "—")}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card p-5">
          <h2 className="font-semibold mb-4">Work in Progress</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-muted border-b border-border">
                  <th className="py-2 pr-4 font-medium">Serial No.</th>
                  <th className="py-2 pr-4 font-medium">Stage</th>
                  <th className="py-2 pr-4 font-medium">Karigar</th>
                  <th className="py-2 pr-4 font-medium">Days Open</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {jobCards?.slice(0, 8).map((jc) => {
                  const activeStage =
                    jc.stages.find((s) => s.status !== "APPROVED") ?? jc.stages[jc.stages.length - 1];
                  return (
                    <tr key={jc.id} className="border-b border-border last:border-0">
                      <td className="py-2.5 pr-4">
                        <Link href={`/products/${jc.product.serialNo}`} className="font-mono text-gold font-semibold">
                          {jc.product.serialNo}
                        </Link>
                        <div className="text-text-muted text-xs">{jc.product.designName}</div>
                      </td>
                      <td className="py-2.5 pr-4">{activeStage?.processStage.name ?? "—"}</td>
                      <td className="py-2.5 pr-4">{activeStage?.karigar?.name ?? "Unassigned"}</td>
                      <td className="py-2.5 pr-4 tabular">{daysOpen(jc.createdAt)}</td>
                      <td className="py-2.5">
                        {activeStage && <JobStageStatusPill status={activeStage.status} />}
                      </td>
                    </tr>
                  );
                })}
                {jobCards?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-text-muted">
                      No open jobs.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-4">Wastage Alerts</h2>
          <div className="space-y-3">
            {alerts?.map((a) => (
              <div key={a.wastageRecordId} className="flex items-center justify-between border-b border-border pb-3 last:border-0">
                <div>
                  <div className="text-sm font-medium">{a.karigarName}</div>
                  <div className="text-xs font-mono text-text-muted">{a.serialNo}</div>
                </div>
                <div className="text-right">
                  <div className="text-danger font-semibold tabular text-sm">{formatPct(a.wastagePct)}</div>
                  <Link href="/job-cards" className="text-xs text-gold">
                    Review
                  </Link>
                </div>
              </div>
            ))}
            {alerts?.length === 0 && <p className="text-sm text-text-muted">No open wastage exceptions.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
