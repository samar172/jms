"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { useApi, useCustomers } from "@/lib/hooks";
import { apiFetch, ApiError, resolveMediaUrl } from "@/lib/api";
import { ProductStatusPill, JobStageStatusPill } from "@/components/StatusPill";
import { ProductTimeline } from "@/components/shared/product-timeline";
import { formatWeight, formatCarat, formatDate, formatINR } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { canSeeCost } from "@jms/shared";

const PRODUCT_STATUSES = ["DESIGN", "ESTIMATED", "IN_PRODUCTION", "FINISHED", "SOLD", "MELTED"] as const;

interface ProductImage {
  id: string;
  type: string;
  url: string;
  thumbnailUrl?: string;
}
interface Estimate {
  id: string;
  type: string;
  version: number;
  status: string;
  materialCost: string;
  makingCharges: string;
  wastageCost: string;
  cost: string;
  profit: string;
  profitPct: string;
  netAmount: string;
}
interface JobStage {
  id: string;
  status: string;
  processStage: { name: string; sequenceOrder: number };
  karigar?: { name: string } | null;
}
interface JobCard {
  id: string;
  stages: JobStage[];
}
interface ProductDetail {
  id: string;
  serialNo: string;
  designName: string;
  description: string | null;
  status: string;
  grossWeightG: string;
  netWeightG: string;
  stoneWeightCt: string | null;
  size: string | null;
  createdAt: string;
  category: { name: string };
  subcategory?: { name: string } | null;
  purity: { code: string };
  customer?: { id: string; name: string } | null;
  images: ProductImage[];
  jobCards: JobCard[];
  estimates: Estimate[];
}
export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { data: product, mutate } = useApi<ProductDetail>(`/api/products/${id}`);
  const [activeImage, setActiveImage] = useState<ProductImage | null>(null);
  const [cloning, setCloning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);

  if (!product) return <div className="text-text-muted">Loading…</div>;

  const showCost = user ? canSeeCost(user.role) : false;
  const canEdit = user?.role === "SUPER_ADMIN" || user?.role === "MANAGER";
  const primaryImage = activeImage ?? product.images[0];
  const latestEstimate = product.estimates[0];
  const allStages = product.jobCards.flatMap((jc) => jc.stages).sort((a, b) => a.processStage.sequenceOrder - b.processStage.sequenceOrder);

  async function clone() {
    setCloning(true);
    try {
      const created = await apiFetch<{ serialNo: string }>(`/api/products/${product!.id}/clone`, { method: "POST" });
      router.push(`/products/${created.serialNo}`);
    } finally {
      setCloning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-sm text-text-muted">
        <Link href="/products" className="hover:text-gold">
          Products
        </Link>{" "}
        / {product.category.name} {product.subcategory ? `/ ${product.subcategory.name}` : ""} /{" "}
        <span className="font-mono">{product.serialNo}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-mono font-bold text-gold">{product.serialNo}</h1>
            <ProductStatusPill status={product.status} />
          </div>
          <p className="text-text-muted">{product.designName}</p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <button className="btn btn-outline no-print" onClick={() => setEditing((v) => !v)}>
              {editing ? "Cancel Edit" : "Edit Product"}
            </button>
          )}
          <button className="btn btn-outline" onClick={clone} disabled={cloning}>
            <Copy size={16} /> {cloning ? "Cloning…" : "Clone Design"}
          </button>
          <button className="btn btn-outline no-print" onClick={() => window.print()}>
            Print Job Card
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <div className="card aspect-square flex items-center justify-center overflow-hidden bg-gold-tint">
            {primaryImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveMediaUrl(primaryImage.url)}
                alt={product.designName}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-gold/40 text-sm">No image yet</span>
            )}
          </div>
          {product.images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {product.images.map((img) => (
                <button
                  key={img.id}
                  onClick={() => setActiveImage(img)}
                  className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 ${
                    primaryImage?.id === img.id ? "border-gold" : "border-transparent"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resolveMediaUrl(img.thumbnailUrl ?? img.url)} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <label className="btn btn-outline w-full cursor-pointer no-print">
            {uploading ? "Uploading…" : "Upload Sketch / Photo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              className="hidden"
              disabled={uploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading(true);
                try {
                  const form = new FormData();
                  form.append("file", file);
                  form.append("type", "FINAL_PRODUCT");
                  form.append("isPrimary", product.images.length === 0 ? "true" : "false");
                  await apiFetch(`/api/products/${product.id}/images`, { method: "POST", body: form, isForm: true });
                  await mutate();
                } finally {
                  setUploading(false);
                  e.target.value = "";
                }
              }}
            />
          </label>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {editing ? (
            <EditProductForm
              product={product}
              onDone={() => {
                setEditing(false);
                mutate();
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="card p-5">
              <h2 className="font-semibold mb-3">Specifications</h2>
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-text-muted">Category</dt>
                <dd>{product.category.name}</dd>
                <dt className="text-text-muted">Subcategory</dt>
                <dd>{product.subcategory?.name ?? "—"}</dd>
                <dt className="text-text-muted">Purity</dt>
                <dd>{product.purity.code}</dd>
                <dt className="text-text-muted">Gross Weight</dt>
                <dd className="tabular">{formatWeight(product.grossWeightG)}</dd>
                <dt className="text-text-muted">Net Weight</dt>
                <dd className="tabular">{formatWeight(product.netWeightG)}</dd>
                <dt className="text-text-muted">Stone Weight</dt>
                <dd className="tabular">{formatCarat(product.stoneWeightCt)}</dd>
                <dt className="text-text-muted">Size</dt>
                <dd>{product.size ?? "—"}</dd>
                <dt className="text-text-muted">Customer</dt>
                <dd>{product.customer?.name ?? "—"}</dd>
                <dt className="text-text-muted">Created</dt>
                <dd>{formatDate(product.createdAt)}</dd>
                {product.description && (
                  <>
                    <dt className="text-text-muted">Description</dt>
                    <dd>{product.description}</dd>
                  </>
                )}
              </dl>
            </div>
          )}

          {showCost && (
            <div className="card p-5">
              <h2 className="font-semibold mb-3">Costing Summary</h2>
              {latestEstimate ? (
                <div className="text-sm space-y-1.5">
                  <Row label="Material Cost" value={formatINR(Number(latestEstimate.materialCost))} />
                  <Row label="Making Charges" value={formatINR(Number(latestEstimate.makingCharges))} />
                  <Row label="Wastage Cost" value={formatINR(Number(latestEstimate.wastageCost))} />
                  <div className="border-t border-border my-2" />
                  <Row label="Cost" value={formatINR(Number(latestEstimate.cost))} bold />
                  <Row
                    label={`Profit (${Number(latestEstimate.profitPct)}%)`}
                    value={formatINR(Number(latestEstimate.profit))}
                  />
                  <div className="border-t-2 border-gold my-2" />
                  <div className="flex justify-between items-baseline bg-gold-tint -mx-5 px-5 py-2 rounded">
                    <span className="font-semibold">Net Amount</span>
                    <span className="text-lg font-bold text-gold tabular">
                      {formatINR(Number(latestEstimate.netAmount))}
                    </span>
                  </div>
                  <Link href={`/costing/${latestEstimate.id}`} className="text-gold text-xs inline-block mt-2">
                    View Full Estimate →
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-text-muted">No estimate created yet.</p>
              )}
            </div>
          )}

          {allStages.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold mb-3">Current Status</h2>
              <ol className="space-y-2">
                {allStages.map((s) => (
                  <li key={s.id} className="flex items-center justify-between text-sm">
                    <span>{s.processStage.name}</span>
                    <JobStageStatusPill status={s.status} />
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-4">Product History</h2>
        <ProductTimeline productId={product.id} />
      </div>
    </div>
  );
}

function EditProductForm({
  product,
  onDone,
  onCancel,
}: {
  product: ProductDetail;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { data: customers } = useCustomers();
  const [designName, setDesignName] = useState(product.designName);
  const [description, setDescription] = useState(product.description ?? "");
  const [size, setSize] = useState(product.size ?? "");
  const [status, setStatus] = useState(product.status);
  const [customerId, setCustomerId] = useState(product.customer?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/products/${product.id}`, {
        method: "PATCH",
        body: {
          designName,
          description: description || undefined,
          size: size || undefined,
          status,
          customerId: customerId || undefined,
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update product");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-3">
      <h2 className="font-semibold mb-1">Edit Product</h2>
      <div>
        <label className="label">Design Name</label>
        <input required className="input" value={designName} onChange={(e) => setDesignName(e.target.value)} />
      </div>
      <div>
        <label className="label">Description</label>
        <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Size</label>
          <input className="input" value={size} onChange={(e) => setSize(e.target.value)} />
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {PRODUCT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Customer</label>
        <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">No customer</option>
          {customers?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={submitting}>
          {submitting ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <span className="text-text-muted">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
