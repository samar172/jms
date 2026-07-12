import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";

const router = Router();

// FR-1.02: full history retained, never mutated. A new row is added for every
// rate change; nothing is ever updated or deleted (BR-03 rate immutability).
router.get(
  "/",
  requireRole("SUPER_ADMIN", "MANAGER", "COSTING", "AUDITOR"),
  asyncHandler(async (_req, res) => {
    const rates = await prisma.goldRate.findMany({ orderBy: { effectiveFrom: "desc" } });
    res.json(rates);
  })
);

router.get(
  "/current",
  requireRole("SUPER_ADMIN", "MANAGER", "COSTING", "AUDITOR"),
  asyncHandler(async (_req, res) => {
    const rate = await prisma.goldRate.findFirst({
      where: { effectiveFrom: { lte: new Date() } },
      orderBy: { effectiveFrom: "desc" },
    });
    res.json(rate);
  })
);

const createSchema = z.object({
  ratePerGram24k: z.number().positive(),
  effectiveFrom: z.coerce.date(),
});

router.post(
  "/",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const rate = await prisma.goldRate.create({
      data: { ...body, createdById: req.user!.id },
    });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "GoldRate",
      entityId: rate.id,
      after: rate,
      ipAddress: req.ip ?? null,
    });
    res.status(201).json(rate);
  })
);

export default router;
