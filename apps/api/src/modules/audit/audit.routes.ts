import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireRole, requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

const router = Router();

// FR-11.03/11.04: read-only to every role, including Super Admin.
router.get(
  "/",
  requireRole("SUPER_ADMIN", "MANAGER", "AUDITOR"),
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        userId: z.string().optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);

    const where = {
      ...(q.entityType && { entityType: q.entityType }),
      ...(q.entityId && { entityId: q.entityId }),
      ...(q.userId && { userId: q.userId }),
      ...(q.from || q.to
        ? { createdAt: { ...(q.from && { gte: q.from }), ...(q.to && { lte: q.to }) } }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { name: true, role: true } } },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  })
);

export default router;
