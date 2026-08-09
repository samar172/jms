"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCategories, useKarats, useCustomers } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";

export default function NewProductPage() {
  const router = useRouter();
  const { data: categories } = useCategories();
  const { data: karats } = useKarats();
  const { data: customers } = useCustomers();

  const [designName, setDesignName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [purityId, setPurityId] = useState("");
  const [grossWeightG, setGrossWeightG] = useState("");
  const [stoneWeightCt, setStoneWeightCt] = useState("");
  const [size, setSize] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const activeCategory = categories?.find((c) => c.id === categoryId);
  const netWeight =
    grossWeightG && !Number.isNaN(Number(grossWeightG))
      ? (Number(grossWeightG) - (Number(stoneWeightCt) || 0) * 0.2).toFixed(3)
      : "";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const product = await apiFetch<{ serialNo: string }>("/api/products", {
        method: "POST",
        body: {
          designName,
          categoryId,
          subcategoryId: subcategoryId || undefined,
          purityId,
          grossWeightG: Number(grossWeightG),
          stoneWeightCt: stoneWeightCt ? Number(stoneWeightCt) : undefined,
          size: size || undefined,
          customerId: customerId || undefined,
          description: description || undefined,
        },
      });
      router.push(`/products/${product.serialNo}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create product");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">Product</div>
        <h1 className="text-[19px] font-semibold text-ink">New Product</h1>
      </div>

      <div className="console-panel p-3.5 mb-3.5" style={{ background: "#FFF3DA", borderColor: "#F3DFAE" }}>
        <div className="console-field-label mb-0.5">Serial Number</div>
        <div className="mono text-accent font-bold text-lg">Auto-generated on save</div>
        <p className="text-xs text-ink2 mt-1">
          Cannot be edited once assigned — the format is Category-Purity-YYMM-Sequence.
        </p>
      </div>

      <form onSubmit={onSubmit} className="console-panel p-4 space-y-3.5">
        <div className="grid sm:grid-cols-2 gap-3.5">
          <div>
            <label className="console-field-label">Design Name</label>
            <input required className="console-field" value={designName} onChange={(e) => setDesignName(e.target.value)} />
          </div>
          <div>
            <label className="console-field-label">Category</label>
            <select
              required
              className="console-field"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setSubcategoryId("");
              }}
            >
              <option value="">Select…</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="console-field-label">Subcategory</label>
            <select
              className="console-field"
              value={subcategoryId}
              onChange={(e) => setSubcategoryId(e.target.value)}
              disabled={!activeCategory}
            >
              <option value="">Select…</option>
              {activeCategory?.subcategories.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="console-field-label">Purity</label>
            <select required className="console-field" value={purityId} onChange={(e) => setPurityId(e.target.value)}>
              <option value="">Select…</option>
              {karats?.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="console-field-label">Gross Weight (g)</label>
            <input
              required
              type="number"
              step="0.001"
              min="0"
              className="console-field"
              value={grossWeightG}
              onChange={(e) => setGrossWeightG(e.target.value)}
            />
          </div>
          <div>
            <label className="console-field-label">Stone Weight (crt)</label>
            <input
              type="number"
              step="0.001"
              min="0"
              className="console-field"
              value={stoneWeightCt}
              onChange={(e) => setStoneWeightCt(e.target.value)}
            />
          </div>
          <div>
            <label className="console-field-label">Net Weight (auto)</label>
            <input disabled className="console-field" value={netWeight ? `${netWeight} g` : ""} />
            <p className="text-xs text-mute mt-1">Gross − Stone (0.2 g per carat)</p>
          </div>
          <div>
            <label className="console-field-label">Size / Dimensions</label>
            <input className="console-field" value={size} onChange={(e) => setSize(e.target.value)} />
          </div>
          <div>
            <label className="console-field-label">Customer (optional)</label>
            <select className="console-field" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">— None —</option>
              {customers?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="console-field-label">Description</label>
          <textarea className="console-field" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        {error && <p className="text-sm text-err-tx">{error}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t border-line">
          <button type="button" className="console-btn" onClick={() => router.back()}>
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="console-btn primary">
            {submitting ? "Saving…" : "Save Product"}
          </button>
        </div>
      </form>
    </div>
  );
}
