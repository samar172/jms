import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import sharp from "sharp";
import { env } from "../env";

/**
 * Local-disk image storage for development. FR-8.05 specifies object storage
 * (S3 or equivalent) with signed URLs in production — swap this module for
 * an S3-backed implementation behind the same interface when deploying.
 * sharp() strips EXIF (including GPS location, FR-8.06) by default since we
 * never call .withMetadata(); .rotate() bakes in EXIF orientation first so
 * images don't appear sideways once that metadata is dropped.
 */
export async function storeProductImage(
  productId: string,
  buffer: Buffer
): Promise<{ url: string; thumbnailUrl: string }> {
  const dir = path.join(env.UPLOAD_DIR, "products", productId);
  await fs.mkdir(dir, { recursive: true });

  const id = crypto.randomUUID();
  const originalName = `${id}.webp`;
  const thumbName = `${id}-thumb.webp`;

  const pipeline = sharp(buffer).rotate();
  await pipeline.clone().webp({ quality: 90 }).toFile(path.join(dir, originalName));
  await pipeline
    .clone()
    .resize(400, 400, { fit: "cover" })
    .webp({ quality: 80 })
    .toFile(path.join(dir, thumbName));

  return {
    url: `/uploads/products/${productId}/${originalName}`,
    thumbnailUrl: `/uploads/products/${productId}/${thumbName}`,
  };
}
