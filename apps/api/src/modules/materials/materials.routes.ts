import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";
import { badRequest, notFound } from "../../utils/httpError";
import { fineWeight, round3 } from "@jms/shared";
import { nextVoucherNumber } from "../../services/voucherNumber";
import { recomputeStageWastage, issuedGoldPurityFactor, receiptFineWeights } from "./wastage.service";
import { isStockLedgerEnabled } from "../../services/settings";

const router = Router();

// --- Material Issue (FR-4.01, FR-4.02) --------------------------------------
const issueSchema = z.object({
  jobStageId: z.string().min(1),
  karigarId: z.string().min(1),
  materialType: z.enum(["GOLD", "POLKI", "COLOURED_STONE", "FINDING"]),
  purityId: z.string().optional(),
  stoneTypeId: z.string().optional(),
  grossWeightG: z.number().positive().optional(),
  caratWeight: z.number().positive().optional(),
  pieces: z.number().int().positive().optional(),
});

router.post(
  "/issues",
  requireRole("SUPER_ADMIN", "MANAGER", "STORE"),
  asyncHandler(async (req, res) => {
    const body = issueSchema.parse(req.body);

    let fineWeightG = 0;
    if (body.materialType === "GOLD") {
      if (!body.purityId || !body.grossWeightG) {
        throw badRequest("Gold issues require purityId and grossWeightG");
      }
      const purity = await prisma.karat.findUnique({ where: { id: body.purityId } });
      if (!purity) throw badRequest("Unknown purity");
      fineWeightG = fineWeight(body.grossWeightG, Number(purity.purityFactor));
    } else if (body.grossWeightG) {
      fineWeightG = round3(body.grossWeightG);
    }

    const issueNo = await nextVoucherNumber("MI");

    const [issue] = await prisma.$transaction([
      prisma.materialIssue.create({
        data: {
          issueNo,
          jobStageId: body.jobStageId,
          karigarId: body.karigarId,
          materialType: body.materialType,
          purityId: body.purityId,
          stoneTypeId: body.stoneTypeId,
          grossWeightG: body.grossWeightG,
          fineWeightG,
          caratWeight: body.caratWeight,
          pieces: body.pieces,
          issuedById: req.user!.id,
        },
      }),
      prisma.jobStage.update({
        where: { id: body.jobStageId },
        data: { status: "ISSUED" },
      }),
    ]);

    if (body.materialType === "GOLD") {
      await prisma.karigarLedgerEntry.create({
        data: {
          karigarId: body.karigarId,
          type: "METAL_DEBIT",
          fineGoldG: fineWeightG,
          referenceType: "MaterialIssue",
          referenceId: issue.id,
          note: `Gold issued — ${issueNo}`,
        },
      });
    }

    // Store Stock Ledger (optional module): material leaving the store for a
    // karigar is an OUT entry. No-op when the module is switched off.
    if (await isStockLedgerEnabled()) {
      await prisma.stockLedgerEntry.create({
        data: {
          materialType: body.materialType,
          purityId: body.purityId,
          stoneTypeId: body.stoneTypeId,
          direction: "OUT",
          quantity: body.materialType === "GOLD" ? Number(body.grossWeightG) : Number(body.caratWeight ?? body.grossWeightG ?? 0),
          referenceType: "MaterialIssue",
          referenceId: issue.id,
          note: `Issued to karigar — ${issueNo}`,
          createdById: req.user!.id,
        },
      });
    }

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "MaterialIssue",
      entityId: issue.id,
      after: issue,
      ipAddress: req.ip ?? null,
    });

    res.status(201).json(issue);
  })
);

router.get(
  "/issues",
  requireAuth,
  asyncHandler(async (req, res) => {
    const jobStageId = z.string().min(1).parse(req.query.jobStageId);
    res.json(
      await prisma.materialIssue.findMany({
        where: { jobStageId, isReversed: false },
        orderBy: { issuedAt: "desc" },
      })
    );
  })
);

// --- Material Receipt & reconciliation (FR-4.03, Module 5) ------------------
const receiptSchema = z.object({
  jobStageId: z.string().min(1),
  karigarId: z.string().min(1),
  finishedPieceWeightG: z.number().nonnegative(),
  fillerWeightG: z.number().nonnegative().default(0),
  fillerNote: z.string().optional(),
  pieceWeightIsFine: z.boolean().default(true),
  dustWeightG: z.number().nonnegative().default(0),
  unusedReturnedWeightG: z.number().nonnegative().default(0),
  stonesReturned: z
    .array(z.object({ stoneTypeId: z.string(), caratWeight: z.number(), pieces: z.number().int() }))
    .optional(),
  dustLotId: z.string().optional(),
}).refine((v) => v.fillerWeightG <= v.finishedPieceWeightG, {
  message: "Filler weight can't exceed the finished piece weight",
  path: ["fillerWeightG"],
});

