"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useApi, useKarigars, useCustomers } from "@/lib/hooks";
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
  const [customerId, setCustomerId] = useState("");
  const [karigarId, setKarigarId] = useState("");
  const [profitPct, setProfitPct] = useState("12");
  const [gstPct, setGstPct] = useState("3");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const { data: customers, mutate: mutateCustomers } = useCustomers();
  const { data: karigars } = useKarigars();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // Every new estimate starts as a Rough Estimate — that's the exploratory
      // stage where the same design can be priced for different prospective
      // customers. Final Costing only comes later, via "Convert to Final
      // Costing" on an approved rough estimate.
      const estimate = await apiFetch<{ id: string }>("/api/estimates", {
        method: "POST",
        body: {
          productId,
          type: "ROUGH_ESTIMATE",
          profitPct: Number(profitPct),
          gstPct: Number(gstPct),
          lines: [],
          ...(customerId ? { customerId } : {}),
          ...(karigarId ? { karigarId } : {}),
        },
      });
      router.push(`/costing/${estimate.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create estimate");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg">
      <div className="mb-3.5">
        <div className="text-[11px] text-mute mb-1">Sales</div>
        <h1 className="text-[19px] font-semibold text-ink">New Estimate</h1>
      </div>
      <form onSubmit={onSubmit} className="console-panel p-4 space-y-3.5">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="console-field-label !mb-0 !mt-0">Product</label>
            <Link href="/products/new" target="_blank" className="text-xs text-accent hover:underline">
              + Add New Design
            </Link>
          </div>
          <input
            className="console-field mb-2"
            placeholder="Search by serial number or design name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select required className="console-field" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Select a product…</option>
            {productResults?.items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.serialNo} — {p.designName}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-mute mt-1">Design not listed yet? Add it in the new tab, then search for it here.</p>
        </div>

        {productId && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="console-field-label !mb-0 !mt-0">Customer</label>
              <button type="button" className="text-xs text-accent hover:underline" onClick={() => setShowAddCustomer((v) => !v)}>
                {showAddCustomer ? "Cancel" : "+ Add Customer"}
              </button>
            </div>
            {showAddCustomer ? (
              <InlineAddCustomer
                onCreated={(c) => {
                  mutateCustomers([...(customers ?? []), c], { revalidate: false });
                  setCustomerId(c.id);
                  setShowAddCustomer(false);
                }}
                onCancel={() => setShowAddCustomer(false)}
              />
            ) : (
              <select className="console-field" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Select a customer…</option>
                {customers?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <p className="text-[11px] text-mute mt-1">Same design, different customer? Just pick who this particular estimate is for.</p>
          </div>
        )}

        <div>
          <label className="console-field-label">Karigar (optional)</label>
          <select className="console-field" value={karigarId} onChange={(e) => setKarigarId(e.target.value)}>
            <option value="">No karigar yet…</option>
            {karigars?.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <label className="console-field-label">Profit %</label>
            <input type="number" step="0.01" className="console-field" value={profitPct} onChange={(e) => setProfitPct(e.target.value)} />
          </div>
          <div>
            <label className="console-field-label">GST %</label>
            <input type="number" step="0.01" className="console-field" value={gstPct} onChange={(e) => setGstPct(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-sm text-err-tx">{error}</p>}
        <div className="flex justify-end gap-2 pt-2 border-t border-line">
          <button type="button" className="console-btn" onClick={() => router.back()}>
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="console-btn primary">
            {submitting ? "Creating…" : "Create Estimate"}
          </button>
        </div>
      </form>
    </div>
  );
}

function InlineAddCustomer({
  onCreated,
  onCancel,
}: {
  onCreated: (c: { id: string; name: string; contact?: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deliberately a <div>, not a <form> — this renders inside the outer
  // New Estimate <form>, and nested <form> elements are invalid HTML. The
  // browser silently drops the inner tag on parse, which left this button
  // submitting the OUTER form (creating the estimate and navigating away)
  // instead of running this component's own submit logic.
  async function submit() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const customer = await apiFetch<{ id: string; name: string; contact?: string }>("/api/masters/customers", {
        method: "POST",
        body: { name, contact: contact || undefined },
      });
      onCreated(customer);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add customer");
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div onKeyDown={handleKeyDown} className="flex flex-wrap items-end gap-2 bg-neu-bg p-3 rounded-md">
      <div>
        <label className="console-field-label">Name</label>
        <input required className="console-field w-40" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="console-field-label">Contact (optional)</label>
        <input className="console-field w-36" value={contact} onChange={(e) => setContact(e.target.value)} />
      </div>
      <button type="button" className="console-btn primary" disabled={submitting} onClick={submit}>
        {submitting ? "Adding…" : "Add"}
      </button>
      <button type="button" className="console-btn" onClick={onCancel}>
        Cancel
      </button>
      {error && <p className="text-sm text-err-tx w-full">{error}</p>}
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
