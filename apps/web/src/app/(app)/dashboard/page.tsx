"use client";

import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { JobStageStatusPill } from "@/components/StatusPill";
import { formatWeight, formatPct, formatDate } from "@/lib/format";

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

function activeStageOf(jc: JobCardRow) {
  return jc.stages.find((s) => s.status !== "APPROVED") ?? jc.stages[jc.stages.length - 1];
}

export default function DashboardPage() {
  const { data: kpis } = useApi<DashboardKpis>("/api/dashboard");
  const { data: jobCards } = useApi<JobCardRow[]>("/api/job-cards");
  const { data: alerts } = useApi<WastageAlert[]>("/api/dashboard/wastage-alerts");

  const wastageAlert = kpis && kpis.wastageThisMonthPct > kpis.wastageToleranceThisMonthPct;

  const pipeline = new Map<string, number>();
  jobCards?.forEach((jc) => {
    const stage = activeStageOf(jc);
    const name = stage?.processStage.name ?? "Unassigned";
    pipeline.set(name, (pipeline.get(name) ?? 0) + 1);
  });

  return (
    <div>
      <div className="mb-3.5">
        <div className="text-[11px] text-mute mb-1">Home</div>
        <h1 className="text-[19px] font-semibold flex items-center gap-2.5 text-ink">
          Owner Dashboard <span className="text-xs text-mute font-medium">{formatDate(new Date().toISOString())}</span>
        </h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3.5">
        <Kpi label="Jobs in Progress" value={String(kpis?.jobsInProgress ?? "—")} />
        <Kpi label="Gold with Karigars" value={formatWeight(kpis?.goldWithKarigarsG)} />
        <Kpi
          label="Wastage This Month"
          value={formatPct(kpis?.wastageThisMonthPct)}
          sub={kpis ? `tolerance ${formatPct(kpis.wastageToleranceThisMonthPct)}` : undefined}
          alert={wastageAlert}
        />
        <Kpi
          label="Pending Estimates"
          value={kpis?.pendingEstimates === null ? "—" : String(kpis?.pendingEstimates ?? "—")}
        />
      </div>

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-3.5 mb-3.5">
        <div className="console-panel">
          <div className="ph">Exceptions requiring action</div>
          <div>
            {alerts?.map((a) => (
              <div key={a.wastageRecordId} className="flex items-center gap-2.5 px-3 py-2 border-b border-line last:border-0 text-xs">
                <span className="w-[7px] h-[7px] rounded-full bg-[#DC2626] shrink-0" />
                <span className="flex-1 text-ink">
                  Wastage exception on <span className="mono">{a.serialNo}</span> — {a.karigarName} at{" "}
                  <span className="font-semibold text-err-tx">{formatPct(a.wastagePct)}</span>
                </span>
                <Link href="/job-cards" className="text-accent font-semibold text-[11.5px] shrink-0">
                  Review →
                </Link>
              </div>
            ))}
            {alerts?.length === 0 && <div className="px-3 py-4 text-xs text-mute">No open wastage exceptions.</div>}
          </div>
        </div>

        <div className="console-panel">
          <div className="ph">Production pipeline</div>
          <table className="w-full text-xs">
            <tbody>
              {[...pipeline.entries()].map(([name, count]) => (
                <tr key={name} className="border-b border-line last:border-0">
                  <td className="px-3 py-1.5 text-ink2">{name}</td>
                  <td className="px-3 py-1.5 text-right mono font-semibold text-ink">{count}</td>
                </tr>
              ))}
              {pipeline.size === 0 && (
                <tr>
                  <td className="px-3 py-4 text-mute text-center">No open jobs.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="console-panel">
        <div className="ph">Work in progress</div>
        <div className="overflow-x-auto">
          <table className="console-table">
            <thead>
              <tr>
                <th>Serial No.</th>
                <th>Stage</th>
                <th>Karigar</th>
                <th className="num">Days Open</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {jobCards?.slice(0, 8).map((jc) => {
                const stage = activeStageOf(jc);
                return (
                  <tr key={jc.id}>
                    <td>
                      <Link href={`/products/${jc.product.serialNo}`} className="rid">
                        {jc.product.serialNo}
                      </Link>
                      <div className="text-mute text-[11px]">{jc.product.designName}</div>
                    </td>
                    <td className="text-ink2">{stage?.processStage.name ?? "—"}</td>
                    <td className="text-ink2">{stage?.karigar?.name ?? "Unassigned"}</td>
                    <td className="num mono">{daysOpen(jc.createdAt)}</td>
                    <td>{stage && <JobStageStatusPill status={stage.status} />}</td>
                  </tr>
                );
              })}
              {jobCards?.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-mute">
                    No open jobs.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div className="console-panel px-3 py-2.5">
      <div className="text-[10.5px] uppercase tracking-wide text-mute mb-1.5">{label}</div>
      <div className={`text-xl font-bold mono ${alert ? "text-err-tx" : "text-ink"}`}>{value}</div>
      {sub && <div className="text-[11px] text-ink2 mt-0.5">{sub}</div>}
    </div>
  );
}
