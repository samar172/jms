"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
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

function ProductsPageInner() {
  const searchParams = useSearchParams();
  const { data: categories } = useCategories();
  const { data: karats } = useKarats();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [purityId, setPurityId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (categoryId) params.set("categoryId", categoryId);
  if (subcategoryId) params.set("subcategoryId", subcategoryId);
  if (purityId) params.set("purityId", purityId);
  if (status) params.set("status", status);
  if (search) params.set("search", search);

  const { data } = useApi<ProductListResponse>(`/api/products?${params.toString()}`);
  const activeCategory = categories?.find((c) => c.id === categoryId);

  return (
    <div>
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">Product</div>
        <h1 className="text-[19px] font-semibold flex items-center gap-2.5 text-ink">
          Design Portfolio
          <span className="text-xs text-mute font-medium">{data ? `${data.total} designs` : ""}</span>
        </h1>
      </div>

      <div className="flex items-center gap-2 flex-wrap py-2.5 border-t border-b border-line -mx-3.5 px-3.5 sm:-mx-[18px] sm:px-[18px] mb-3.5">
        <Link href="/products/new" className="console-btn primary">
          <Plus size={14} /> New Product
        </Link>
        <div className="console-search w-[230px]">
          <Search size={13} />
          <input
            placeholder="Search design name or serial number…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select className="console-field w-auto" value={purityId} onChange={(e) => setPurityId(e.target.value)}>
          <option value="">All purities</option>
          {karats?.map((k) => (
            <option key={k.id} value={k.id}>
              {k.code}
            </option>
          ))}
        </select>
        <select className="console-field w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-2">
        <button
          className={categoryId ? "console-pill neu" : "console-pill info"}
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
            className={categoryId === c.id ? "console-pill info" : "console-pill neu"}
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
        <div className="flex gap-2 overflow-x-auto mb-3.5">
          <button
            className={!subcategoryId ? "console-pill info" : "console-pill neu"}
            onClick={() => setSubcategoryId(null)}
          >
            All
          </button>
          {activeCategory.subcategories.map((s) => (
            <button
              key={s.id}
              className={subcategoryId === s.id ? "console-pill info" : "console-pill neu"}
              onClick={() => setSubcategoryId(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="pgrid">
        {data?.items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      {data?.items.length === 0 && (
        <div className="text-center py-16 text-mute">No products match these filters.</div>
      )}

      {data && data.total > pageSize && (
        <div className="flex items-center justify-center gap-2 pt-3.5">
          <button
            className="console-btn"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span className="text-xs text-mute">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data.total)} of {data.total}
          </span>
          <button
            className="console-btn"
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

export default function ProductsPage() {
  return (
    <Suspense>
      <ProductsPageInner />
    </Suspense>
  );
}
