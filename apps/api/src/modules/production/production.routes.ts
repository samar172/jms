import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { badRequest, notFound } from "../../utils/httpError";
import {
  jcTotals,
  grossWeight,
  stonesByType,
  stonesNetCaratGrams,
  buildLedger,
  karigarBalance,
  karigarLabourEarned,
  STAGE_ORDER,
  rateForLabel,
  type PurityTier as EngineTier,
} from "@jms/shared";
import { jobCardInclude, mapJobCard, mapTier, mapBulkIssue } from "./mapper";

const router = Router();

/* ----------------------------- shared loaders ----------------------------- */
async function loadTiers(): Promise<EngineTier[]> {
  const rows = await prisma.purityTier.findMany({ where: { isActive: true }, orderBy: { percent: "desc" } });
  return rows.map(mapTier);
}
async function loadSetting(key: string, fallback: string): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? fallback;
}
async function loadBaseRate(): Promise<number> {
  return Number(await loadSetting("chowker.baseRate", "98"));
}
async function loadDefaultRates() {
  const raw = await loadSetting(
    "chowker.defaultRates",
    '{"castingWastagePct":6,"fittingWastagePct":2.2,"meenakariRatePerGm":20,"jadaiRatePerStone":8,"settingRatePerStone":12}'
  );
  return JSON.parse(raw);
}
async function loadAllEngineJobCards() {
  const rows = await prisma.prodJobCard.findMany({ include: jobCardInclude });
  return rows.map(mapJobCard);
}

/* ------------------------------- Settings --------------------------------- */
router.get(
  "/settings",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const [tiers, baseRate, defaultRates] = await Promise.all([
      loadTiers(),
      loadBaseRate(),
      loadDefaultRates(),
    ]);
    res.json({ tiers, baseRate, defaultRates });
  })
);

/* ----------------------------- Item Masters ------------------------------- */
router.get(
  "/item-masters",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const items = await prisma.product.findMany({
      include: {
        category: true,
        purity: true,
        images: { where: { isPrimary: true }, take: 1 },
        _count: { select: { prodJobCards: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(
      items.map((p) => ({
        id: p.id,
        name: p.designName,
        category: p.category.name,
        designCode: p.designCode,
        targetPurity: p.purity.code,
        estGrossWeight: Number(p.grossWeightG),
        notes: p.description ?? "",
        imageUrl: p.images[0]?.thumbnailUrl ?? p.images[0]?.url ?? null,
        jobCardCount: p._count.prodJobCards,
      }))
    );
  })
);

/* ------------------------------- Karigars --------------------------------- */
router.get(
  "/karigars",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const [karigars, tiers, bulkRows, jobCards] = await Promise.all([
      prisma.karigar.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      loadTiers(),
      prisma.bulkStockIssue.findMany({ include: { karigar: true, purity: true } }),
      loadAllEngineJobCards(),
    ]);
    const ledger = buildLedger(jobCards, tiers, bulkRows.map(mapBulkIssue));
    res.json(
      karigars.map((k) => ({
        id: k.id,
        name: k.name,
        specialization: k.specialization,
        contact: k.contactNumber,
        defaultWastagePct: k.defaultWastagePct == null ? null : Number(k.defaultWastagePct),
        defaultRatePerGm: k.defaultRatePerGm == null ? null : Number(k.defaultRatePerGm),
        defaultFlatLabour: k.defaultFlatLabour == null ? null : Number(k.defaultFlatLabour),
        balance: +karigarBalance(k.name, ledger).toFixed(3),
        labourEarned: karigarLabourEarned(k.name, jobCards),
      }))
    );
  })
);

/* ----------------------------- Bulk Stock --------------------------------- */
const bulkSchema = z.object({
  karigarId: z.string().min(1),
  purityId: z.string().min(1),
  weightGrams: z.number().positive(),
  issueDate: z.coerce.date().optional(),
  note: z.string().optional(),
});
router.post(
  "/bulk-stock",
  requireRole("SUPER_ADMIN", "MANAGER", "STORE"),
  asyncHandler(async (req, res) => {
    const body = bulkSchema.parse(req.body);
    const created = await prisma.bulkStockIssue.create({
      data: {
        karigarId: body.karigarId,
        purityId: body.purityId,
        weightGrams: body.weightGrams,
        issueDate: body.issueDate ?? new Date(),
        note: body.note ?? "Bulk stock issue",
      },
    });
    res.status(201).json(created);
  })
);

/* ------------------------------- Ledger ----------------------------------- */
router.get(
  "/ledger",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const [tiers, bulkRows, jobCards] = await Promise.all([
      loadTiers(),
      prisma.bulkStockIssue.findMany({ include: { karigar: true, purity: true } }),
      loadAllEngineJobCards(),
    ]);
    res.json(buildLedger(jobCards, tiers, bulkRows.map(mapBulkIssue)));
  })
);

