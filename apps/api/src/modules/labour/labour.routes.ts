import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";
import { badRequest, forbidden, notFound } from "../../utils/httpError";
import { lineAmount } from "@jms/shared";

const router = Router();

// --- Labour entries (FR-6.01, FR-6.02) ---------------------------------------
const createEntrySchema = z.object({
  jobStageId: z.string().min(1),
  karigarId: z.string().min(1),
  rateBasis: z.enum(["PER_GRAM", "PER_PIECE", "PER_CARAT", "DAILY_WAGE"]),
  quantity: z.number().positive(),
  rate: z.number().nonnegative().optional(), // omit to use the karigar's master rate
});

router.post(
  "/entries",
  requireRole("SUPER_ADMIN", "MANAGER", "PRODUCTION"),
  asyncHandler(async (req, res) => {
    const body = createEntrySchema.parse(req.body);

    let rate = body.rate;
    let isOverride = false;
    if (rate === undefined) {
      const masterRate = await prisma.karigarStageRate.findFirst({
        where: {
          karigarId: body.karigarId,
          processStage: { jobStages: { some: { id: body.jobStageId } } },
        },
      });
      if (!masterRate) {
        throw badRequest("No master rate found for this karigar/stage; specify a rate explicitly");
      }
      rate = Number(masterRate.rate);
    } else {
      // Overriding the master rate is restricted to Manager/Super Admin (FR-6.02);
      // Production staff must use the default.
      if (req.user!.role === "PRODUCTION") {
        throw forbidden("Only Manager or Super Admin can override the labour rate");
      }
      isOverride = true;
    }

    const amount = lineAmount(body.quantity, rate);

    const entry = await prisma.labourEntry.create({
      data: {
        jobStageId: body.jobStageId,
        karigarId: body.karigarId,
        rateBasis: body.rateBasis,
        quantity: body.quantity,
        rate,
        amount,
        isOverride,
        enteredById: req.user!.id,
      },
    });

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "LabourEntry",
      entityId: entry.id,
      after: entry,
      ipAddress: req.ip ?? null,
    });

    res.status(201).json(entry);
  })
);

router.get(
  "/entries",
  requireAuth,
  asyncHandler(async (req, res) => {
    const query = z
      .object({ jobStageId: z.string().optional(), karigarId: z.string().optional() })
      .parse(req.query);

    if (req.user!.role === "KARIGAR") {
      if (!req.user!.karigarId) throw forbidden();
      query.karigarId = req.user!.karigarId; // FR-6.09: karigars see only their own
    }

    res.json(
      await prisma.labourEntry.findMany({
        where: {
          ...(query.jobStageId && { jobStageId: query.jobStageId }),
          ...(query.karigarId && { karigarId: query.karigarId }),
        },
        orderBy: { enteredAt: "desc" },
      })
    );
  })
);

router.post(
  "/entries/:id/approve",
  requireRole("SUPER_ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const before = await prisma.labourEntry.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound("Labour entry not found");

    const entry = await prisma.labourEntry.update({
      where: { id: req.params.id },
      data: { status: "APPROVED", approvedById: req.user!.id, approvedAt: new Date() },
    });

    await prisma.karigarLedgerEntry.create({
      data: {
        karigarId: entry.karigarId,
        type: "LABOUR_EARNED",
        amount: entry.amount,
        referenceType: "LabourEntry",
        referenceId: entry.id,
        note: `Labour approved`,
      },
    });

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "APPROVE",
      entityType: "LabourEntry",
      entityId: entry.id,
      before,
      after: entry,
      ipAddress: req.ip ?? null,
    });

    res.json(entry);
  })
);

// --- Advances (FR-6.04) -------------------------------------------------------
const advanceSchema = z.object({ karigarId: z.string().min(1), amount: z.number().positive(), note: z.string().optional() });

router.post(
  "/advances",
  requireRole("SUPER_ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const body = advanceSchema.parse(req.body);
    const entry = await prisma.karigarLedgerEntry.create({
      data: {
        karigarId: body.karigarId,
        type: "ADVANCE_PAID",
        amount: body.amount,
        referenceType: "Advance",
        referenceId: crypto.randomUUID(),
        note: body.note,
      },
    });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "KarigarLedgerEntry",
      entityId: entry.id,
      after: entry,
      ipAddress: req.ip ?? null,
    });
    res.status(201).json(entry);
  })
);

