import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireRole, requirePermission } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { badRequest, notFound } from "../../utils/httpError";
import { recordAudit } from "../../services/audit";
import {
  jcTotals,
  grossWeight,
  stonesByType,
  stonesNetCaratGrams,
  buildLedger,
  buildLabourLedger,
  karigarBalance,
  karigarLabourEarned,
  metalLines,
  stoneLines,
  labourLines,
  STAGE_ORDER,
  rateForLabel,
  type PurityTier as EngineTier,
  type KarigarOpeningBalance,
} from "@jms/shared";
import { jobCardInclude, mapJobCard, mapTier, mapBulkIssue, mapBulkReceipt } from "./mapper";
import { nextSequenceNumber } from "../../services/voucherNumber";
import { generateJobCardPdf } from "./pdf.service";
import { env } from "../../env";
import { promises as fs } from "node:fs";
import path from "node:path";

const router = Router();

const iso = (d: Date | null | undefined): string => (d ? d.toISOString().slice(0, 10) : "");

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
    const [tiers, baseRate, defaultRates, subItemNames, findingNames, workTypeNames, jobCardSeries] = await Promise.all([
      loadTiers(),
      loadBaseRate(),
      loadDefaultRates(),
      prisma.prodSubItemName.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, label: true } }),
      prisma.prodFindingName.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, label: true } }),
      prisma.prodWorkTypeName.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, label: true } }),
      prisma.prodJobCardSeries.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } }),
    ]);
    res.json({
      tiers,
      baseRate,
      defaultRates,
      subItemNames,
      findingNames,
      workTypeNames,
      jobCardSeries: jobCardSeries.map((s) => ({
        id: s.id,
        name: s.name,
        startAt: s.startAt,
        padWidth: s.padWidth,
        effectiveFrom: s.effectiveFrom.toISOString().slice(0, 10),
      })),
    });
  })
);

