import { v2 as cloudinary } from "cloudinary";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { env } from "../env";

// We rely on the CLOUDINARY_URL environment variable to automatically configure the SDK.
// e.g. cloudinary://my_key:my_secret@my_cloud_name
if (env.CLOUDINARY_URL) {
  cloudinary.config({
    secure: true,
  });
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/**
 * Stores a product image and returns its URL plus a thumbnail URL.
 * Uses Cloudinary when CLOUDINARY_URL is configured; otherwise falls back to
 * local disk under UPLOAD_DIR (served statically at /uploads — see app.ts),
 * so image upload works out of the box without external credentials.
 */
export async function storeProductImage(
  productId: string,
  buffer: Buffer,
  mimetype: string
): Promise<{ url: string; thumbnailUrl: string }> {
  return env.CLOUDINARY_URL
    ? storeProductImageCloudinary(productId, buffer)
    : storeProductImageLocal(productId, buffer, mimetype);
}

async function storeProductImageLocal(
  productId: string,
  buffer: Buffer,
  mimetype: string
): Promise<{ url: string; thumbnailUrl: string }> {
  const ext = EXT_BY_MIME[mimetype] ?? "jpg";
  const dir = path.join(path.resolve(env.UPLOAD_DIR), "products", productId);
  await fs.mkdir(dir, { recursive: true });

  const filename = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(dir, filename), buffer);
  const url = `/uploads/products/${productId}/${filename}`;

  let thumbnailUrl = url;
  try {
    const thumbBuffer = await sharp(buffer).resize(400, 400, { fit: "cover" }).webp({ quality: 80 }).toBuffer();
    const thumbFilename = `thumb_${crypto.randomUUID()}.webp`;
    await fs.writeFile(path.join(dir, thumbFilename), thumbBuffer);
    thumbnailUrl = `/uploads/products/${productId}/${thumbFilename}`;
  } catch (err) {
    console.error("Failed to generate local thumbnail, using original image instead:", err);
  }

  return { url, thumbnailUrl };
}

async function storeProductImageCloudinary(
  productId: string,
  buffer: Buffer
): Promise<{ url: string; thumbnailUrl: string }> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `jms/products/${productId}`,
        resource_type: "image",
      },
      (error, result) => {
        if (error || !result) {
          console.error("Cloudinary upload failed:", error);
          return reject(error || new Error("Unknown Cloudinary upload error"));
        }

        // Generate a thumbnail URL directly using Cloudinary's transformation API
        const thumbnailUrl = cloudinary.url(result.public_id, {
          width: 400,
          height: 400,
          crop: "fill",
          quality: 80,
          format: "webp",
          secure: true,
        });

        resolve({
          url: result.secure_url,
          thumbnailUrl,
        });
      }
    );

    uploadStream.end(buffer);
  });
}

/**
 * Deletes an image from wherever it was stored (Cloudinary or local disk).
 */
export async function deleteProductImageFile(url: string): Promise<void> {
  if (url.startsWith("/uploads/")) {
    try {
      await fs.unlink(path.join(path.resolve(env.UPLOAD_DIR), url.slice("/uploads/".length)));
    } catch (err) {
      console.error("Failed to delete local image file:", err);
    }
    return;
  }

  if (!env.CLOUDINARY_URL || !url.includes("cloudinary.com")) return;

  try {
    // A simplified extraction of the public_id from a Cloudinary URL:
    // .../upload/v1234567890/folder/filename.ext -> folder/filename
    const parts = url.split("/upload/");
    if (parts.length > 1) {
      const pathPart = parts[1];
      const withoutVersion = pathPart.replace(/^v\d+\//, "");
      const publicId = withoutVersion.substring(0, withoutVersion.lastIndexOf("."));

      await cloudinary.uploader.destroy(publicId);
    }
  } catch (err) {
    console.error("Failed to delete image from Cloudinary:", err);
  }
}
