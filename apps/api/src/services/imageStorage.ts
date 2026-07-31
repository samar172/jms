import { v2 as cloudinary } from "cloudinary";
import { env } from "../env";

// We rely on the CLOUDINARY_URL environment variable to automatically configure the SDK.
// e.g. cloudinary://my_key:my_secret@my_cloud_name
if (env.CLOUDINARY_URL) {
  cloudinary.config({
    secure: true,
  });
}

/**
 * Uploads an image buffer directly to Cloudinary.
 * Returns the secure URL of the uploaded image and a generated thumbnail URL.
 */
export async function storeProductImage(
  productId: string,
  buffer: Buffer
): Promise<{ url: string; thumbnailUrl: string }> {
  if (!env.CLOUDINARY_URL) {
    throw new Error("CLOUDINARY_URL is not configured.");
  }

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
 * Deletes an image from Cloudinary (using its URL to infer the public_id).
 */
export async function deleteProductImageFile(url: string): Promise<void> {
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
