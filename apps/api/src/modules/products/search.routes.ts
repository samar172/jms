import { Router } from "express";
import multer from "multer";
import { prisma } from "../../db";
import { asyncHandler } from "../../utils/asyncHandler";
import { embedImage } from "./vision.service";
import { badRequest } from "../../utils/httpError";

const router = Router();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit

// R-09 / FR-9.01: Visual Search
router.post(
  "/visual-search",
  upload.single("image"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("Image file is required");

    // 1. Generate embedding using Azure Vision
    const vector = await embedImage(req.file.buffer);

    // 2. Format vector as a string for pgvector: '[1.1, 2.2, ...]'
    const vectorStr = `[${vector.join(",")}]`;

    // 3. Perform vector similarity search (L2 distance: <->)
    // We only want active images, and we will join the Product to return design details.
    const results = await prisma.$queryRaw`
      SELECT 
        pi.id as "imageId", 
        pi.url as "imageUrl", 
        pi."productId",
        p."serialNo",
        p."designName",
        p.status,
        (pi.embedding <-> ${vectorStr}::vector) as distance
      FROM "ProductImage" pi
      JOIN "Product" p ON p.id = pi."productId"
      WHERE pi."isActive" = true AND pi.embedding IS NOT NULL
      ORDER BY pi.embedding <-> ${vectorStr}::vector
      LIMIT 12;
    `;

    res.json(results);
  })
);

export default router;