/* ------------------------------ Job Cards --------------------------------- */
router.get(
  "/job-cards",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const [rows, tiers] = await Promise.all([
      prisma.prodJobCard.findMany({
        include: {
          ...jobCardInclude,
          itemMaster: { include: { images: { where: { isPrimary: true }, take: 1 }, category: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      loadTiers(),
    ]);
    res.json(
      rows.map((row) => {
        const jc = mapJobCard(row);
        const t = jcTotals(jc, tiers);
        return {
          id: jc.id,
          itemName: row.itemMaster.designName,
          category: row.itemMaster.category.name,
          thumbnailUrl: row.itemMaster.images[0]?.thumbnailUrl ?? row.itemMaster.images[0]?.url ?? null,
          status: jc.status,
          pieceCount: jc.pieceCount,
          dueDate: jc.dueDate,
          grossWeightEst: Number(row.itemMaster.grossWeightG),
          grossWeight: grossWeight(jc),
          activeStage: t.activeStage,
          labour: t.labour,
          pureEq: t.pureEq,
        };
      })
    );
  })
);

const createSchema = z.object({
  itemMasterId: z.string().min(1),
  dueDate: z.coerce.date().optional(),
  pieceCount: z.number().int().positive().optional(),
  notes: z.string().optional(),
});
router.post(
  "/job-cards",
  requireRole("SUPER_ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const item = await prisma.product.findUnique({ where: { id: body.itemMasterId } });
    if (!item) throw badRequest("Unknown item master");

    // Next job number JC-YYYY-#####
    const year = new Date().getFullYear();
    const last = await prisma.prodJobCard.findFirst({
      where: { jobNo: { startsWith: `JC-${year}-` } },
      orderBy: { jobNo: "desc" },
      select: { jobNo: true },
    });
    const nextSeq = last ? parseInt(last.jobNo.split("-").pop() || "0", 10) + 1 : 1;
    const jobNo = `JC-${year}-${String(nextSeq).padStart(5, "0")}`;

    const jc = await prisma.prodJobCard.create({
      data: {
        jobNo,
        itemMasterId: item.id,
        targetPurityId: item.purityId,
        status: "InProduction",
        pieceCount: body.pieceCount ?? null,
        dueDate: body.dueDate ?? null,
        notes: body.notes ?? "",
        createdById: req.user!.id,
        stages: {
          create: STAGE_ORDER.map((stageName, i) => ({
            stageName: stageName as never,
            sequenceOrder: i,
            status: "Pending",
          })),
        },
        activity: {
          create: { text: `Job card created from Item Master (${item.designName})` },
        },
      },
    });
    res.status(201).json({ id: jc.id, jobNo: jc.jobNo });
  })
);

router.get(
  "/job-cards/:jobNo",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [row, tiers, baseRate] = await Promise.all([
      prisma.prodJobCard.findUnique({
        where: { jobNo: req.params.jobNo },
        include: {
          ...jobCardInclude,
          itemMaster: { include: { images: true, category: true } },
        },
      }),
      loadTiers(),
      loadBaseRate(),
    ]);
    if (!row) throw notFound("Job card not found");
    const jc = mapJobCard(row);
    const t = jcTotals(jc, tiers);
    const silverValue = +(t.pureEq * baseRate).toFixed(2);
    const effectiveSilverValue = jc.manualSilverValue ?? silverValue;
    const todaysRate = jc.todaysSilverRate ?? baseRate;
    const todaysSaleValue = +(t.pureEq * todaysRate + t.stonesConsumed).toFixed(2);
    res.json({
      jobCard: jc,
      tiers,
      baseRate,
      item: {
        id: row.itemMaster.id,
        name: row.itemMaster.designName,
        category: row.itemMaster.category.name,
        designCode: row.itemMaster.designCode,
        estGrossWeight: Number(row.itemMaster.grossWeightG),
        images: row.itemMaster.images.map((im) => ({ url: im.thumbnailUrl ?? im.url })),
      },
      activity: row.activity.map((a) => ({ date: a.date.toISOString().slice(0, 10), text: a.text })),
      reversals: row.reversals.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        reason: r.reason,
        approvedBy: r.approvedBy,
      })),
      totals: {
        ...t,
        grossWeight: grossWeight(jc),
        stonesNetCaratGrams: stonesNetCaratGrams(jc),
        silverValue,
        effectiveSilverValue,
        todaysSaleValue,
        estimatedCostToDate: +(t.labour + t.stonesConsumed + effectiveSilverValue).toFixed(2),
        productionRate: rateForLabel(jc.targetPurity, tiers, baseRate),
      },
      stonesByType: stonesByType(jc),
    });
  })
);

export default router;
