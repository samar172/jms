import { prisma } from "../../db";
import { round3 } from "@jms/shared";
import { badRequest } from "../../utils/httpError";

/** Weighted-average purity of the GOLD actually handed to a stage's karigar
 * (fine / gross across all active issues). Falls back to the product's own
 * purity if nothing's been issued yet. Used to value "unused returned" gold
 * at what it was issued as, rather than the finished piece's target karat —
 * that gold was never melted/alloyed, so the piece's karat doesn't apply. */
export async function issuedGoldPurityFactor(jobStageId: string, fallbackPurityFactor: number) {
  const goldIssues = await prisma.materialIssue.findMany({
    where: { jobStageId, materialType: "GOLD", isReversed: false },
  });
  const fineIssuedG = goldIssues.reduce((sum, i) => sum + Number(i.fineWeightG), 0);
  const grossIssuedG = goldIssues.reduce((sum, i) => sum + Number(i.grossWeightG ?? 0), 0);
  return grossIssuedG > 0 ? fineIssuedG / grossIssuedG : fallbackPurityFactor;
}

/**
 * Chizzat-as-plug reconciliation — matches the approved mockup formula
 * (reconcileCalcNumbers() in jewelleryerpmockup.html).
 *
 * actualGoldInFinished = finishedPiece − (nonGoldInPiece + waxWire + otherNonGold)
 * accountedGold        = actualGoldInFinished + dust + unusedReturned + goldScrap + approvedLoss
 * rawGapG              = grossIssued − accountedGold   (NOT clamped; negative = over-reconciliation)
 * chizzatWeightG       = max(0, rawGapG)               (the costing figure, never negative)
 * overAccounted        = rawGapG < −0.001              (signals data-entry error, not just rounding)
 *
 * IMPORTANT: rawGapG is stored separately from chizzatWeightG so that the
 * over-reconciliation flag is never silently discarded when rawGapG is clamped.
 */
export function computeChizzat(params: {
  grossIssuedG: number;
  finishedPieceWeightG: number;
  nonGoldInPieceWeightG: number;
  waxWireWeightG: number;
  otherNonGoldWeightG: number;
  dustWeightG: number;
  unusedReturnedWeightG: number;
  goldScrapWeightG: number;
  approvedLossWeightG: number;
}) {
  const {
    grossIssuedG,
    finishedPieceWeightG,
    nonGoldInPieceWeightG,
    waxWireWeightG,
    otherNonGoldWeightG,
    dustWeightG,
    unusedReturnedWeightG,
    goldScrapWeightG,
    approvedLossWeightG,
  } = params;

  const nonGoldInFinished = round3(nonGoldInPieceWeightG + waxWireWeightG + otherNonGoldWeightG);
  const actualGoldInFinished = round3(Math.max(0, finishedPieceWeightG - nonGoldInFinished));
  const accountedGold = round3(
    actualGoldInFinished + dustWeightG + unusedReturnedWeightG + goldScrapWeightG + approvedLossWeightG
  );
  const rawGapG = grossIssuedG > 0 ? round3(grossIssuedG - accountedGold) : 0;
  const overAccounted = grossIssuedG > 0 && rawGapG < -0.001;
  const chizzatWeightG = round3(Math.max(0, rawGapG));
  const chizzatPct = grossIssuedG > 0 ? round3((chizzatWeightG / grossIssuedG) * 100) : 0;
  const totalAccounted = round3(accountedGold + chizzatWeightG);
  const reconcileDiff = grossIssuedG > 0 ? round3(grossIssuedG - totalAccounted) : 0;

  return {
    nonGoldInFinished,
    actualGoldInFinished,
    accountedGold,
    rawGapG,
    overAccounted,
    chizzatWeightG,
    chizzatPct,
    totalAccounted,
    reconcileDiff,
  };
}

/** Fine-gold value of a single receipt's returned components — shared by the
 * per-stage wastage recompute and the per-receipt karigar ledger credit so
 * the two never drift apart.
 *
 * Updated to use the full non-gold breakdown (nonGoldInPiece + waxWire + otherNonGold)
 * rather than the legacy single fillerWeightG field. */
export function receiptFineWeights(
  receipt: {
    finishedPieceWeightG: number;
    nonGoldInPieceWeightG: number;
    waxWireWeightG: number;
    otherNonGoldWeightG: number;
    fillerWeightG: number; // legacy compat
    pieceWeightIsFine: boolean;
    dustWeightG: number;
    unusedReturnedWeightG: number;
  },
  purityFactor: number,
  issuedPurityFactor: number
) {
  // Use the new breakdown if any of the new fields are non-zero; fall back to
  // fillerWeightG for receipts created before the schema expansion.
  const hasNewBreakdown =
    receipt.nonGoldInPieceWeightG > 0 ||
    receipt.waxWireWeightG > 0 ||
    receipt.otherNonGoldWeightG > 0;
  const totalNonGold = hasNewBreakdown
    ? receipt.nonGoldInPieceWeightG + receipt.waxWireWeightG + receipt.otherNonGoldWeightG
    : receipt.fillerWeightG;

  const netPieceG = Math.max(0, receipt.finishedPieceWeightG - totalNonGold);
  const finePieceG = receipt.pieceWeightIsFine ? netPieceG : netPieceG * purityFactor;
  const fineDustG = receipt.dustWeightG * purityFactor;
  const fineReturnedG = receipt.unusedReturnedWeightG * issuedPurityFactor;
  return { finePieceG, fineDustG, fineReturnedG, totalFineG: finePieceG + fineDustG + fineReturnedG };
}

