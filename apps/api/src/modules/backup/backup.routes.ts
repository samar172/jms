import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireSuperAdmin } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

const router = Router();

/**
 * Business-data backup as a single JSON snapshot. Super-admin only.
 *
 * - scope=all: every business table (masters + transactions + config).
 * - scope=range: masters in full (reference data) plus only the job cards,
 *   bulk stock movements and audit entries created within [from, to].
 *
 * Deliberately EXCLUDES password hashes and refresh tokens — a backup should be
 * safe to store off-box. Dates serialise as ISO, decimals as exact strings, so
 * the snapshot is faithful and restorable.
 */

const querySchema = z.object({
  scope: z.enum(["all", "range"]).default("all"),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const jobCardInclude = {
  itemMaster: { select: { serialNo: true, designName: true } },
  series: { select: { name: true } },
  stages: {
    include: {
      assignments: {
        include: { issues: true, stones: true, labour: true, subItems: true },
      },
    },
  },
  activity: true,
  reversals: true,
} as const;

router.get(
  "/",
  requireAuth,
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const q = querySchema.parse(req.query);
    const ranged = q.scope === "range";
    // Inclusive end-of-day for `to`.
    const to = q.to ? new Date(q.to.getTime() + 24 * 60 * 60 * 1000 - 1) : undefined;
    const createdWithin =
      ranged && (q.from || to)
        ? { createdAt: { ...(q.from && { gte: q.from }), ...(to && { lte: to }) } }
        : {};

    const [
      karigars, karigarRates, products, productImages,
      jobCards, bulkIssues, bulkReceipts,
      purityTiers, stoneTypes, categories, subcategories,
      findingNames, subItemNames, workTypeNames, jobCardSeries,
      appSettings, roles, users, changeRequests, auditLog,
    ] = await Promise.all([
      prisma.karigar.findMany(),
      prisma.karigarStageRate.findMany(),
      prisma.product.findMany(),
      prisma.productImage.findMany({ where: { isActive: true } }),
      prisma.prodJobCard.findMany({ where: createdWithin, include: jobCardInclude, orderBy: { createdAt: "desc" } }),
      prisma.bulkStockIssue.findMany({ where: createdWithin }),
      prisma.bulkStockReceipt.findMany({ where: createdWithin }),
      prisma.purityTier.findMany(),
      prisma.stoneType.findMany(),
      prisma.category.findMany(),
      prisma.subcategory.findMany(),
      prisma.prodFindingName.findMany(),
      prisma.prodSubItemName.findMany(),
      prisma.prodWorkTypeName.findMany(),
      prisma.prodJobCardSeries.findMany(),
      prisma.appSetting.findMany(),
      prisma.appRole.findMany({ include: { permissions: true } }),
      prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true, appRoleId: true, isActive: true, karigarId: true, createdAt: true },
      }),
      prisma.changeRequest.findMany({ where: ranged ? createdWithin : {} }),
      prisma.auditLog.findMany({ where: createdWithin, orderBy: { createdAt: "desc" }, take: 20000 }),
    ]);

    const payload = {
      meta: {
        app: "JMS Silver ERP",
        generatedAt: new Date().toISOString(),
        generatedBy: req.user!.name,
        scope: q.scope,
        from: q.from?.toISOString() ?? null,
        to: q.to?.toISOString() ?? null,
      },
      counts: {
        karigars: karigars.length,
        designs: products.length,
        jobCards: jobCards.length,
        bulkIssues: bulkIssues.length,
        bulkReceipts: bulkReceipts.length,
        users: users.length,
        roles: roles.length,
        auditEntries: auditLog.length,
      },
      data: {
        karigars, karigarRates, products, productImages,
        jobCards, bulkIssues, bulkReceipts,
        purityTiers, stoneTypes, categories, subcategories,
        findingNames, subItemNames, workTypeNames, jobCardSeries,
        appSettings, roles, users, changeRequests, auditLog,
      },
    };

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const name = ranged ? `jms-backup-range-${stamp}.json` : `jms-backup-full-${stamp}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.send(JSON.stringify(payload, null, 2));
  }),
);

export default router;
