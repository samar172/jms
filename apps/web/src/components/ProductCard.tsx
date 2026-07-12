import Link from "next/link";
import { ProductStatusPill } from "./StatusPill";
import { formatWeight, formatCarat } from "@/lib/format";
import { resolveMediaUrl } from "@/lib/api";

export interface ProductCardData {
  serialNo: string;
  designName: string;
  status: string;
  grossWeightG: string;
  stoneWeightCt?: string | null;
  purity?: { code: string };
  images: { thumbnailUrl?: string | null; url: string }[];
}

export function ProductCard({ product }: { product: ProductCardData }) {
  const image = product.images[0];
  return (
    <Link
      href={`/products/${product.serialNo}`}
      className="card overflow-hidden group block"
    >
      <div className="aspect-square bg-gold-tint relative overflow-hidden">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveMediaUrl(image.thumbnailUrl ?? image.url)}
            alt={product.designName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gold/40 text-xs">
            No image
          </div>
        )}
        <div className="absolute top-2 right-2">
          <ProductStatusPill status={product.status} />
        </div>
      </div>
      <div className="p-3">
        <div className="font-mono font-semibold text-gold text-sm">{product.serialNo}</div>
        <div className="text-sm text-text truncate">{product.designName}</div>
        <div className="text-xs text-text-muted mt-1">
          {product.purity?.code ?? "—"} · {formatWeight(product.grossWeightG)}
          {product.stoneWeightCt ? ` · ${formatCarat(product.stoneWeightCt)}` : ""}
        </div>
      </div>
    </Link>
  );
}