router.post(
  "/receipts",
  requireRole("SUPER_ADMIN", "MANAGER", "STORE"),
  asyncHandler(async (req, res) => {
    const body = receiptSchema.parse(req.body);
    const receiptNo = await nextVoucherNumber("MR");

    const receipt = await prisma.materialReceipt.create({
      data: {
        receiptNo,
        jobStageId: body.jobStageId,
        karigarId: body.karigarId,
        finishedPieceWeightG: body.finishedPieceWeightG,
        fillerWeightG: body.fillerWeightG,
        fillerNote: body.fillerNote,
        pieceWeightIsFine: body.pieceWeightIsFine,
        dustWeightG: body.dustWeightG,
        unusedReturnedWeightG: body.unusedReturnedWeightG,
        stonesReturnedJson: body.stonesReturned,
        dustLotId: body.dustLotId,
        receivedById: req.user!.id,
      },
    });

    await prisma.jobStage.update({
      where: { id: body.jobStageId },
      data: { status: "RECEIVED" },
    });

    // Credit the karigar's metal ledger for everything they returned.
    const purity = await prisma.jobStage.findUnique({
      where: { id: body.jobStageId },
      include: { jobCard: { include: { product: { include: { purity: true } } } } },
    });
    const purityFactor = Number(purity!.jobCard.product.purity.purityFactor);
    const issuedPurityFactor = await issuedGoldPurityFactor(body.jobStageId, purityFactor);
    const totalFineReturned = round3(
      receiptFineWeights(
        {
          finishedPieceWeightG: body.finishedPieceWeightG,
          fillerWeightG: body.fillerWeightG,
          pieceWeightIsFine: body.pieceWeightIsFine,
          dustWeightG: body.dustWeightG,
          unusedReturnedWeightG: body.unusedReturnedWeightG,
        },
        purityFactor,
        issuedPurityFactor
      ).totalFineG
    );
    await prisma.karigarLedgerEntry.create({
      data: {
        karigarId: body.karigarId,
        type: "METAL_CREDIT",
        fineGoldG: totalFineReturned,
        referenceType: "MaterialReceipt",
        referenceId: receipt.id,
        note: `Material received — ${receiptNo}`,
      },
    });

    if (body.dustLotId && body.dustWeightG > 0) {
      await prisma.dustLot.update({
        where: { id: body.dustLotId },
        data: { totalDustWeightG: { increment: body.dustWeightG } },
      });
    }

    // Store Stock Ledger (optional module): unused gold handed back by the
    // karigar returns to the store's own stock, so it's an IN entry there
    // (separate from the karigar ledger credit above, which just closes out
    // what that karigar was carrying).
    if (body.unusedReturnedWeightG > 0 && (await isStockLedgerEnabled())) {
      await prisma.stockLedgerEntry.create({
        data: {
          materialType: "GOLD",
          purityId: purity!.jobCard.product.purityId,
          direction: "IN",
          quantity: body.unusedReturnedWeightG,
          referenceType: "MaterialReceipt",
          referenceId: receipt.id,
          note: `Unused gold returned — ${receiptNo}`,
          createdById: req.user!.id,
        },
      });
    }

    const wastage = await recomputeStageWastage(body.jobStageId);

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "MaterialReceipt",
      entityId: receipt.id,
      after: receipt,
      ipAddress: req.ip ?? null,
    });

    res.status(201).json({ receipt, wastage });
  })
);

router.get(
  "/receipts",
  requireAuth,
  asyncHandler(async (req, res) => {
    const jobStageId = z.string().min(1).parse(req.query.jobStageId);
    res.json(
      await prisma.materialReceipt.findMany({
        where: { jobStageId, isReversed: false },
        orderBy: { receivedAt: "desc" },
      })
    );
  })
);

router.get(
  "/wastage/:jobStageId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const record = await prisma.wastageRecord.findUnique({
      where: { jobStageId: req.params.jobStageId },
    });
    if (!record) throw notFound("No wastage record for this stage yet");
    res.json(record);
  })
);

// --- Wastage exception approval (FR-5.04, BR-10) -----------------------------
const approveWastageSchema = z.object({
  approve: z.boolean(),
  reason: z.string().min(1),
  recoverFromKarigar: z.boolean().default(false),
  recoveryAmount: z.number().nonnegative().optional(),
});

