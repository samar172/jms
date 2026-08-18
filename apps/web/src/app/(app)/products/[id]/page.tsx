"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { apiFetch, ApiError, resolveMediaUrl } from "@/lib/api";
import { ProductStatusPill, JobStageStatusPill } from "@/components/StatusPill";
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
  images: ProductImage[];
  jobCards: JobCard[];
  estimates: Estimate[];
}
interface TimelineEntry {
  type: string;
  timestamp: string;
  description: string;
}

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { data: product, mutate } = useApi<ProductDetail>(`/api/products/${id}`);
  const { data: timeline } = useApi<TimelineEntry[]>(product ? `/api/products/${product.id}/timeline` : null);
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
    <div>
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">
          <Link href="/products" className="hover:text-accent">
            Product
          </Link>{" "}
          / {product.category.name} {product.subcategory ? `/ ${product.subcategory.name}` : ""} /{" "}
          <span className="mono">{product.serialNo}</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[19px] font-semibold flex items-center gap-2.5 text-ink">
              <span className="mono text-accent">{product.serialNo}</span>
              <ProductStatusPill status={product.status} />
            </h1>
            <p className="text-ink2 text-xs mt-0.5">{product.designName}</p>
          </div>
          <div className="flex gap-2">
            {canEdit && (
              <button className="console-btn no-print" onClick={() => setEditing((v) => !v)}>
                {editing ? "Cancel Edit" : "Edit Product"}
              </button>
            )}
            <button className="console-btn" onClick={clone} disabled={cloning}>
              <Copy size={14} /> {cloning ? "Cloning…" : "Clone Design"}
            </button>
            <button className="console-btn no-print" onClick={() => window.print()}>
              Print Job Card
            </button>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-3.5 mt-3.5">
        <div className="lg:col-span-3 space-y-3">
          <div className="console-panel aspect-square flex items-center justify-center overflow-hidden bg-neu-bg">
            {primaryImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveMediaUrl(primaryImage.url)}
                alt={product.designName}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-mute text-sm">No image yet</span>
            )}
          </div>
          {product.images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {product.images.map((img) => (
                <button
                  key={img.id}
                  onClick={() => setActiveImage(img)}
                  className={`shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 ${
                    primaryImage?.id === img.id ? "border-accent" : "border-transparent"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resolveMediaUrl(img.thumbnailUrl ?? img.url)} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <label className="console-btn w-full justify-center cursor-pointer no-print">
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

        <div className="lg:col-span-2 space-y-3">
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
            <div className="console-panel p-3.5">
              <div className="text-[11px] font-bold uppercase text-ink2 tracking-wide mb-2">Specifications</div>
              <dl className="grid grid-cols-2 gap-y-1.5 text-[12.5px]">
                <dt className="text-mute">Category</dt>
                <dd className="text-ink">{product.category.name}</dd>
                <dt className="text-mute">Subcategory</dt>
                <dd className="text-ink">{product.subcategory?.name ?? "—"}</dd>
                <dt className="text-mute">Purity</dt>
                <dd className="text-ink">{product.purity.code}</dd>
                <dt className="text-mute">Gross Weight</dt>
                <dd className="mono text-ink">{formatWeight(product.grossWeightG)}</dd>
                <dt className="text-mute">Net Weight</dt>
                <dd className="mono text-ink">{formatWeight(product.netWeightG)}</dd>
                <dt className="text-mute">Stone Weight</dt>
                <dd className="mono text-ink">{formatCarat(product.stoneWeightCt)}</dd>
                <dt className="text-mute">Size</dt>
                <dd className="text-ink">{product.size ?? "—"}</dd>
                <dt className="text-mute">Created</dt>
                <dd className="text-ink">{formatDate(product.createdAt)}</dd>
                {product.description && (
                  <>
                    <dt className="text-mute">Description</dt>
                    <dd className="text-ink">{product.description}</dd>
                  </>
                )}
              </dl>
            </div>
          )}

          {showCost && (
            <div className="console-panel p-3.5">
              <div className="text-[11px] font-bold uppercase text-ink2 tracking-wide mb-2">Costing Summary</div>
              {latestEstimate ? (
                <div className="text-[12.5px]">
                  <Row label="Material Cost" value={formatINR(Number(latestEstimate.materialCost))} />
                  <Row label="Making Charges" value={formatINR(Number(latestEstimate.makingCharges))} />
                  <Row label="Wastage Cost" value={formatINR(Number(latestEstimate.wastageCost))} />
                  <Row label="Cost" value={formatINR(Number(latestEstimate.cost))} bold />
                  <Row
                    label={`Profit (${Number(latestEstimate.profitPct)}%)`}
                    value={formatINR(Number(latestEstimate.profit))}
                  />
                  <div style={{ marginTop: 8, padding: "10px 14px", background: "#FFF3DA", border: "1px solid #F3DFAE", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span className="font-semibold" style={{ color: "#78350F" }}>Net Amount</span>
                    <span className="mono font-bold" style={{ fontSize: 16, color: "#78350F" }}>
                      {formatINR(Number(latestEstimate.netAmount))}
                    </span>
                  </div>
                  <Link href={`/costing/${latestEstimate.id}`} className="text-accent text-xs inline-block mt-2 font-semibold">
                    View Full Estimate →
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-mute">No estimate created yet.</p>
              )}
            </div>
          )}

          {allStages.length > 0 && (
            <div className="console-panel p-3.5">
              <div className="text-[11px] font-bold uppercase text-ink2 tracking-wide mb-2">Current Status</div>
              <ol className="space-y-1.5">
                {allStages.map((s) => (
                  <li key={s.id} className="flex items-center justify-between text-[12.5px]">
                    <span className="text-ink2">{s.processStage.name}</span>
                    <JobStageStatusPill status={s.status} />
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>

      <div className="console-panel p-3.5 mt-3.5">
        <div className="text-[11px] font-bold uppercase text-ink2 tracking-wide mb-3">Product History</div>
        <ol className="relative border-l border-line ml-2 space-y-3">
          {timeline?.map((e, i) => (
            <li key={i} className="ml-4">
              <div className="absolute w-2 h-2 rounded-full bg-accent -ml-[21px] mt-1.5" />
              <time className="text-xs text-mute">{formatDate(e.timestamp)}</time>
              <p className="text-[12.5px] text-ink">{e.description}</p>
            </li>
          ))}
          {(!timeline || timeline.length === 0) && (
            <p className="text-sm text-mute ml-2">No history yet.</p>
          )}
        </ol>
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
  const [designName, setDesignName] = useState(product.designName);
  const [description, setDescription] = useState(product.description ?? "");
  const [size, setSize] = useState(product.size ?? "");
  const [status, setStatus] = useState(product.status);
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
    <form onSubmit={submit} className="console-panel p-3.5 space-y-2.5">
      <div className="text-[11px] font-bold uppercase text-ink2 tracking-wide mb-1">Edit Product</div>
      <div>
        <label className="console-field-label">Design Name</label>
        <input required className="console-field" value={designName} onChange={(e) => setDesignName(e.target.value)} />
      </div>
      <div>
        <label className="console-field-label">Description</label>
        <textarea className="console-field" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="console-field-label">Size</label>
          <input className="console-field" value={size} onChange={(e) => setSize(e.target.value)} />
        </div>
        <div>
          <label className="console-field-label">Status</label>
          <select className="console-field" value={status} onChange={(e) => setStatus(e.target.value)}>
            {PRODUCT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-err-tx">{error}</p>}
      <div className="flex justify-end gap-2 pt-2 border-t border-line">
        <button type="button" className="console-btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="console-btn primary" disabled={submitting}>
          {submitting ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={bold ? "console-sumrow total" : "console-sumrow"}>
      <span className="l">{label}</span>
      <span className="v">{value}</span>
    </div>
  );
}
