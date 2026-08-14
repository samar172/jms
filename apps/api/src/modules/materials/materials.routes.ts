import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";
import { badRequest, notFound } from "../../utils/httpError";
import { fineWeight, round3 } from "@jms/shared";
import { nextVoucherNumber } from "../../services/voucherNumber";
import { recomputeStageWastage, issuedGoldPurityFactor, receiptFineWeights, computeChizzat } from "./wastage.service";
import { isStockLedgerEnabled } from "../../services/settings";
import { notify } from "../../services/notifications";

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

// GET /issues — with jobStageId: the small array a job-card stage form needs.
// Without it: the paginated, cross-job Material Issue Voucher list (Module M).
router.get(
  "/issues",
  requireAuth,
  asyncHandler(async (req, res) => {
    const jobStageId = z.string().min(1).optional().parse(req.query.jobStageId);
    if (jobStageId) {
      res.json(
        await prisma.materialIssue.findMany({
          where: { jobStageId, isReversed: false },
          orderBy: { issuedAt: "desc" },
        })
      );
      return;
    }

    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(50),
        search: z.string().optional(),
      })
      .parse(req.query);

    const where = q.search
      ? {
          OR: [
            { issueNo: { contains: q.search, mode: "insensitive" as const } },
            { karigar: { name: { contains: q.search, mode: "insensitive" as const } } },
            { jobStage: { jobCard: { product: { serialNo: { contains: q.search, mode: "insensitive" as const } } } } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.materialIssue.findMany({
        where,
        include: {
          karigar: { select: { id: true, name: true } },
          purity: { select: { code: true } },
          stoneType: { select: { name: true } },
          jobStage: {
            include: {
              jobCard: { include: { product: { select: { serialNo: true, designName: true } } } },
              processStage: { select: { name: true } },
            },
          },
        },
        orderBy: { issuedAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.materialIssue.count({ where }),
    ]);

    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  })
);

// --- Material Receipt & reconciliation (FR-4.03, Module 5) ------------------
// Input schema matches the mockup's full "Receive & Reconcile" form.
// The server computes rawGapG, chizzatWeightG, and overAccounted — these are
// NEVER sent by the client. Chizzat is a plug figure, not a manual entry.
const receiptSchema = z
  .object({
    jobStageId: z.string().min(1),
    karigarId: z.string().min(1),
    // === Finished piece breakdown ===
    finishedPieceWeightG: z.number().nonnegative(),
    // Non-gold INSIDE the finished piece (netted from gold before chizzat calc)
    nonGoldInPieceWeightG: z.number().nonnegative().default(0), // stones/inlay in piece
    waxWireWeightG: z.number().nonnegative().default(0),        // wax/wire/solder in piece
    otherNonGoldWeightG: z.number().nonnegative().default(0),   // other non-gold in piece
    // Legacy filler field — honoured when the new fields are all 0
    fillerWeightG: z.number().nonnegative().default(0),
    fillerNote: z.string().optional(),
    pieceWeightIsFine: z.boolean().default(true),
    // === Separately returned material ===
    dustWeightG: z.number().nonnegative().default(0),
    unusedReturnedWeightG: z.number().nonnegative().default(0),
    goldScrapWeightG: z.number().nonnegative().default(0),      // sprue/filings recovered
    approvedLossWeightG: z.number().nonnegative().default(0),   // pre-approved standing allowance
    stoneReturnedWeightG: z.number().nonnegative().default(0),  // stones/polki returned
    stoneReturnedNote: z.string().optional(),
    // Legacy detailed stone return JSON (unit-level traceability)
    stonesReturned: z
      .array(z.object({ stoneTypeId: z.string(), caratWeight: z.number(), pieces: z.number().int() }))
      .optional(),
    dustLotId: z.string().optional(),
    forceOverAccounted: z.boolean().optional(),
  })
  .refine(
    (v) => {
      const totalNonGold = v.nonGoldInPieceWeightG + v.waxWireWeightG + v.otherNonGoldWeightG + v.fillerWeightG;
      return totalNonGold <= v.finishedPieceWeightG;
    },
    { message: "Non-gold components can't exceed the finished piece weight", path: ["nonGoldInPieceWeightG"] }
  );

router.post(
  "/receipts",
  requireRole("SUPER_ADMIN", "MANAGER", "STORE"),
  asyncHandler(async (req, res) => {
    const body = receiptSchema.parse(req.body);
    const receiptNo = await nextVoucherNumber("MR");

    // Fetch the stage's gold issues to compute chizzat server-side
    const stageData = await prisma.jobStage.findUnique({
      where: { id: body.jobStageId },
      include: {
        materialIssues: { where: { materialType: "GOLD", isReversed: false } },
        jobCard: { include: { product: { include: { purity: true } } } },
        processStage: true,
      },
    });
    if (!stageData) throw badRequest("Job stage not found");

    const grossIssuedG = round3(stageData.materialIssues.reduce((s, i) => s + Number(i.grossWeightG ?? 0), 0));

    // Server-side Chizzat computation — client NEVER sends these values.
    // Matches computeChizzat() in wastage.service.ts (which mirrors the
    // approved mockup's reconcileCalcNumbers()).
    const chizzat = computeChizzat({
      grossIssuedG,
      finishedPieceWeightG: body.finishedPieceWeightG,
      nonGoldInPieceWeightG: body.nonGoldInPieceWeightG,
      waxWireWeightG: body.waxWireWeightG,
      otherNonGoldWeightG: body.otherNonGoldWeightG,
      dustWeightG: body.dustWeightG,
      unusedReturnedWeightG: body.unusedReturnedWeightG,
      goldScrapWeightG: body.goldScrapWeightG,
      approvedLossWeightG: body.approvedLossWeightG,
    });

    if (chizzat.overAccounted && !body.forceOverAccounted) {
      throw badRequest(`Total accounted gold exceeds issued gold. Re-check entries or pass forceOverAccounted.`);
    }

    const receipt = await prisma.materialReceipt.create({
      data: {
        receiptNo,
        jobStageId: body.jobStageId,
        karigarId: body.karigarId,
        finishedPieceWeightG: body.finishedPieceWeightG,
        nonGoldInPieceWeightG: body.nonGoldInPieceWeightG,
        waxWireWeightG: body.waxWireWeightG,
        otherNonGoldWeightG: body.otherNonGoldWeightG,
        fillerWeightG: body.fillerWeightG,
        fillerNote: body.fillerNote,
        pieceWeightIsFine: body.pieceWeightIsFine,
        dustWeightG: body.dustWeightG,
        unusedReturnedWeightG: body.unusedReturnedWeightG,
        goldScrapWeightG: body.goldScrapWeightG,
        approvedLossWeightG: body.approvedLossWeightG,
        stoneReturnedWeightG: body.stoneReturnedWeightG,
        stoneReturnedNote: body.stoneReturnedNote,
        stonesReturnedJson: body.stonesReturned,
        dustLotId: body.dustLotId,
        // Server-computed reconciliation results (never from client)
        rawGapG: chizzat.rawGapG,
        chizzatWeightG: chizzat.chizzatWeightG,
        chizzatPct: chizzat.chizzatPct,
        overAccounted: chizzat.overAccounted,
        receivedById: req.user!.id,
      },
    });

    await prisma.jobStage.update({
      where: { id: body.jobStageId },
      data: { status: "RECEIVED" },
    });

    // Credit the karigar's metal ledger for everything they returned.
    const purityFactor = Number(stageData.jobCard.product.purity.purityFactor);
    const issuedPurityFactor = await issuedGoldPurityFactor(body.jobStageId, purityFactor);
    const totalFineReturned = round3(
      receiptFineWeights(
        {
          finishedPieceWeightG: body.finishedPieceWeightG,
          nonGoldInPieceWeightG: body.nonGoldInPieceWeightG,
          waxWireWeightG: body.waxWireWeightG,
          otherNonGoldWeightG: body.otherNonGoldWeightG,
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

    // Determine if chizzat is within tolerance right now to auto-approve
    const tolerancePct = Number(stageData.processStage.wastageTolerancePct);
    const withinTolerance = chizzat.chizzatPct <= tolerancePct;

    // Credit Karigar for within-tolerance chizzat immediately (auto-approval)
    if (chizzat.chizzatWeightG > 0 && withinTolerance) {
      // Need fine gold equivalent of the chizzat. Chizzat is valued at the issued purity.
      const fineChizzatG = chizzat.chizzatWeightG * issuedPurityFactor;
      await prisma.karigarLedgerEntry.create({
        data: {
          karigarId: body.karigarId,
          type: "METAL_CREDIT",
          fineGoldG: round3(fineChizzatG),
          referenceType: "MaterialReceipt",
          referenceId: receipt.id,
          note: `Process loss (within tolerance) — ${receiptNo}`,
        },
      });
    }

    // Stock Ledger: unused gold + gold scrap + dust return to store stock.
    // Over-tolerance chizzat ledger posting is deferred (see wastage.service.ts
    // comments) — only within-tolerance amounts post immediately here.
    if (await isStockLedgerEnabled()) {
      const stockEntries: Promise<unknown>[] = [];
      const purityId = stageData.jobCard.product.purityId;

      if (body.unusedReturnedWeightG > 0) {
        stockEntries.push(
          prisma.stockLedgerEntry.create({
            data: {
              materialType: "GOLD", purityId,
              direction: "IN", quantity: body.unusedReturnedWeightG,
              referenceType: "MaterialReceipt", referenceId: receipt.id,
              note: `Unused gold returned — ${receiptNo}`, createdById: req.user!.id,
            },
          })
        );
      }
      if (body.goldScrapWeightG > 0) {
        stockEntries.push(
          prisma.stockLedgerEntry.create({
            data: {
              materialType: "GOLD", purityId,
              direction: "IN", quantity: body.goldScrapWeightG,
              referenceType: "MaterialReceipt", referenceId: receipt.id,
              note: `Gold scrap/sprue recovered — ${receiptNo}`, createdById: req.user!.id,
            },
          })
        );
      }
      if (body.dustWeightG > 0) {
        stockEntries.push(
          prisma.stockLedgerEntry.create({
            data: {
              materialType: "GOLD", purityId,
              direction: "IN", quantity: body.dustWeightG,
              referenceType: "MaterialReceipt", referenceId: receipt.id,
              note: `Gold dust/sweepings — ${receiptNo}`, createdById: req.user!.id,
            },
          })
        );
      }
      await Promise.all(stockEntries);
    }

    const wastage = await recomputeStageWastage(body.jobStageId);

    if (wastage.exceptionStatus === "PENDING") {
      await notify({
        role: "MANAGER",
        type: "WASTAGE_EXCEPTION",
        title: `Wastage exception on ${stageData.jobCard.product.serialNo}`,
        body: `${wastage.wastagePct}% exceeds the ${wastage.tolerancePct}% tolerance — needs a decision.`,
        entityType: "JobStage",
        entityId: body.jobStageId,
      });
    }

    if (chizzat.overAccounted) {
      await notify({
        role: "MANAGER",
        type: "OVER_RECONCILIATION",
        title: `Over-reconciliation on ${stageData.jobCard.product.serialNo}`,
        body: `Gold returned (${round3(chizzat.accountedGold)}g) exceeds gold issued (${grossIssuedG}g) — data entry error, please review.`,
        entityType: "MaterialReceipt",
        entityId: receipt.id,
      });
    }

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "MaterialReceipt",
      entityId: receipt.id,
      after: receipt,
      ipAddress: req.ip ?? null,
    });

    res.status(201).json({ receipt, wastage, chizzat });
  })
);

// GET /receipts — same pattern as /issues above: scoped array for a single
// stage, or the paginated cross-job Material Return Voucher list.
router.get(
  "/receipts",
  requireAuth,
  asyncHandler(async (req, res) => {
    const jobStageId = z.string().min(1).optional().parse(req.query.jobStageId);
    if (jobStageId) {
      res.json(
        await prisma.materialReceipt.findMany({
          where: { jobStageId, isReversed: false },
          orderBy: { receivedAt: "desc" },
        })
      );
      return;
    }

    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(50),
        search: z.string().optional(),
      })
      .parse(req.query);

    const where = q.search
      ? {
          OR: [
            { receiptNo: { contains: q.search, mode: "insensitive" as const } },
            { karigar: { name: { contains: q.search, mode: "insensitive" as const } } },
            { jobStage: { jobCard: { product: { serialNo: { contains: q.search, mode: "insensitive" as const } } } } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.materialReceipt.findMany({
        where,
        include: {
          karigar: { select: { id: true, name: true } },
          jobStage: {
            include: {
              jobCard: { include: { product: { select: { serialNo: true, designName: true } } } },
              processStage: { select: { name: true } },
              wastageRecord: { select: { withinTolerance: true, exceptionStatus: true, wastagePct: true } },
            },
          },
        },
        orderBy: { receivedAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.materialReceipt.count({ where }),
    ]);

    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  })
);

// Cross-job reconciliation board: every stage that has had material issued,
// with its issued/returned/consumed/expected picture. Stages with a
// WastageRecord already have the authoritative figures (from
// recomputeStageWastage); stages still awaiting a receipt only have the
// issued side, surfaced as "Return Pending" rather than invented numbers.
router.get(
  "/reconciliation",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const stages = await prisma.jobStage.findMany({
      where: { materialIssues: { some: { isReversed: false } } },
      include: {
        karigar: { select: { id: true, name: true } },
        processStage: { select: { name: true } },
        jobCard: { include: { product: { select: { serialNo: true, designName: true } } } },
        materialIssues: { where: { isReversed: false }, select: { fineWeightG: true, materialType: true } },
        wastageRecord: true,
      },
      orderBy: { assignedAt: "desc" },
    });

    res.json(
      stages.map((s) => {
        const fineIssuedG = s.materialIssues.reduce((sum, i) => sum + Number(i.fineWeightG), 0);
        const w = s.wastageRecord;
        return {
          jobStageId: s.id,
          jobCardId: s.jobCard.id,
          serialNo: s.jobCard.product.serialNo,
          designName: s.jobCard.product.designName,
          processStageName: s.processStage.name,
          karigar: s.karigar,
          materialType: s.materialIssues[0]?.materialType ?? "GOLD",
          issuedG: round3(fineIssuedG),
          returnedG: w ? round3(Number(w.finePieceG) + Number(w.fineDustG) + Number(w.fineReturnedG)) : null,
          consumedG: w ? Number(w.netWastageG) : null,
          expectedG: w ? round3(fineIssuedG * (Number(w.tolerancePct) / 100)) : null,
          differenceG: w ? round3(Number(w.netWastageG) - fineIssuedG * (Number(w.tolerancePct) / 100)) : null,
          withinTolerance: w?.withinTolerance ?? null,
          exceptionStatus: w?.exceptionStatus ?? null,
          status: !w ? "RETURN_PENDING" : w.withinTolerance ? "RECONCILED" : w.exceptionStatus,
        };
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

    if (body.approve) {
      // If approved, we must credit the Karigar for the over-tolerance chizzat so their ledger balances out.
      const stage = await prisma.jobStage.findUnique({
        where: { id: req.params.jobStageId },
        include: {
          materialIssues: { where: { materialType: "GOLD", isReversed: false } },
          jobCard: { include: { product: { include: { purity: true } } } },
        },
      });
      if (stage) {
        const purityFactor = Number(stage.jobCard.product.purity.purityFactor);
        const fineIssuedG = stage.materialIssues.reduce((sum, i) => sum + Number(i.fineWeightG), 0);
        const grossIssuedG = stage.materialIssues.reduce((sum, i) => sum + Number(i.grossWeightG ?? 0), 0);
        const issuedPurityFactor = grossIssuedG > 0 ? fineIssuedG / grossIssuedG : purityFactor;
        
        const fineChizzatG = Number(record.netWastageG) * issuedPurityFactor;
        
        await prisma.karigarLedgerEntry.create({
          data: {
            karigarId: stage.karigarId!,
            type: "METAL_CREDIT",
            fineGoldG: round3(fineChizzatG),
            referenceType: "WastageRecord",
            referenceId: record.id,
            note: `Approved over-tolerance wastage exception`,
          },
        });
      }
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
