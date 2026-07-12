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
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      include: { subcategories: { where: { isActive: true } } },
      orderBy: { name: "asc" },
    });
    res.json(categories);
  })
);

const categorySchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(6).toUpperCase(),
});

router.post(
  "/",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const body = categorySchema.parse(req.body);
    const category = await prisma.category.create({ data: body });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "Category",
      entityId: category.id,
      after: category,
      ipAddress: req.ip ?? null,
    });
    res.status(201).json(category);
  })
);

const subcategorySchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1),
});

router.post(
  "/subcategories",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const body = subcategorySchema.parse(req.body);
    const subcategory = await prisma.subcategory.create({ data: body });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "Subcategory",
      entityId: subcategory.id,
      after: subcategory,
      ipAddress: req.ip ?? null,
    });
    res.status(201).json(subcategory);
  })
);

export default router;
