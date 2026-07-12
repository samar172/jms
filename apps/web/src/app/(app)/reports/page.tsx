"use client";

import { useApi } from "@/lib/hooks";
import { formatPct } from "@/lib/format";

interface JobStage {
  status: string;
  karigar?: { name: string } | null;
  processStage: { name: string };
  wastageRecord?: { wastagePct: string; tolerancePct: string; withinTolerance: boolean } | null;
}
interface JobCardRow {
  id: string;
  product: { serialNo: string; designName: string };
  stages: JobStage[];
}

export default function ReportsPage() {
  const { data: jobCards } = useApi<JobCardRow[]>("/api/job-cards?status=OPEN");

  const wastageRows = (jobCards ?? []).flatMap((jc) =>
    jc.stages
      .filter((s) => s.wastageRecord)
      .map((s) => ({
        serialNo: jc.product.serialNo,
        stage: s.processStage.name,
        karigar: s.karigar?.name ?? "—",
        ...s.wastageRecord!,
      }))
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Reports</h1>
      <p className="text-sm text-text-muted max-w-2xl">
        The full report catalogue (Section 13 of the BRD — Metal Position, Karigar Outstanding,
        Stone Consumption, Gold Rate History, etc.) is a near-term follow-up. Below is a live
        Wastage Analysis (R-04) built from data already captured by the job card workflow.
      </p>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-border font-semibold">Wastage Analysis — Open Jobs</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted border-b border-border bg-bg">
              <th className="py-2 px-4 font-medium">Serial No.</th>
              <th className="py-2 px-4 font-medium">Stage</th>
              <th className="py-2 px-4 font-medium">Karigar</th>
              <th className="py-2 px-4 font-medium text-right">Wastage %</th>
              <th className="py-2 px-4 font-medium text-right">Tolerance</th>
              <th className="py-2 px-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {wastageRows.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="py-2 px-4 font-mono text-gold">{r.serialNo}</td>
                <td className="py-2 px-4">{r.stage}</td>
                <td className="py-2 px-4">{r.karigar}</td>
                <td className={`py-2 px-4 text-right tabular ${r.withinTolerance ? "" : "text-danger font-medium"}`}>
                  {formatPct(r.wastagePct)}
                </td>
                <td className="py-2 px-4 text-right tabular text-text-muted">{formatPct(r.tolerancePct)}</td>
                <td className="py-2 px-4">{r.withinTolerance ? "Within tolerance" : "Exception"}</td>
              </tr>
            ))}
            {wastageRows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-text-muted">
                  No wastage recorded on open jobs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
