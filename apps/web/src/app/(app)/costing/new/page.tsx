"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useApi } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";

interface ProductOption {
  id: string;
  serialNo: string;
  designName: string;
}

function NewEstimateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const { data: productResults } = useApi<{ items: ProductOption[] }>(
    search ? `/api/products?search=${encodeURIComponent(search)}&pageSize=8` : `/api/products?pageSize=8`
  );

  const [productId, setProductId] = useState(searchParams.get("productId") ?? "");
  const [type, setType] = useState<"ROUGH_ESTIMATE" | "FINAL_COSTING">("ROUGH_ESTIMATE");
  const [profitPct, setProfitPct] = useState("12");
  const [gstPct, setGstPct] = useState("3");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const estimate = await apiFetch<{ id: string }>("/api/estimates", {
        method: "POST",
        body: { productId, type, profitPct: Number(profitPct), gstPct: Number(gstPct), lines: [] },
      });
      router.push(`/costing/${estimate.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create estimate");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg space-y-5">
      <h1 className="text-xl font-semibold">New Estimate</h1>
      <form onSubmit={onSubmit} className="card p-6 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Product</label>
            <Link href="/products/new" target="_blank" className="text-xs text-gold hover:underline">
              + Add New Design
            </Link>
          </div>
          <input
            className="input mb-2"
            placeholder="Search by serial number or design name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select required className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Select a product…</option>
            {productResults?.items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.serialNo} — {p.designName}
              </option>
            ))}
          </select>
          <p className="text-xs text-text-muted mt-1">Design not listed yet? Add it in the new tab, then search for it here.</p>
        </div>
        <div>
          <label className="label">Estimate Type</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="ROUGH_ESTIMATE">Rough Estimate</option>
            <option value="FINAL_COSTING">Final Costing</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Profit %</label>
            <input type="number" step="0.01" className="input" value={profitPct} onChange={(e) => setProfitPct(e.target.value)} />
          </div>
          <div>
            <label className="label">GST %</label>
            <input type="number" step="0.01" className="input" value={gstPct} onChange={(e) => setGstPct(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button type="button" className="btn btn-ghost" onClick={() => router.back()}>
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="btn btn-primary">
            {submitting ? "Creating…" : "Create Estimate"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NewEstimatePage() {
  return (
    <Suspense>
      <NewEstimateForm />
    </Suspense>
  );
}
