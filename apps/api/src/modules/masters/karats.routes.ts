import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";
import { notFound } from "../../utils/httpError";

const router = Router();

router.get(
  "/",
  requireRole("SUPER_ADMIN", "MANAGER", "COSTING", "AUDITOR"),
  asyncHandler(async (_req, res) => {
    res.json(await prisma.karat.findMany({ orderBy: { purityFactor: "desc" } }));
  })
);

const upsertSchema = z.object({
  code: z.string().min(1),
  purityFactor: z.number().min(0).max(1),
});

router.post(
  "/",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const body = upsertSchema.parse(req.body);
    const karat = await prisma.karat.create({ data: body });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "Karat",
      entityId: karat.id,
      after: karat,
      ipAddress: req.ip ?? null,
    });
    res.status(201).json(karat);
  })
);

router.patch(
  "/:id",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const before = await prisma.karat.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound("Karat not found");
    const body = upsertSchema.partial().extend({ isActive: z.boolean().optional() }).parse(req.body);
    const karat = await prisma.karat.update({ where: { id: req.params.id }, data: body });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "Karat",
      entityId: karat.id,
      before,
      after: karat,
      ipAddress: req.ip ?? null,
    });
    res.json(karat);
  })
);

export default router;
