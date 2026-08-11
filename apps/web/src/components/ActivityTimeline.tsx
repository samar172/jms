"use client";

import { useState } from "react";
import useSWR from "swr";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

interface AuditLogEntry {
  id: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "APPROVE";
  entityType: string;
  entityId: string;
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
  createdAt: string;
  user: { name: string; role: string } | null;
}

export interface TimelineSource {
  entityType: string;
  entityId: string;
}

// Good-enough human labels beat an exhaustive per-entity switch — only a
// handful of fields are worth calling out by name, everything else falls
// back to a generic "<Entity> <action>d" line.
const FIELD_LABELS: Record<string, (before: Record<string, any>, after: Record<string, any>) => string | null> = {
  status: (b, a) => (a.status && b.status !== a.status ? `Status: ${b.status ?? "—"} → ${a.status}` : null),
  karigarId: (b, a) => (b.karigarId !== a.karigarId && a.karigar?.name ? `Assigned to ${a.karigar.name}` : null),
  exceptionStatus: (b, a) =>
    b.exceptionStatus !== a.exceptionStatus && a.exceptionStatus ? `Wastage exception: ${a.exceptionStatus}` : null,
  quotationSentAt: (b, a) => (!b.quotationSentAt && a.quotationSentAt ? "Quotation sent to customer" : null),
  advanceReceived: (b, a) => (b.advanceReceived !== a.advanceReceived ? "Payment recorded" : null),
};

function describeAuditEntry(e: AuditLogEntry): string {
  const before = (e.beforeJson ?? {}) as Record<string, any>;
  const after = (e.afterJson ?? {}) as Record<string, any>;
  for (const key of Object.keys(FIELD_LABELS)) {
    const label = FIELD_LABELS[key](before, after);
    if (label) return label;
  }
  const actionWord =
    e.action === "CREATE" ? "created" : e.action === "APPROVE" ? "approved" : e.action === "DELETE" ? "deleted" : "updated";
  return `${e.entityType.replace(/([A-Z])/g, " $1").trim()} ${actionWord}`;
}

async function fetchAll(sources: TimelineSource[]): Promise<AuditLogEntry[]> {
  const results = await Promise.all(
    sources.map((s) =>
      apiFetch<{ items: AuditLogEntry[] }>(
        `/api/audit-logs?entityType=${encodeURIComponent(s.entityType)}&entityId=${encodeURIComponent(s.entityId)}&pageSize=100`
      )
    )
  );
  return results.flatMap((r) => r.items).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function ActivityTimeline({ sources, defaultOpen = false }: { sources: TimelineSource[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const key = open && sources.length > 0 ? sources.map((s) => `${s.entityType}:${s.entityId}`).join(",") : null;
  const { data: entries, error } = useSWR(key, () => fetchAll(sources));

  return (
    <div className="console-panel p-3.5 mb-3.5">
      <button type="button" className="flex items-center justify-between w-full text-left" onClick={() => setOpen((o) => !o)}>
        <h3 className="text-[12.5px] font-semibold text-ink">Activity Timeline</h3>
        <span className="text-xs text-accent">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="mt-2.5 space-y-2">
          {error && <div className="text-xs text-mute">Activity timeline isn&apos;t available for your role.</div>}
          {!entries && !error && <div className="text-xs text-mute">Loading…</div>}
          {entries?.length === 0 && <div className="text-xs text-mute">No activity recorded yet.</div>}
          {entries?.map((e) => (
            <div key={e.id} className="flex items-start gap-2.5 text-[12.5px] border-b border-line pb-2 last:border-0 last:pb-0">
              <div className="text-mute mono text-[11px] w-32 shrink-0">{formatDateTime(e.createdAt)}</div>
              <div className="flex-1">
                <span className="text-ink">{describeAuditEntry(e)}</span>
                <span className="text-mute"> · {e.user ? e.user.name : "System"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
