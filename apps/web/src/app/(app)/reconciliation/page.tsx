"use client";

import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { formatWeight } from "@/lib/format";

interface ReconRow {
  jobStageId: string;
  jobCardId: string;
  serialNo: string;
  designName: string;
  processStageName: string;
  karigar: { id: string; name: string } | null;
  materialType: string;
  issuedG: number;
  returnedG: number | null;
  consumedG: number | null;
  expectedG: number | null;
  differenceG: number | null;
  withinTolerance: boolean | null;
  exceptionStatus: string | null;
  status: "RETURN_PENDING" | "RECONCILED" | "NONE" | "PENDING" | "APPROVED" | "REJECTED";
}

const STATUS_DISPLAY: Record<string, { pill: string; label: string }> = {
  RETURN_PENDING: { pill: "neu", label: "Return Pending" },
  RECONCILED: { pill: "ok", label: "🟢 Reconciled" },
  PENDING: { pill: "err", label: "🔴 Exception Pending" },
  APPROVED: { pill: "warn", label: "🟡 Exception Approved" },
  REJECTED: { pill: "err", label: "🔴 Exception Rejected" },
  NONE: { pill: "neu", label: "—" },
};

export default function ReconciliationPage() {
  const { data } = useApi<ReconRow[]>("/api/materials/reconciliation");
  const open = data?.filter((r) => r.status !== "RECONCILED") ?? [];
  const exceptions = data?.filter((r) => r.exceptionStatus === "PENDING" || r.exceptionStatus === "REJECTED").length ?? 0;

  return (
    <div>
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">Material</div>
        <h1 className="text-[19px] font-semibold flex items-center gap-2.5 text-ink">
          Material Reconciliation
          <span className="text-xs text-mute font-medium">{data ? `${open.length} open` : ""}</span>
        </h1>
      </div>

      <div className="console-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="console-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Karigar</th>
                <th>Material</th>
                <th className="num">Issued</th>
                <th className="num">Returned</th>
                <th className="num">Consumed</th>
                <th className="num">Expected</th>
                <th className="num">Difference</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((r) => {
                const st = STATUS_DISPLAY[r.status] ?? STATUS_DISPLAY.NONE;
                return (
                  <tr key={r.jobStageId} className={r.status !== "RECONCILED" && r.status !== "RETURN_PENDING" ? "row-major" : ""}>
                    <td>
                      <Link href={`/job-cards/${r.jobCardId}`} className="rid">
                        {r.serialNo}
                      </Link>
                      <div className="text-[11px] text-mute">{r.processStageName}</div>
                    </td>
                    <td className="text-ink2">{r.karigar?.name ?? "Unassigned"}</td>
                    <td className="text-ink2">{r.materialType}</td>
                    <td className="num mono">{formatWeight(r.issuedG)}</td>
                    <td className="num mono">{r.returnedG !== null ? formatWeight(r.returnedG) : "—"}</td>
                    <td className="num mono">{r.consumedG !== null ? formatWeight(r.consumedG) : "—"}</td>
                    <td className="num mono">{r.expectedG !== null ? formatWeight(r.expectedG) : "—"}</td>
                    <td
                      className="num mono"
                      style={{
                        color:
                          r.differenceG !== null && r.differenceG > 0 ? "var(--color-err-tx)" : r.differenceG !== null ? "var(--color-ok-tx)" : undefined,
                      }}
                    >
                      {r.differenceG !== null ? `${r.differenceG > 0 ? "+" : ""}${formatWeight(r.differenceG)}` : "—"}
                    </td>
                    <td>
                      <span className={`console-pill ${st.pill}`}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
              {data?.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-mute">
                    No material has been issued to any open job yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {data && (
          <div className="px-3.5 py-2 text-xs text-mute border-t border-line">
            {data.length} stages with material issued · {exceptions} exception{exceptions === 1 ? "" : "s"} pending or rejected
          </div>
        )}
      </div>
    </div>
  );
}
