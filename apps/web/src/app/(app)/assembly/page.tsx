"use client";

import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { useState } from "react";
import { formatWeight } from "@/lib/format";

interface AssemblyRow {
  id: string;
  status: "PENDING" | "IN_ASSEMBLY" | "ASSEMBLED";
  finalWeightG: string | null;
  order: {
    id: string;
    orderNo: string;
    product: { serialNo: string; designName: string };
    customer: { name: string };
  };
  assembler: { id: string; name: string } | null;
  components: { id: string; status: string; jobCard: { product: { designName: string } } }[];
}

export default function AssemblyPage() {
  const { data: assemblies, mutate } = useApi<AssemblyRow[]>("/api/assembly");
  const [error, setError] = useState<string | null>(null);

  async function setComponentStatus(id: string, status: string) {
    setError(null);
    try {
      await apiFetch(`/api/assembly/components/${id}`, { method: "PATCH", body: { status } });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  return (
    <div>
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">Manufacturing</div>
        <h1 className="text-[19px] font-semibold flex items-center gap-2.5 text-ink">
          Assembly Queue
          <span className="text-xs text-mute font-medium">{assemblies ? `${assemblies.length}` : ""}</span>
        </h1>
      </div>

      {error && <p className="text-sm text-err-tx mb-3">{error}</p>}

      <div className="console-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="console-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Design</th>
                <th>Components</th>
                <th>Assembler</th>
                <th className="num">Final Weight</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {assemblies?.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/orders/${a.order.id}`} className="rid">
                      {a.order.orderNo}
                    </Link>
                    <div className="text-[11px] text-mute">{a.order.customer.name}</div>
                  </td>
                  <td className="text-ink2">{a.order.product.designName}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {a.components.map((c) => (
                        <button
                          key={c.id}
                          className={`console-pill ${c.status === "COMPLETE" ? "ok" : c.status === "MISSING" ? "err" : "neu"}`}
                          onClick={() =>
                            setComponentStatus(c.id, c.status === "COMPLETE" ? "PENDING" : "COMPLETE")
                          }
                          title="Click to toggle complete"
                        >
                          {c.jobCard.product.designName} {c.status === "COMPLETE" ? "✓" : c.status === "MISSING" ? "✗" : "…"}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="text-ink2">{a.assembler?.name ?? "—"}</td>
                  <td className="num mono">{a.finalWeightG ? formatWeight(a.finalWeightG) : "—"}</td>
                  <td>
                    <span className={`console-pill ${a.status === "ASSEMBLED" ? "ok" : "info"}`}>{a.status.replace(/_/g, " ")}</span>
                  </td>
                </tr>
              ))}
              {assemblies?.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-mute">
                    No assemblies yet — start one from an order with linked job cards.
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
