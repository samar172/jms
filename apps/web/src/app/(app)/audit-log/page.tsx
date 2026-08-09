"use client";

import { Fragment, useState } from "react";
import { useApi } from "@/lib/hooks";
import { formatDateTime } from "@/lib/format";

interface AuditLogEntry {
  id: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "VOID" | "REVERSE";
  entityType: string;
  entityId: string;
  beforeJson: unknown;
  afterJson: unknown;
  ipAddress: string | null;
  createdAt: string;
  user: { name: string; role: string } | null;
}
interface AuditLogResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

const ACTION_PILL: Record<string, string> = {
  CREATE: "ok",
  UPDATE: "info",
  DELETE: "err",
  VOID: "err",
  REVERSE: "warn",
};

export default function AuditLogPage() {
  const [entityType, setEntityType] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const pageSize = 50;

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (entityType) params.set("entityType", entityType);

  const { data } = useApi<AuditLogResponse>(`/api/audit-logs?${params.toString()}`);

  return (
    <div>
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">Admin</div>
        <h1 className="text-[19px] font-semibold flex items-center gap-2.5 text-ink">
          Audit Log
          <span className="text-xs text-mute font-medium">{data ? `${data.total} entries` : ""}</span>
        </h1>
      </div>

      <div className="flex items-center gap-2 py-2.5 border-t border-b border-line -mx-3.5 px-3.5 sm:-mx-[18px] sm:px-[18px] mb-3.5">
        <select
          className="console-field w-auto"
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All entity types</option>
          <option value="Estimate">Estimate</option>
          <option value="EstimateLine">Estimate Line</option>
          <option value="Product">Product</option>
          <option value="JobCard">Job Card</option>
          <option value="JobStage">Job Stage</option>
          <option value="MaterialIssue">Material Issue</option>
          <option value="MaterialReceipt">Material Receipt</option>
          <option value="WastageRecord">Wastage Record</option>
          <option value="Karigar">Karigar</option>
          <option value="User">User</option>
          <option value="Customer">Customer</option>
        </select>
      </div>

      <div className="console-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="console-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Reference</th>
                <th>By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((e) => (
                <Fragment key={e.id}>
                  <tr onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                    <td className="text-ink2">{formatDateTime(e.createdAt)}</td>
                    <td>
                      <span className={`console-pill ${ACTION_PILL[e.action] ?? "neu"}`}>{e.action}</span>
                    </td>
                    <td className="text-ink">{e.entityType}</td>
                    <td className="mono text-accent">{e.entityId}</td>
                    <td className="text-ink2">
                      {e.user ? `${e.user.name} · ${e.user.role.replace(/_/g, " ")}` : "System"}
                    </td>
                    <td className="text-right text-accent text-xs">{expanded === e.id ? "Hide" : "View"}</td>
                  </tr>
                  {expanded === e.id && (
                    <tr>
                      <td colSpan={6} className="bg-neu-bg">
                        <div className="grid sm:grid-cols-2 gap-3 p-3">
                          <div>
                            <div className="console-field-label">Before</div>
                            <pre className="text-[11px] mono bg-panel border border-line rounded-md p-2 overflow-x-auto max-h-64 overflow-y-auto">
                              {e.beforeJson ? JSON.stringify(e.beforeJson, null, 2) : "—"}
                            </pre>
                          </div>
                          <div>
                            <div className="console-field-label">After</div>
                            <pre className="text-[11px] mono bg-panel border border-line rounded-md p-2 overflow-x-auto max-h-64 overflow-y-auto">
                              {e.afterJson ? JSON.stringify(e.afterJson, null, 2) : "—"}
                            </pre>
                          </div>
                          {e.ipAddress && <div className="text-[11px] text-mute sm:col-span-2">IP: {e.ipAddress}</div>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-mute">
                    No audit entries match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data && data.total > pageSize && (
        <div className="flex items-center justify-center gap-2 pt-3.5">
          <button className="console-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span className="text-xs text-mute">
            Page {page} of {Math.ceil(data.total / pageSize)}
          </span>
          <button className="console-btn" disabled={page * pageSize >= data.total} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
