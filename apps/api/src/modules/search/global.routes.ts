import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { canSeeCost } from "@jms/shared";

const router = Router();

// Cmd+K global search — one call, a handful of results per entity type.
// Deliberately capped (5 each) and read-only; not a full-text search engine.
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const q = z.string().min(1).parse(req.query.q);
    const insensitive = { contains: q, mode: "insensitive" as const };
    const showCost = canSeeCost(req.user!.role);

    const [customers, products, jobCards, karigars, orders, estimates] = await Promise.all([
      prisma.customer.findMany({
        where: { name: insensitive },
        select: { id: true, name: true, contact: true },
        take: 5,
      }),
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
      prisma.order.findMany({
        where: {
          OR: [
            { orderNo: insensitive },
            { product: { serialNo: insensitive } },
            { product: { designName: insensitive } },
            { customer: { name: insensitive } },
          ],
        },
        select: { id: true, orderNo: true, status: true, product: { select: { serialNo: true, designName: true } } },
        take: 5,
      }),
      showCost
        ? prisma.estimate.findMany({
            where: { product: { OR: [{ serialNo: insensitive }, { designName: insensitive }] } },
            select: { id: true, type: true, version: true, status: true, product: { select: { serialNo: true, designName: true } } },
            take: 5,
          })
        : Promise.resolve([]),
    ]);

    res.json({ customers, products, jobCards, karigars, orders, estimates });
  })
);

export default router;