// --- Khata summary across all karigars (for the combined ledger hub) --------
router.get(
  "/karigars-summary",
  requireRole("SUPER_ADMIN", "MANAGER", "COSTING", "AUDITOR"),
  asyncHandler(async (_req, res) => {
    const karigars = await prisma.karigar.findMany({
      where: { isActive: true },
      include: { ledgerEntries: true },
      orderBy: { name: "asc" },
    });

    res.json(
      karigars.map((k) => {
        let goldHeldG = 0;
        let labourEarned = 0;
        let advancesPaid = 0;
        let wastageRecoveries = 0;
        for (const e of k.ledgerEntries) {
          if (e.type === "METAL_DEBIT") goldHeldG += Number(e.fineGoldG ?? 0);
          if (e.type === "METAL_CREDIT") goldHeldG -= Number(e.fineGoldG ?? 0);
          if (e.type === "LABOUR_EARNED") labourEarned += Number(e.amount ?? 0);
          if (e.type === "ADVANCE_PAID") advancesPaid += Number(e.amount ?? 0);
          if (e.type === "ADVANCE_ADJUSTED") advancesPaid -= Number(e.amount ?? 0);
          if (e.type === "WASTAGE_RECOVERY") wastageRecoveries += Number(e.amount ?? 0);
        }
        return {
          id: k.id,
          name: k.name,
          code: k.code,
          goldHeldG: Math.round(goldHeldG * 1000) / 1000,
          netPayable: Math.round((labourEarned - advancesPaid - wastageRecoveries) * 100) / 100,
        };
      })
    );
  })
);

// --- Karigar payable ledger & statements (FR-6.03, FR-6.05) ------------------
router.get(
  "/karigars/:id/ledger",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user!.role === "KARIGAR" && req.user!.karigarId !== req.params.id) {
      throw forbidden();
    }
    const entries = await prisma.karigarLedgerEntry.findMany({
      where: { karigarId: req.params.id },
      orderBy: { createdAt: "desc" },
    });
    res.json(entries);
  })
);

router.get(
  "/karigars/:id/summary",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user!.role === "KARIGAR" && req.user!.karigarId !== req.params.id) {
      throw forbidden();
    }
    const entries = await prisma.karigarLedgerEntry.findMany({
      where: { karigarId: req.params.id },
    });

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    let goldHeldG = 0;
    let labourEarnedThisMonth = 0;
    let labourEarnedTotal = 0;
    let advancesPaid = 0;
    let wastageRecoveries = 0;

    for (const e of entries) {
      if (e.type === "METAL_DEBIT") goldHeldG += Number(e.fineGoldG ?? 0);
      if (e.type === "METAL_CREDIT") goldHeldG -= Number(e.fineGoldG ?? 0);
      if (e.type === "LABOUR_EARNED") {
        labourEarnedTotal += Number(e.amount ?? 0);
        if (e.createdAt >= startOfMonth) labourEarnedThisMonth += Number(e.amount ?? 0);
      }
      if (e.type === "ADVANCE_PAID") advancesPaid += Number(e.amount ?? 0);
      if (e.type === "ADVANCE_ADJUSTED") advancesPaid -= Number(e.amount ?? 0);
      if (e.type === "WASTAGE_RECOVERY") wastageRecoveries += Number(e.amount ?? 0);
    }

    const netPayable = labourEarnedTotal - advancesPaid - wastageRecoveries;

    res.json({
      goldHeldG: Math.round(goldHeldG * 1000) / 1000,
      labourEarnedThisMonth,
      labourEarnedTotal,
      advancesPaid,
      wastageRecoveries,
      netPayable,
    });
  })
);

const statementQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

router.get(
  "/karigars/:id/statement",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user!.role === "KARIGAR" && req.user!.karigarId !== req.params.id) {
      throw forbidden();
    }
    const { from, to } = statementQuerySchema.parse(req.query);
    const karigar = await prisma.karigar.findUnique({ where: { id: req.params.id } });
    if (!karigar) throw notFound("Karigar not found");

    const entries = await prisma.karigarLedgerEntry.findMany({
      where: { karigarId: req.params.id, createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: "asc" },
    });

    // Rendered as PDF client-side (browser print) for this release; a
    // server-rendered PDF (FR-6.05) is a straightforward follow-up once a
    // PDF library is wired in — this endpoint already returns everything
    // that document needs.
    res.json({ karigar, from, to, entries });
  })
);

export default router;
