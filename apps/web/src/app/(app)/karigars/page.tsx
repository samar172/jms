"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useKarigars, useApi } from "@/lib/hooks";
import { AddKarigarForm } from "@/components/AddKarigarForm";
import { useAuth } from "@/lib/auth-context";
import { formatWeight, formatINR } from "@/lib/format";
import { canSeeCost } from "@jms/shared";

interface Summary {
  goldHeldG: number;
  labourEarnedThisMonth: number;
  advancesPaid: number;
  netPayable: number;
}

export default function KarigarsPage() {
  const { user } = useAuth();
  const { data: karigars, mutate } = useKarigars();
  const [showAdd, setShowAdd] = useState(false);
  const canManage = user?.role === "SUPER_ADMIN" || user?.role === "MANAGER";
  const showCost = user ? canSeeCost(user.role) : false;

  return (
    <div>
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">Manufacturing</div>
        <h1 className="text-[19px] font-semibold flex items-center gap-2.5 text-ink">
          Karigars / Job Workers
          <span className="text-xs text-mute font-medium">{karigars ? `${karigars.length} active` : ""}</span>
        </h1>
      </div>

      <div className="flex items-center gap-2 py-2.5 border-t border-b border-line -mx-3.5 px-3.5 sm:-mx-[18px] sm:px-[18px] mb-3.5">
        {canManage && (
          <button className="console-btn primary" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? "Cancel" : "+ New Karigar"}
          </button>
        )}
      </div>

      {showAdd && (
        <div className="console-panel p-4 mb-3.5">
          <AddKarigarForm
            onCreated={() => {
              setShowAdd(false);
              mutate();
            }}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      )}

      <div className="console-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="console-table">
            <thead>
              <tr>
                <th>Karigar</th>
                <th>Type</th>
                <th>Specialization</th>
                <th className="num">Gold Held</th>
                {showCost && <th className="num">Labour Earned (MTD)</th>}
                {showCost && <th className="num">Net Payable</th>}
              </tr>
            </thead>
            <tbody>
              {karigars?.map((k) => (
                <KarigarRow key={k.id} id={k.id} name={k.name} employmentType={k.employmentType} specialization={k.specialization} showCost={showCost} />
              ))}
              {karigars?.length === 0 && (
                <tr>
                  <td colSpan={showCost ? 6 : 4} className="py-8 text-center text-mute">
                    No karigars yet.
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

function KarigarRow({
  id,
  name,
  employmentType,
  specialization,
  showCost,
}: {
  id: string;
  name: string;
  employmentType: string;
  specialization?: string;
  showCost: boolean;
}) {
  const router = useRouter();
  const { data: summary } = useApi<Summary>(`/api/labour/karigars/${id}/summary`);

  return (
    <tr onClick={() => router.push(`/karigars/${id}`)}>
      <td className="rid">{name}</td>
      <td className="text-ink2">{employmentType === "IN_HOUSE" ? "In-house" : "External"}</td>
      <td className="text-ink2">{specialization ?? "—"}</td>
      <td className="num mono">{formatWeight(summary?.goldHeldG)}</td>
      {showCost && <td className="num mono">{formatINR(summary?.labourEarnedThisMonth ?? 0)}</td>}
      {showCost && (
        <td className="num mono font-semibold" style={{ color: (summary?.netPayable ?? 0) > 0 ? "var(--color-warn-tx)" : undefined }}>
          {formatINR(summary?.netPayable ?? 0)}
        </td>
      )}
    </tr>
  );
}
