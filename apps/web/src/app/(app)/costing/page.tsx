"use client";

import { useMemo, useState, Fragment } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { EstimateStatusPill } from "@/components/StatusPill";
import { formatINR, formatDate } from "@/lib/format";

interface EstimateRow {
  id: string;
  type: string;
  version: number;
  status: string;
  netAmount: string;
  createdAt: string;
  product: { serialNo: string; designName: string };
  customer?: { name: string } | null;
  order?: { id: string; orderNo: string } | null;
}

// Lower = more relevant. An order-linked estimate is the closest thing this
// product has to a "final answer"; failing that, prefer whatever is furthest
// along the Draft → Submitted → Approved pipeline; Superseded sinks to the
// bottom since it's explicitly been replaced by something else.
function rowRank(e: EstimateRow): number {
  if (e.order) return 0;
  if (e.status === "APPROVED") return 1;
  if (e.status === "SUBMITTED") return 2;
  if (e.status === "DRAFT") return 3;
  return 4;
}

export default function CostingListPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const { data: estimates } = useApi<EstimateRow[]>(`/api/estimates${params.toString() ? `?${params}` : ""}`);

  // One design (Product) can rack up several estimates over time — different
  // prospective customers, rough vs. final costing, abandoned drafts. Flat-
  // listing all of them makes unrelated quotes look like duplicates/versions
  // of each other. Group by product and surface only the most relevant one;
  // the rest are one click away, not gone.
  const groups = useMemo(() => {
    if (!estimates) return [];
    const byProduct = new Map<string, EstimateRow[]>();
    for (const e of estimates) {
      const list = byProduct.get(e.product.serialNo) ?? [];
      list.push(e);
      byProduct.set(e.product.serialNo, list);
    }
    return Array.from(byProduct.values())
      .map((rows) => {
        const sorted = [...rows].sort((a, b) => {
          const r = rowRank(a) - rowRank(b);
          return r !== 0 ? r : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        return { key: sorted[0].product.serialNo, primary: sorted[0], older: sorted.slice(1) };
      })
      .sort((a, b) => new Date(b.primary.createdAt).getTime() - new Date(a.primary.createdAt).getTime());
  }, [estimates]);

  function toggle(key: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div>
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">Sales</div>
        <h1 className="text-[19px] font-semibold flex items-center gap-2.5 text-ink">
          Estimates
          <span className="text-xs text-mute font-medium">{estimates ? `${estimates.length} records` : ""}</span>
        </h1>
      </div>

      <div className="flex items-center gap-2 py-2.5 border-t border-b border-line -mx-3.5 px-3.5 sm:-mx-[18px] sm:px-[18px] mb-3.5">
        <Link href="/costing/new" className="console-btn primary">
          <Plus size={14} /> New Estimate
        </Link>
        <div className="console-search w-[230px]">
          <Search size={13} />
          <input
            placeholder="Search estimate, customer, design…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="console-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="console-table">
            <thead>
              <tr>
                <th>Estimate #</th>
                <th>Customer</th>
                <th>Design</th>
                <th>Type</th>
                <th>Date</th>
                <th className="num">Amount</th>
                <th>Status</th>
                <th>Revision</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(({ key, primary, older }) => {
                const isOpen = expanded.has(key);
                return (
                  <Fragment key={key}>
                    <EstimateRowView e={primary} onOpen={() => router.push(`/costing/${primary.id}`)} />
                    {older.length > 0 && (
                      <tr>
                        <td colSpan={8} className="!py-1">
                          <button
                            type="button"
                            className="text-[11px] text-accent font-medium hover:underline"
                            onClick={() => toggle(key)}
                          >
                            {isOpen ? "Hide" : "Show"} {older.length} earlier estimate{older.length > 1 ? "s" : ""} for this design
                          </button>
                        </td>
                      </tr>
                    )}
                    {isOpen &&
                      older.map((e) => (
                        <EstimateRowView key={e.id} e={e} muted onOpen={() => router.push(`/costing/${e.id}`)} />
                      ))}
                  </Fragment>
                );
              })}
              {groups.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-mute">
                    {search ? "No estimates match your search." : "No estimates yet."}
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

function EstimateRowView({ e, onOpen, muted }: { e: EstimateRow; onOpen: () => void; muted?: boolean }) {
  return (
    <tr onClick={onOpen} className={muted ? "opacity-60" : undefined}>
      <td>
        <Link href={`/costing/${e.id}`} className="rid" onClick={(ev) => ev.stopPropagation()}>
          {e.product.serialNo}
        </Link>
      </td>
      <td className="text-ink2">{e.customer?.name ?? "—"}</td>
      <td>{e.product.designName}</td>
      <td className="text-ink2">{e.type.replace(/_/g, " ")}</td>
      <td className="text-ink2">{formatDate(e.createdAt)}</td>
      <td className="num mono font-medium">{formatINR(Number(e.netAmount))}</td>
      <td>
        <EstimateStatusPill status={e.status} />
      </td>
      <td className="mono text-ink2">v{e.version}</td>
    </tr>
  );
}
