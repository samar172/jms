import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";

const router = Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(
      await prisma.processStage.findMany({
        where: { isActive: true },
        orderBy: { sequenceOrder: "asc" },
      })
    );
  })
);

const upsertSchema = z.object({
  name: z.string().min(1),
  sequenceOrder: z.number().int().nonnegative(),
  wastageTolerancePct: z.number().min(0).max(100),
});

router.post(
  "/",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const body = upsertSchema.parse(req.body);
    const stage = await prisma.processStage.create({ data: body });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "ProcessStage",
      entityId: stage.id,
      after: stage,
      ipAddress: req.ip ?? null,
    });
    res.status(201).json(stage);
  })
);

router.patch(
  "/:id",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const before = await prisma.processStage.findUniqueOrThrow({ where: { id: req.params.id } });
    const body = upsertSchema.partial().extend({ isActive: z.boolean().optional() }).parse(req.body);
    const stage = await prisma.processStage.update({ where: { id: req.params.id }, data: body });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "ProcessStage",
      entityId: stage.id,
      before,
      after: stage,
      ipAddress: req.ip ?? null,
    });
    res.json(stage);
  })
);

export default router;