router.post(
  "/wastage/:jobStageId/decide",
  requireRole("SUPER_ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const before = await prisma.wastageRecord.findUnique({
      where: { jobStageId: req.params.jobStageId },
    });
    if (!before) throw notFound("No wastage record for this stage");
    if (before.exceptionStatus === "NONE") {
      throw badRequest("This wastage record has no exception to decide");
    }
    // A Manager can only act on a fresh exception. Revising one that's
    // already been Approved/Rejected is a Super-Admin-only override.
    if (before.exceptionStatus !== "PENDING" && req.user!.role !== "SUPER_ADMIN") {
      throw badRequest("This exception has already been decided — only a Super Admin can revise it");
    }

    const body = approveWastageSchema.parse(req.body);

    const record = await prisma.wastageRecord.update({
      where: { jobStageId: req.params.jobStageId },
      data: {
        exceptionStatus: body.approve ? "APPROVED" : "REJECTED",
        exceptionReason: body.reason,
        approvedById: req.user!.id,
        approvedAt: new Date(),
        recoveredFromKarigar: body.recoverFromKarigar,
        recoveryAmount: body.recoveryAmount,
      },
    });

    // Ledger entries are append-only (BR-13) — if a prior decision already
    // posted a recovery against the karigar, reverse it first rather than
    // editing it in place, then post the new decision's recovery (if any).
    if (before.recoveredFromKarigar && before.recoveryAmount) {
      const stage = await prisma.jobStage.findUnique({ where: { id: req.params.jobStageId } });
      await prisma.karigarLedgerEntry.create({
        data: {
          karigarId: stage!.karigarId!,
          type: "WASTAGE_RECOVERY",
          amount: -Number(before.recoveryAmount),
          referenceType: "WastageRecord",
          referenceId: record.id,
          note: "Reversal of prior wastage recovery decision",
        },
      });
    }

    if (body.approve && body.recoverFromKarigar && body.recoveryAmount) {
      const stage = await prisma.jobStage.findUnique({ where: { id: req.params.jobStageId } });
      await prisma.karigarLedgerEntry.create({
        data: {
          karigarId: stage!.karigarId!,
          type: "WASTAGE_RECOVERY",
          amount: body.recoveryAmount,
          referenceType: "WastageRecord",
          referenceId: record.id,
          note: `Wastage recovery — ${body.reason}`,
        },
      });
    }

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "APPROVE",
      entityType: "WastageRecord",
      entityId: record.id,
      before,
      after: record,
      ipAddress: req.ip ?? null,
    });

    res.json(record);
  })
);

// --- Dust lots (FR-5.06, FR-5.07, FR-5.08) -----------------------------------
router.post(
  "/dust-lots",
  requireRole("SUPER_ADMIN", "MANAGER", "STORE"),
  asyncHandler(async (req, res) => {
    const lotNo = await nextVoucherNumber("DUST");
    const dustLot = await prisma.dustLot.create({ data: { lotNo } });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "DustLot",
      entityId: dustLot.id,
      after: dustLot,
      ipAddress: req.ip ?? null,
    });
    res.status(201).json(dustLot);
  })
);

router.get(
  "/dust-lots",
  requireRole("SUPER_ADMIN", "MANAGER", "STORE", "COSTING", "AUDITOR"),
  asyncHandler(async (_req, res) => {
    res.json(await prisma.dustLot.findMany({ orderBy: { createdAt: "desc" } }));
  })
);

const despatchSchema = z.object({ vendorId: z.string().min(1) });

router.post(
  "/dust-lots/:id/despatch",
  requireRole("SUPER_ADMIN", "MANAGER", "STORE"),
  asyncHandler(async (req, res) => {
    const { vendorId } = despatchSchema.parse(req.body);
    const dustLot = await prisma.dustLot.update({
      where: { id: req.params.id },
      data: { status: "DESPATCHED", vendorId, despatchedAt: new Date() },
    });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "DustLot",
      entityId: dustLot.id,
      after: dustLot,
      ipAddress: req.ip ?? null,
    });
    res.json(dustLot);
  })
);

const recoverySchema = z.object({ recoveredPureGoldG: z.number().positive() });

router.post(
  "/dust-lots/:id/recover",
  requireRole("SUPER_ADMIN", "MANAGER", "STORE"),
  asyncHandler(async (req, res) => {
    const before = await prisma.dustLot.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound("Dust lot not found");
    const { recoveredPureGoldG } = recoverySchema.parse(req.body);
    // FR-5.07: actual recovery % = pure gold recovered / dust weight sent.
    const recoveryPct =
      Number(before.totalDustWeightG) > 0
        ? round3((recoveredPureGoldG / Number(before.totalDustWeightG)) * 100)
        : 0;

    const dustLot = await prisma.dustLot.update({
      where: { id: req.params.id },
      data: {
        status: "RECEIVED",
        recoveredPureGoldG,
        recoveryPct,
        recoveredAt: new Date(),
      },
    });
    // FR-5.08: recovered pure gold is credited back to 24K stock.
    if (await isStockLedgerEnabled()) {
      const karat24k = await prisma.karat.findFirst({ where: { code: "24K" } });
      if (karat24k) {
        await prisma.stockLedgerEntry.create({
          data: {
            materialType: "GOLD",
            purityId: karat24k.id,
            direction: "IN",
            quantity: recoveredPureGoldG,
            vendorId: dustLot.vendorId,
            referenceType: "DustLot",
            referenceId: dustLot.id,
            note: `Refining recovery — ${dustLot.lotNo} (${recoveryPct}%)`,
            createdById: req.user!.id,
          },
        });
      }
    }

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "DustLot",
      entityId: dustLot.id,
      before,
      after: dustLot,
      ipAddress: req.ip ?? null,
    });

    res.json(dustLot);
  })
);

export default router;
