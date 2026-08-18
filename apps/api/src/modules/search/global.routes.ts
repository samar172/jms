import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

const router = Router();

// Cmd+K global search — one call, a handful of results per entity type.
// Deliberately capped (5 each) and read-only; not a full-text search engine.
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const q = z.string().min(1).parse(req.query.q);
    const insensitive = { contains: q, mode: "insensitive" as const };

    const [products, jobCards, karigars] = await Promise.all([
      prisma.product.findMany({
        where: { OR: [{ serialNo: insensitive }, { designName: insensitive }] },
        select: { id: true, serialNo: true, designName: true, status: true },
        take: 5,
      }),
      prisma.jobCard.findMany({
        where: { product: { OR: [{ serialNo: insensitive }, { designName: insensitive }] } },
        select: { id: true, status: true, product: { select: { serialNo: true, designName: true } } },
        take: 5,
      }),
      prisma.karigar.findMany({
        where: { name: insensitive },
        select: { id: true, name: true, code: true },
        take: 5,
      }),
    ]);

    res.json({ products, jobCards, karigars });
  })
);

export default router;
