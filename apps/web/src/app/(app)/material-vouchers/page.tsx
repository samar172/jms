"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { formatWeight, formatDateTime } from "@/lib/format";

interface IssueRow {
  id: string;
  issueNo: string;
  materialType: string;
  grossWeightG: string | null;
  fineWeightG: string;
  caratWeight: string | null;
  pieces: number | null;
  issuedAt: string;
  karigar: { name: string };
  purity: { code: string } | null;
  stoneType: { name: string } | null;
  jobStage: {
    status: string;
    jobCard: { id: string; product: { serialNo: string; designName: string } };
    processStage: { name: string };
  };
}
interface ReceiptRow {
  id: string;
  receiptNo: string;
  finishedPieceWeightG: string;
  dustWeightG: string;
  unusedReturnedWeightG: string;
  receivedAt: string;
  karigar: { name: string };
  jobStage: {
    jobCard: { id: string; product: { serialNo: string; designName: string } };
    processStage: { name: string };
    wastageRecord: { withinTolerance: boolean; exceptionStatus: string; wastagePct: string } | null;
  };
}

export default function MaterialVouchersPage() {
  const [tab, setTab] = useState<"issue" | "return">("issue");
  const [search, setSearch] = useState("");

  const params = new URLSearchParams({ pageSize: "100" });
  if (search) params.set("search", search);

  const { data: issues } = useApi<{ items: IssueRow[]; total: number }>(
    tab === "issue" ? `/api/materials/issues?${params.toString()}` : null
  );
  const { data: receipts } = useApi<{ items: ReceiptRow[]; total: number }>(
    tab === "return" ? `/api/materials/receipts?${params.toString()}` : null
  );

  return (
    <div>
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">Material</div>
        <h1 className="text-[19px] font-semibold text-ink mb-2">Material Issue / Return Vouchers</h1>
        <div className="flex gap-2">
          <TabButton active={tab === "issue"} onClick={() => setTab("issue")}>
            Issue Vouchers
          </TabButton>
          <TabButton active={tab === "return"} onClick={() => setTab("return")}>
            Return Vouchers
          </TabButton>
        </div>
      </div>

      <div className="flex items-center gap-2 py-2.5 border-t border-b border-line -mx-3.5 px-3.5 sm:-mx-[18px] sm:px-[18px] mb-3.5 mt-3.5">
        <div className="console-search w-[260px]">
          <Search size={13} />
          <input
            placeholder="Search voucher, job, karigar…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {tab === "issue" ? (
        <div className="console-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="console-table">
              <thead>
                <tr>
                  <th>Voucher #</th>
                  <th>Job</th>
                  <th>Karigar</th>
                  <th>Material</th>
                  <th className="num">Gross Wt</th>
                  <th className="num">Fine Wt</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {issues?.items.map((i) => (
                  <tr key={i.id}>
                    <td className="rid">{i.issueNo}</td>
                    <td>
                      <Link href={`/job-cards/${i.jobStage.jobCard.id}`} className="text-ink2 hover:text-accent">
                        {i.jobStage.jobCard.product.serialNo}
                      </Link>
                      <div className="text-[11px] text-mute">{i.jobStage.processStage.name}</div>
                    </td>
                    <td>{i.karigar.name}</td>
                    <td className="text-ink2">
                      {i.materialType} {i.purity?.code ?? i.stoneType?.name ?? ""}
                      {i.pieces ? ` · ${i.pieces} pc` : ""}
                    </td>
                    <td className="num mono">{i.grossWeightG ? formatWeight(i.grossWeightG) : "—"}</td>
                    <td className="num mono">{formatWeight(i.fineWeightG)}</td>
                    <td className="text-ink2">{formatDateTime(i.issuedAt)}</td>
                    <td>
                      <span className={`console-pill ${i.jobStage.status === "RECEIVED" || i.jobStage.status === "APPROVED" ? "ok" : "warn"}`}>
                        {i.jobStage.status === "ISSUED" ? "Return Pending" : i.jobStage.status.replace(/_/g, " ")}
                      </span>
                    </td>
                  </tr>
                ))}
                {issues?.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-mute">
                      No material issue vouchers yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {issues && <div className="px-3.5 py-2 text-xs text-mute border-t border-line">{issues.total} records</div>}
        </div>
      ) : (
        <div className="console-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="console-table">
              <thead>
                <tr>
                  <th>Voucher #</th>
                  <th>Job</th>
                  <th>Karigar</th>
                  <th className="num">Finished Piece</th>
                  <th className="num">Dust</th>
                  <th className="num">Unused Returned</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {receipts?.items.map((r) => {
                  const w = r.jobStage.wastageRecord;
                  const statusPill = !w
                    ? { cls: "neu", label: "Pending Reconciliation" }
                    : w.exceptionStatus === "PENDING"
                      ? { cls: "warn", label: "Under Recon" }
                      : w.withinTolerance
                        ? { cls: "ok", label: "Reconciled" }
                        : { cls: "err", label: "Discrepancy" };
                  return (
                    <tr key={r.id}>
                      <td className="rid">{r.receiptNo}</td>
                      <td>
                        <Link href={`/job-cards/${r.jobStage.jobCard.id}`} className="text-ink2 hover:text-accent">
                          {r.jobStage.jobCard.product.serialNo}
                        </Link>
                        <div className="text-[11px] text-mute">{r.jobStage.processStage.name}</div>
                      </td>
                      <td>{r.karigar.name}</td>
                      <td className="num mono">{formatWeight(r.finishedPieceWeightG)}</td>
                      <td className="num mono">{formatWeight(r.dustWeightG)}</td>
                      <td className="num mono">{formatWeight(r.unusedReturnedWeightG)}</td>
                      <td className="text-ink2">{formatDateTime(r.receivedAt)}</td>
                      <td>
                        <span className={`console-pill ${statusPill.cls}`}>{statusPill.label}</span>
                      </td>
                    </tr>
                  );
                })}
                {receipts?.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-mute">
                      No material return vouchers yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {receipts && <div className="px-3.5 py-2 text-xs text-mute border-t border-line">{receipts.total} records</div>}
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-[12.5px] border-b-2 -mb-px ${
        active ? "border-accent text-accent font-semibold" : "border-transparent text-ink2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