/* ----------------------------- Item Masters ------------------------------- */
router.get(
  "/item-masters",
  requireAuth,
  asyncHandler(async (req, res) => {
    const archived = req.query.archived === "1" || req.query.archived === "true";
    const items = await prisma.product.findMany({
      where: { isArchived: archived },
      include: {
        category: true,
        purity: true,
        images: { where: { isActive: true, isPrimary: true }, take: 1 },
        _count: { select: { prodJobCards: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(
      items.map((p) => ({
        id: p.id,
        serialNo: p.serialNo,
        name: p.designName,
        category: p.category.name,
        designCode: p.designCode,
        targetPurity: p.purity.code,
        estGrossWeight: Number(p.grossWeightG),
        notes: p.description ?? "",
        imageUrl: p.images[0]?.thumbnailUrl ?? p.images[0]?.url ?? null,
        imageFullUrl: p.images[0]?.url ?? null,
        jobCardCount: p._count.prodJobCards,
        isArchived: p.isArchived,
      }))
    );
  })
);

const JOB_STATUS_LABEL: Record<string, string> = {
  Draft: "Draft", InProduction: "In Production", OnHold: "On Hold", Reconciliation: "Reconciliation", Closed: "Closed",
};
router.get(
  "/item-masters/:key",
  requireAuth,
  asyncHandler(async (req, res) => {
    const key = req.params.key;
    const p = await prisma.product.findFirst({
      where: { OR: [{ id: key }, { serialNo: key }] },
      include: {
        category: true,
        purity: true,
        images: { where: { isActive: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }] },
        prodJobCards: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!p) throw notFound("Item master not found");
    const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
    res.json({
      id: p.id,
      serialNo: p.serialNo,
      name: p.designName,
      category: p.category.name,
      designCode: p.designCode,
      targetPurity: p.purity.code,
      estGrossWeight: Number(p.grossWeightG),
      notes: p.description ?? "",
      isArchived: p.isArchived,
      images: p.images.map((im) => ({ id: im.id, url: im.thumbnailUrl ?? im.url, fullUrl: im.url, isPrimary: im.isPrimary })),
      jobCards: p.prodJobCards.map((jc) => ({
        id: jc.jobNo,
        status: JOB_STATUS_LABEL[jc.status] ?? jc.status,
        pieceCount: jc.pieceCount,
        dueDate: iso(jc.dueDate),
        createdAt: iso(jc.createdAt),
      })),
    });
  })
);

/** Resolve an item master by id or serialNo. */
async function findItemByKey(key: string) {
  return prisma.product.findFirst({
    where: { OR: [{ id: key }, { serialNo: key }] },
    include: { _count: { select: { prodJobCards: true } } },
  });
}

// Archive a design → moves it to the Archived tab (hidden from the main list).
// The alternative to deleting a design that still has job cards.
router.patch(
  "/item-masters/:key/archive",
  requireAuth,
  requirePermission("items", "UPDATE"),
  asyncHandler(async (req, res) => {
    const p = await findItemByKey(req.params.key);
    if (!p) throw notFound("Item master not found");
    await prisma.product.update({ where: { id: p.id }, data: { isArchived: true, archivedAt: new Date() } });
    await recordAudit(prisma, {
      userId: req.user!.id, action: "UPDATE", entityType: "Product", entityId: p.id,
      after: { event: "archived", designName: p.designName }, ipAddress: req.ip ?? null,
    });
    res.json({ ok: true });
  })
);

router.patch(
  "/item-masters/:key/unarchive",
  requireAuth,
  requirePermission("items", "UPDATE"),
  asyncHandler(async (req, res) => {
    const p = await findItemByKey(req.params.key);
    if (!p) throw notFound("Item master not found");
    await prisma.product.update({ where: { id: p.id }, data: { isArchived: false, archivedAt: null } });
    await recordAudit(prisma, {
      userId: req.user!.id, action: "UPDATE", entityType: "Product", entityId: p.id,
      after: { event: "unarchived", designName: p.designName }, ipAddress: req.ip ?? null,
    });
    res.json({ ok: true });
  })
);

// Permanently delete a design — ONLY when it has no job cards. Otherwise the
// caller must archive it instead (its job cards/history must not be destroyed).
router.delete(
  "/item-masters/:key",
  requireAuth,
  requirePermission("items", "DELETE"),
  asyncHandler(async (req, res) => {
    const p = await findItemByKey(req.params.key);
    if (!p) throw notFound("Item master not found");
    if (p._count.prodJobCards > 0) {
      throw badRequest(
        `This design has ${p._count.prodJobCards} job card(s) and cannot be deleted. Archive it instead.`,
      );
    }

    // Audit BEFORE deletion (who/when/what), then remove images and the design.
    await recordAudit(prisma, {
      userId: req.user!.id, action: "DELETE", entityType: "Product", entityId: p.id,
      before: { serialNo: p.serialNo, designName: p.designName }, ipAddress: req.ip ?? null,
    });
    try {
      await prisma.$transaction([
        prisma.productImage.deleteMany({ where: { productId: p.id } }),
        prisma.product.delete({ where: { id: p.id } }),
      ]);
    } catch {
      // A lingering estimate/order/legacy reference blocks a hard delete.
      throw badRequest("This design is referenced elsewhere and cannot be deleted. Archive it instead.");
    }
    res.json({ ok: true, deletedBy: req.user!.name, deletedAt: new Date().toISOString() });
  })
);

/* ------------------------------- Karigars --------------------------------- */
router.get(
  "/karigars",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const [karigars, tiers, bulkRows, bulkReceiptRows, jobCards] = await Promise.all([
      prisma.karigar.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      loadTiers(),
      prisma.bulkStockIssue.findMany({ include: { karigar: true, purity: true } }),
      prisma.bulkStockReceipt.findMany({ include: { karigar: true, purity: true } }),
      loadAllEngineJobCards(),
    ]);
    const openingBalances: KarigarOpeningBalance[] = karigars.map((k) => ({
      karigar: k.name,
      balance: Number(k.openingBalance),
      date: iso(k.openingBalanceDate ?? k.createdAt),
    }));
    const ledger = buildLedger(jobCards, tiers, bulkRows.map(mapBulkIssue), bulkReceiptRows.map(mapBulkReceipt), openingBalances);
    // "Currently Holding" — per-karigar list of material still issued (not yet reconciled).
    const holdingByName: Record<string, { jobId: string; stage: string; weight: number; purity: string | null }[]> = {};
    for (const jc of jobCards) {
      for (const st of jc.stages) {
        for (const a of st.assignments) {
          for (const i of a.issues) {
            if (i.status === "Issued" && i.issuedWeight != null) {
              (holdingByName[a.karigar] ??= []).push({ jobId: jc.id, stage: st.stage, weight: i.issuedWeight, purity: i.purity });
            }
          }
        }
      }
    }
    res.json(
      karigars.map((k) => ({
        id: k.id,
        name: k.name,
        specialization: k.specialization,
        contact: k.contactNumber,
        defaultWastagePct: k.defaultWastagePct == null ? null : Number(k.defaultWastagePct),
        defaultRatePerGm: k.defaultRatePerGm == null ? null : Number(k.defaultRatePerGm),
        defaultFlatLabour: k.defaultFlatLabour == null ? null : Number(k.defaultFlatLabour),
        openingBalance: Number(k.openingBalance),
        openingBalanceDate: iso(k.openingBalanceDate ?? k.createdAt),
        balance: +karigarBalance(k.name, ledger).toFixed(3),
        labourEarned: karigarLabourEarned(k.name, jobCards),
        holding: holdingByName[k.name] ?? [],
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

/* --------------------------- Bulk Stock Receipt ---------------------------- */
// The reverse of Bulk Stock — a karigar (typically Fitting) hands bulk-made
// findings back to the store, off metal already issued to them. One ledger
// credit here, at whatever purity the delivered findings actually are —
// deliberately not linked to any job card (see buildLedger's Fitting skip).
const bulkReceiptSchema = z.object({
  karigarId: z.string().min(1),
  purityId: z.string().min(1),
  weightGrams: z.number().positive(),
  label: z.string().default(""),
  wastagePercent: z.number().min(0).default(0),
  receiptDate: z.coerce.date().optional(),
  note: z.string().optional(),
});
router.post(
  "/bulk-receipt",
  requireRole("SUPER_ADMIN", "MANAGER", "STORE"),
  asyncHandler(async (req, res) => {
    const body = bulkReceiptSchema.parse(req.body);
    // Same wastage-% basis as Casting/Fitting job-card output — a % of the
    // delivered weight, credited to the karigar (not priced in ₹ here, since
    // there's no job card to charge it against — just the ledger weight).
    const wastageWeight = body.wastagePercent > 0 ? +(body.weightGrams * (body.wastagePercent / 100)).toFixed(3) : null;
    const created = await prisma.bulkStockReceipt.create({
      data: {
        karigarId: body.karigarId,
        purityId: body.purityId,
        weightGrams: body.weightGrams,
        label: body.label,
        wastagePercent: body.wastagePercent > 0 ? body.wastagePercent : null,
        wastageWeight,
        receiptDate: body.receiptDate ?? new Date(),
        note: body.note ?? "Bulk findings received",
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
    const [tiers, bulkRows, bulkReceiptRows, jobCards, karigars] = await Promise.all([
      loadTiers(),
      prisma.bulkStockIssue.findMany({ include: { karigar: true, purity: true } }),
      prisma.bulkStockReceipt.findMany({ include: { karigar: true, purity: true } }),
      loadAllEngineJobCards(),
      prisma.karigar.findMany({ select: { name: true, openingBalance: true, openingBalanceDate: true, createdAt: true } }),
    ]);
    const openingBalances: KarigarOpeningBalance[] = karigars.map((k) => ({
      karigar: k.name,
      balance: Number(k.openingBalance),
      date: iso(k.openingBalanceDate ?? k.createdAt),
    }));
    res.json(buildLedger(jobCards, tiers, bulkRows.map(mapBulkIssue), bulkReceiptRows.map(mapBulkReceipt), openingBalances));
  })
);

// The karigar-side ₹ labour ledger — every labour entry ever earned, across
// every job card (unlike /ledger's metal tracking, which deliberately skips
// Meenakari/Setting/Fitting — labour is paid regardless).
router.get(
  "/labour-ledger",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const jobCards = await loadAllEngineJobCards();
    res.json(buildLabourLedger(jobCards));
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
          itemMaster: { include: { images: { where: { isActive: true, isPrimary: true }, take: 1 }, category: true } },
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
  seriesId: z.string().min(1),
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

    const series = await prisma.prodJobCardSeries.findUnique({ where: { id: body.seriesId } });
    if (!series || !series.isActive) throw badRequest("Unknown or inactive job card series — pick one in Settings first");
    if (series.effectiveFrom > new Date()) throw badRequest(`Series "${series.name}" is not effective yet (from ${series.effectiveFrom.toISOString().slice(0, 10)})`);
    const num = await nextSequenceNumber(`jobcard-series-${series.id}`, series.padWidth);
    const jobNo = `${series.name}-${num}`;

    const jc = await prisma.prodJobCard.create({
      data: {
        jobNo,
        seriesId: series.id,
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

/**
 * Delete a whole job card. Gated by the job_cards:DELETE permission, which a
 * super-admin grants to a role (Manager, etc.) on the Roles page. Cascades to
 * every stage/assignment/issue/labour/stone/activity row (schema onDelete).
 *
 * An immutable audit row is written FIRST — who deleted it, when, and a snapshot
 * of what was deleted — so the record survives the cascade that removes the card.
 */
router.delete(
  "/job-cards/:jobNo",
  requireAuth,
  requirePermission("job_cards", "DELETE"),
  asyncHandler(async (req, res) => {
    const jc = await prisma.prodJobCard.findUnique({
      where: { jobNo: req.params.jobNo },
      include: {
        itemMaster: { select: { designName: true, serialNo: true } },
        createdBy: { select: { name: true } },
        _count: { select: { stages: true } },
      },
    });
    if (!jc) throw notFound("Job card not found");

    // Snapshot for the audit trail BEFORE the row (and its children) are gone.
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "DELETE",
      entityType: "ProdJobCard",
      entityId: jc.id,
      before: {
        jobNo: jc.jobNo,
        status: jc.status,
        item: jc.itemMaster?.designName ?? null,
        serialNo: jc.itemMaster?.serialNo ?? null,
        stages: jc._count.stages,
        createdBy: jc.createdBy?.name ?? null,
        cardCreatedAt: jc.createdAt,
      },
      ipAddress: req.ip ?? null,
    });

    await prisma.prodJobCard.delete({ where: { id: jc.id } });

    res.json({ ok: true, jobNo: jc.jobNo, deletedBy: req.user!.name, deletedAt: new Date().toISOString() });
  }),
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

// Fetches a product image as a base64 data URI for embedding in the PDF —
// pdfmake's server-side PdfPrinter can't fetch remote URLs itself. Cloudinary
// images are fetched over HTTP; local-disk images (dev fallback, see
// imageStorage.ts) are read straight off UPLOAD_DIR instead of looping the
// request back through our own server.
async function loadImageAsDataUri(url: string): Promise<string | null> {
  try {
    if (url.startsWith("/uploads/")) {
      const filePath = path.join(path.resolve(env.UPLOAD_DIR), url.slice("/uploads/".length));
      const buf = await fs.readFile(filePath);
      const ext = path.extname(filePath).slice(1) || "jpeg";
      return `data:image/${ext};base64,${buf.toString("base64")}`;
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buf.toString("base64")}`;
  } catch (err) {
    console.error("Failed to load image for job-card PDF:", err);
    return null;
  }
}

router.get(
  "/job-cards/:jobNo/pdf",
  requireAuth,
  asyncHandler(async (req, res) => {
    const profitPct = Number(req.query.profitPct) || 0;
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
    const estimatedCostToDate = +(t.labour + t.stonesConsumed + effectiveSilverValue).toFixed(2);

    const primaryImage = row.itemMaster.images.find((im) => im.isActive && im.isPrimary) ?? row.itemMaster.images.find((im) => im.isActive);
    const imageDataUri = primaryImage ? await loadImageAsDataUri(primaryImage.url) : null;

    const pdfBuffer = await generateJobCardPdf({
      jobNo: jc.id,
      itemName: row.itemMaster.designName,
      category: row.itemMaster.category.name,
      designCode: row.itemMaster.designCode,
      createdAt: jc.createdAt,
      targetPurity: jc.targetPurity,
      pieceCount: jc.pieceCount,
      imageDataUri,
      metal: metalLines(jc, tiers),
      stones: stoneLines(jc),
      labour: labourLines(jc),
      totals: {
        grossWeight: grossWeight(jc),
        pureEq: t.pureEq,
        silverValue: effectiveSilverValue,
        stonesConsumed: t.stonesConsumed,
        labour: t.labour,
        estimatedCostToDate,
      },
      profitPct,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${jc.id}.pdf`);
    res.send(pdfBuffer);
  })
);

export default router;
