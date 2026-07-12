import { Router } from "express";
import { prisma } from "../../db";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { canSeeCost } from "@jms/shared";

const router = Router();

// FR-10.01: role-aware dashboard KPIs.
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [jobsInProgress, ledgerEntries, wastageThisMonth, pendingEstimates] = await Promise.all([
      prisma.jobCard.count({ where: { status: "OPEN" } }),
      prisma.karigarLedgerEntry.findMany({
        where: { type: { in: ["METAL_DEBIT", "METAL_CREDIT"] } },
        select: { type: true, fineGoldG: true },
      }),
      prisma.wastageRecord.findMany({
        where: { createdAt: { gte: startOfMonth } },
        select: { wastagePct: true, tolerancePct: true },
      }),
      canSeeCost(req.user!.role)
        ? prisma.estimate.count({ where: { status: { in: ["DRAFT", "SUBMITTED"] } } })
        : Promise.resolve(null),
    ]);

    const goldWithKarigarsG = ledgerEntries.reduce(
      (sum, e) =>
        sum + (e.type === "METAL_DEBIT" ? Number(e.fineGoldG ?? 0) : -Number(e.fineGoldG ?? 0)),
      0
    );

    const avgWastagePct =
      wastageThisMonth.length > 0
        ? wastageThisMonth.reduce((sum, w) => sum + Number(w.wastagePct), 0) / wastageThisMonth.length
        : 0;
    const avgTolerancePct =
      wastageThisMonth.length > 0
        ? wastageThisMonth.reduce((sum, w) => sum + Number(w.tolerancePct), 0) / wastageThisMonth.length
        : 0;

    res.json({
      jobsInProgress,
      goldWithKarigarsG: Math.round(goldWithKarigarsG * 1000) / 1000,
      wastageThisMonthPct: Math.round(avgWastagePct * 100) / 100,
      wastageToleranceThisMonthPct: Math.round(avgTolerancePct * 100) / 100,
      pendingEstimates,
    });
  })
);

// R-04 lite: wastage by karigar, for the "Wastage Alerts" panel.
router.get(
  "/wastage-alerts",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const exceptions = await prisma.wastageRecord.findMany({
      where: { exceptionStatus: "PENDING" },
      include: { jobStage: { include: { jobCard: { include: { product: true } }, karigar: true } } },
      take: 10,
      orderBy: { createdAt: "desc" },
    });
    res.json(
      exceptions.map((w) => ({
        wastageRecordId: w.id,
        karigarName: w.jobStage.karigar?.name ?? "Unassigned",
        serialNo: w.jobStage.jobCard.product.serialNo,
        wastagePct: w.wastagePct,
      }))
    );
  })
);

export default router;
