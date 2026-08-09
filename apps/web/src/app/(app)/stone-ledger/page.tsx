"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useApi, useStoneTypes } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { formatCarat } from "@/lib/format";

interface StoneRow {
  id: string;
  stoneCode: string;
  caratWeight: string;
  status: "IN_STOCK" | "ISSUED" | "RETURNED" | "SET" | "SOLD";
  stoneType: { name: string; category: string };
  currentKarigar: { id: string; name: string } | null;
  currentJobStage: { jobCard: { product: { serialNo: string } } } | null;
}

const STATUS_PILL: Record<string, string> = {
  IN_STOCK: "ok",
  ISSUED: "info",
  RETURNED: "neu",
  SET: "warn",
  SOLD: "neu",
};

export default function StoneLedgerPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  const { data: stones, mutate } = useApi<StoneRow[]>(`/api/stones${params.toString() ? `?${params}` : ""}`);

  return (
    <div>
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">Material</div>
        <h1 className="text-[19px] font-semibold flex items-center gap-2.5 text-ink">
          Stone / Diamond / Polki Ledger
          <span className="text-xs text-mute font-medium">{stones ? `${stones.length} stones` : ""}</span>
        </h1>
      </div>

      <div className="flex items-center gap-2 flex-wrap py-2.5 border-t border-b border-line -mx-3.5 px-3.5 sm:-mx-[18px] sm:px-[18px] mb-3.5">
        <button className="console-btn primary" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? "Cancel" : "+ New Stone"}
        </button>
        <div className="console-search w-[220px]">
          <Search size={13} />
          <input placeholder="Search stone ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="console-field w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="IN_STOCK">In Stock</option>
          <option value="ISSUED">Issued</option>
          <option value="RETURNED">Returned</option>
          <option value="SET">Set</option>
          <option value="SOLD">Sold</option>
        </select>
      </div>

      {showAdd && (
        <div className="console-panel p-3.5 mb-3.5">
          <AddStoneForm
            onDone={() => {
              setShowAdd(false);
              mutate();
            }}
          />
        </div>
      )}

      <div className="console-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="console-table">
            <thead>
              <tr>
                <th>Stone ID</th>
                <th>Type</th>
                <th className="num">Carat</th>
                <th>Current Location</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {stones?.map((s) => (
                <tr key={s.id} onClick={() => router.push(`/stone-ledger/${s.id}`)}>
                  <td className="rid">{s.stoneCode}</td>
                  <td className="text-ink2">{s.stoneType.name}</td>
                  <td className="num mono">{formatCarat(s.caratWeight)}</td>
                  <td className="text-ink2">
                    {s.currentKarigar?.name ?? (s.currentJobStage ? s.currentJobStage.jobCard.product.serialNo : "In store")}
                  </td>
                  <td>
                    <span className={`console-pill ${STATUS_PILL[s.status]}`}>{s.status.replace(/_/g, " ")}</span>
                  </td>
                </tr>
              ))}
              {stones?.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-mute">
                    No stones recorded yet.
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

function AddStoneForm({ onDone }: { onDone: () => void }) {
  const { data: stoneTypes } = useStoneTypes();
  const [stoneTypeId, setStoneTypeId] = useState("");
  const [caratWeight, setCaratWeight] = useState("");
  const [shape, setShape] = useState("");
  const [colour, setColour] = useState("");
  const [clarity, setClarity] = useState("");
  const [certification, setCertification] = useState("");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/stones", {
        method: "POST",
        body: {
          stoneTypeId,
          caratWeight: Number(caratWeight),
          shape: shape || undefined,
          colour: colour || undefined,
          clarity: clarity || undefined,
          certification: certification || undefined,
          purchaseCost: purchaseCost ? Number(purchaseCost) : undefined,
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add stone");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="console-field-label">Stone Type</label>
        <select required className="console-field" value={stoneTypeId} onChange={(e) => setStoneTypeId(e.target.value)}>
          <option value="">Select…</option>
          {stoneTypes?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="console-field-label">Carat Weight</label>
        <input required type="number" step="0.001" className="console-field w-24" value={caratWeight} onChange={(e) => setCaratWeight(e.target.value)} />
      </div>
      <div>
        <label className="console-field-label">Shape</label>
        <input className="console-field w-28" value={shape} onChange={(e) => setShape(e.target.value)} />
      </div>
      <div>
        <label className="console-field-label">Colour</label>
        <input className="console-field w-20" value={colour} onChange={(e) => setColour(e.target.value)} />
      </div>
      <div>
        <label className="console-field-label">Clarity</label>
        <input className="console-field w-20" value={clarity} onChange={(e) => setClarity(e.target.value)} />
      </div>
      <div>
        <label className="console-field-label">Certification</label>
        <input className="console-field w-36" value={certification} onChange={(e) => setCertification(e.target.value)} />
      </div>
      <div>
        <label className="console-field-label">Purchase Cost (₹)</label>
        <input type="number" step="0.01" className="console-field w-32" value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} />
      </div>
      <button className="console-btn primary" disabled={submitting}>
        {submitting ? "Adding…" : "Add Stone"}
      </button>
      {error && <p className="text-sm text-err-tx w-full">{error}</p>}
    </form>
  );
}
