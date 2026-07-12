import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";
import { canSeeCost } from "@jms/shared";

const router = Router();

// Names/categories are needed broadly (e.g. Store recording a stone receipt);
// the default rate per carat is cost data and is stripped for non-costing roles.
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const stoneTypes = await prisma.stoneType.findMany({ where: { isActive: true } });
    const visible = canSeeCost(req.user!.role);
    res.json(
      visible ? stoneTypes : stoneTypes.map(({ defaultRatePerCarat: _r, ...rest }) => rest)
    );
  })
);

const upsertSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["POLKI", "DIAMOND", "COLOURED_STONE"]),
  defaultRatePerCarat: z.number().positive().optional(),
});

router.post(
  "/",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const body = upsertSchema.parse(req.body);
    const stoneType = await prisma.stoneType.create({ data: body });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "StoneType",
      entityId: stoneType.id,
      after: stoneType,
      ipAddress: req.ip ?? null,
    });
    res.status(201).json(stoneType);
  })
);

router.patch(
  "/:id",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const before = await prisma.stoneType.findUniqueOrThrow({ where: { id: req.params.id } });
    const body = upsertSchema.partial().extend({ isActive: z.boolean().optional() }).parse(req.body);
    const stoneType = await prisma.stoneType.update({ where: { id: req.params.id }, data: body });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "StoneType",
      entityId: stoneType.id,
      before,
      after: stoneType,
      ipAddress: req.ip ?? null,
    });
    res.json(stoneType);
  })
);

export default router;
