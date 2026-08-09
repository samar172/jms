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
      className="border border-line rounded-md overflow-hidden bg-panel block hover:border-accent transition-colors"
    >
      <div className="aspect-square bg-neu-bg relative overflow-hidden">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveMediaUrl(image.thumbnailUrl ?? image.url)}
            alt={product.designName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-mute text-xs">
            No image
          </div>
        )}
        <div className="absolute top-2 right-2">
          <ProductStatusPill status={product.status} />
        </div>
      </div>
      <div className="p-2.5">
        <div className="mono font-bold text-accent text-[11px]">{product.serialNo}</div>
        <div className="text-[12.5px] font-semibold text-ink truncate mt-0.5">{product.designName}</div>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {product.purity?.code && <span className="tagchip">{product.purity.code}</span>}
          <span className="tagchip">{formatWeight(product.grossWeightG)}</span>
          {product.stoneWeightCt && <span className="tagchip">{formatCarat(product.stoneWeightCt)}</span>}
        </div>
      </div>
    </Link>
  );
}
