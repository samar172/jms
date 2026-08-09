"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApi, useProcessStages, useCustomers } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";

interface ProductOption {
  id: string;
  serialNo: string;
  designName: string;
  customerId: string | null;
}

function NewJobCardForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: stages } = useProcessStages();
  const { data: customers } = useCustomers();
  const [search, setSearch] = useState("");
  const { data: productResults } = useApi<{ items: ProductOption[] }>(
    search ? `/api/products?search=${encodeURIComponent(search)}&pageSize=8` : `/api/products?pageSize=8`
  );

  const [productId, setProductId] = useState(searchParams.get("productId") ?? "");
  const [customerId, setCustomerId] = useState("");
  const [customerTouched, setCustomerTouched] = useState(false);
  const [targetDate, setTargetDate] = useState("");
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleStage(id: string) {
    setSelectedStages((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  // Default the customer to whoever's already assigned to the product —
  // still overridable, just saves re-picking someone we already know.
  function selectProduct(id: string) {
    setProductId(id);
    if (!customerTouched) {
      const product = productResults?.items.find((p) => p.id === id);
      setCustomerId(product?.customerId ?? "");
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!productId || selectedStages.length === 0) {
      setError("Select a product and at least one process stage");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const orderedStageIds = (stages ?? [])
        .filter((s) => selectedStages.includes(s.id))
        .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
        .map((s) => s.id);
      const jobCard = await apiFetch<{ id: string }>("/api/job-cards", {
        method: "POST",
        body: {
          productId,
          customerId: customerId || undefined,
          targetDeliveryDate: targetDate || undefined,
          processStageIds: orderedStageIds,
        },
      });
      router.push(`/job-cards/${jobCard.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create job card");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-3.5">
        <div className="text-[11px] text-mute mb-1">Manufacturing</div>
        <h1 className="text-[19px] font-semibold text-ink">New Job Card</h1>
      </div>
      <form onSubmit={onSubmit} className="console-panel p-4 space-y-3.5">
        <div>
          <label className="console-field-label">Product</label>
          <input
            className="console-field mb-2"
            placeholder="Search by serial number or design name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select required className="console-field" value={productId} onChange={(e) => selectProduct(e.target.value)}>
            <option value="">Select a product…</option>
            {productResults?.items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.serialNo} — {p.designName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="console-field-label">Customer (optional)</label>
          <select
            className="console-field"
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setCustomerTouched(true);
            }}
          >
            <option value="">— None —</option>
            {customers?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="console-field-label">Target Delivery Date</label>
          <input type="date" className="console-field" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </div>

        <div>
          <label className="console-field-label">Process Stages</label>
          <div className="space-y-1.5">
            {stages
              ?.slice()
              .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
              .map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-[12.5px] text-ink">
                  <input
                    type="checkbox"
                    checked={selectedStages.includes(s.id)}
                    onChange={() => toggleStage(s.id)}
                  />
                  {s.name}
                  <span className="text-mute text-[11px]">(tolerance {s.wastageTolerancePct}%)</span>
                </label>
              ))}
          </div>
        </div>

        {error && <p className="text-sm text-err-tx">{error}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t border-line">
          <button type="button" className="console-btn" onClick={() => router.back()}>
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="console-btn primary">
            {submitting ? "Creating…" : "Create Job Card"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NewJobCardPage() {
  return (
    <Suspense>
      <NewJobCardForm />
    </Suspense>
  );
}