/**
 * FR-5.01 / FR-5.02 / BR-09 / BR-10: recomputes WastageRecord for a stage
 * after every MaterialReceipt. Now stores rawGapG and overAccounted so the
 * over-reconciliation flag is never silently discarded by the max(0) clamp.
 *
 * LEDGER SEQUENCING (review feedback item 4):
 * - Chizzat WITHIN tolerance → posted to ledgers immediately (auto-approved).
 * - Chizzat OVER tolerance   → WastageRecord exceptionStatus=PENDING; ledger
 *   posting happens via approve-variance endpoint, NOT here. This prevents
 *   orphaned ledger entries if a variance is subsequently rejected/corrected.
 *
 * STUCK-VARIANCE FIX: The approve-variance endpoint (materials.routes.ts) is
 * a standalone route against the WastageRecord, NOT against an open
 * MaterialIssue — so it remains actionable even after the source
 * MaterialIssue is fully closed, which would otherwise leave the chizzat
 * permanently unapproved with no UI path to act on it.
 */
export async function recomputeStageWastage(jobStageId: string) {
  const stage = await prisma.jobStage.findUnique({
    where: { id: jobStageId },
    include: {
      processStage: true,
      jobCard: { include: { product: { include: { purity: true } } } },
      materialIssues: true,
      materialReceipts: true,
    },
  });
  if (!stage) throw badRequest("Unknown job stage");

  const purityFactor = Number(stage.jobCard.product.purity.purityFactor);

  const goldIssues = stage.materialIssues.filter((i) => i.materialType === "GOLD" && !i.isReversed);
  const fineIssuedG = round3(goldIssues.reduce((sum, i) => sum + Number(i.fineWeightG), 0));
  const grossIssuedG = round3(goldIssues.reduce((sum, i) => sum + Number(i.grossWeightG ?? 0), 0));
  const issuedPurityFactor = grossIssuedG > 0 ? fineIssuedG / grossIssuedG : purityFactor;

  const activeReceipts = stage.materialReceipts.filter((r) => !r.isReversed);
  const perReceipt = activeReceipts.map((r) =>
    receiptFineWeights(
      {
        finishedPieceWeightG: Number(r.finishedPieceWeightG),
        nonGoldInPieceWeightG: Number(r.nonGoldInPieceWeightG),
        waxWireWeightG: Number(r.waxWireWeightG),
        otherNonGoldWeightG: Number(r.otherNonGoldWeightG),
        fillerWeightG: Number(r.fillerWeightG),
        pieceWeightIsFine: r.pieceWeightIsFine,
        dustWeightG: Number(r.dustWeightG),
        unusedReturnedWeightG: Number(r.unusedReturnedWeightG),
      },
      purityFactor,
      issuedPurityFactor
    )
  );
  const finePieceG = round3(perReceipt.reduce((sum, r) => sum + r.finePieceG, 0));
  const fineDustG = round3(perReceipt.reduce((sum, r) => sum + r.fineDustG, 0));
  const fineReturnedG = round3(perReceipt.reduce((sum, r) => sum + r.fineReturnedG, 0));

  // Full chizzat formula across all active receipts for this stage
  const totalGoldScrapG = round3(activeReceipts.reduce((sum, r) => sum + Number(r.goldScrapWeightG), 0));
  const totalApprovedLossG = round3(activeReceipts.reduce((sum, r) => sum + Number(r.approvedLossWeightG), 0));

  const chizzat = computeChizzat({
    grossIssuedG,
    finishedPieceWeightG: round3(activeReceipts.reduce((sum, r) => sum + Number(r.finishedPieceWeightG), 0)),
    nonGoldInPieceWeightG: round3(activeReceipts.reduce((sum, r) => sum + Number(r.nonGoldInPieceWeightG), 0)),
    waxWireWeightG: round3(activeReceipts.reduce((sum, r) => sum + Number(r.waxWireWeightG), 0)),
    otherNonGoldWeightG: round3(activeReceipts.reduce((sum, r) => sum + Number(r.otherNonGoldWeightG), 0)),
    dustWeightG: fineDustG,
    unusedReturnedWeightG: fineReturnedG,
    goldScrapWeightG: totalGoldScrapG,
    approvedLossWeightG: totalApprovedLossG,
  });

  const netWastageG = chizzat.chizzatWeightG;
  const wastagePct = chizzat.chizzatPct;

  const tolerancePct = Number(stage.processStage.wastageTolerancePct);
  const withinTolerance = wastagePct <= tolerancePct;

  const existing = await prisma.wastageRecord.findUnique({ where: { jobStageId } });
  // Only (re)open a PENDING exception on a fresh breach. If a Manager already
  // approved/rejected the prior figure, a later recompute must not silently
  // overwrite that decision — surface it as a new PENDING exception instead.
  const exceptionStatus = withinTolerance
    ? "NONE"
    : existing && existing.exceptionStatus !== "NONE"
      ? existing.exceptionStatus
      : "PENDING";

  const record = await prisma.wastageRecord.upsert({
    where: { jobStageId },
    create: {
      jobStageId,
      fineIssuedG,
      finePieceG,
      fineDustG,
      fineReturnedG,
      netWastageG,
      wastagePct,
      tolerancePct,
      withinTolerance,
      rawGapG: chizzat.rawGapG,
      overAccounted: chizzat.overAccounted,
      exceptionStatus,
    },
    update: {
      fineIssuedG,
      finePieceG,
      fineDustG,
      fineReturnedG,
      netWastageG,
      wastagePct,
      tolerancePct,
      withinTolerance,
      rawGapG: chizzat.rawGapG,
      overAccounted: chizzat.overAccounted,
      exceptionStatus,
    },
  });

  return record;
}

