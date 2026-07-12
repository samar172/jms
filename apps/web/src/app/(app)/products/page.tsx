"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useApi, useCategories, useKarats } from "@/lib/hooks";
import type { ProductCardData } from "@/components/ProductCard";
import { ProductCard } from "@/components/ProductCard";

interface ProductListResponse {
  items: (ProductCardData & { id: string; category: { id: string }; subcategoryId: string | null })[];
  total: number;
  page: number;
  pageSize: number;
}

const STATUSES = ["DESIGN", "ESTIMATED", "IN_PRODUCTION", "FINISHED", "SOLD", "MELTED"];

export default function ProductsPage() {
  const { data: categories } = useCategories();
  const { data: karats } = useKarats();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [purityId, setPurityId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (categoryId) params.set("categoryId", categoryId);
  if (subcategoryId) params.set("subcategoryId", subcategoryId);
  if (purityId) params.set("purityId", purityId);
  if (status) params.set("status", status);

  const { data } = useApi<ProductListResponse>(`/api/products?${params.toString()}`);
  const activeCategory = categories?.find((c) => c.id === categoryId);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Product Catalogue</h1>
          <p className="text-sm text-text-muted">{data ? `${data.total} designs` : "Loading…"}</p>
        </div>
        <Link href="/products/new" className="btn btn-primary">
          <Plus size={16} /> New Product
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          className={`pill ${!categoryId ? "bg-gold text-white" : "pill-neutral"} shrink-0`}
          onClick={() => {
            setCategoryId(null);
            setSubcategoryId(null);
            setPage(1);
          }}
        >
          All
        </button>
        {categories?.map((c) => (
          <button
            key={c.id}
            className={`pill ${categoryId === c.id ? "bg-gold text-white" : "pill-neutral"} shrink-0`}
            onClick={() => {
              setCategoryId(c.id);
              setSubcategoryId(null);
              setPage(1);
            }}
          >
            {c.name}
          </button>
        ))}
      </div>

      {activeCategory && activeCategory.subcategories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          <button
            className={`pill text-xs ${!subcategoryId ? "bg-gold-tint text-gold" : "pill-neutral"} shrink-0`}
            onClick={() => setSubcategoryId(null)}
          >
            All
          </button>
          {activeCategory.subcategories.map((s) => (
            <button
              key={s.id}
              className={`pill text-xs ${subcategoryId === s.id ? "bg-gold-tint text-gold" : "pill-neutral"} shrink-0`}
              onClick={() => setSubcategoryId(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="card p-3 flex flex-wrap gap-3 items-center">
        <select className="input w-auto" value={purityId} onChange={(e) => setPurityId(e.target.value)}>
          <option value="">All purities</option>
          {karats?.map((k) => (
            <option key={k.id} value={k.id}>
              {k.code}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {data?.items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      {data?.items.length === 0 && (
        <div className="text-center py-16 text-text-muted">No products match these filters.</div>
      )}

      {data && data.total > pageSize && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            className="btn btn-outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span className="text-sm text-text-muted">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data.total)} of {data.total}
          </span>
          <button
            className="btn btn-outline"
            disabled={page * pageSize >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
