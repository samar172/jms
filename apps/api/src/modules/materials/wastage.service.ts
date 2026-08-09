import { prisma } from "../../db";
import { computeWastage, round3 } from "@jms/shared";
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

/** Fine-gold value of a single receipt's returned components — shared by the
 * per-stage wastage recompute and the per-receipt karigar ledger credit so
 * the two never drift apart. */
export function receiptFineWeights(
  receipt: {
    finishedPieceWeightG: number;
    fillerWeightG: number;
    pieceWeightIsFine: boolean;
    dustWeightG: number;
    unusedReturnedWeightG: number;
  },
  purityFactor: number,
  issuedPurityFactor: number
) {
  const netPieceG = receipt.finishedPieceWeightG - receipt.fillerWeightG;
  const finePieceG = receipt.pieceWeightIsFine ? netPieceG : netPieceG * purityFactor;
  const fineDustG = receipt.dustWeightG * purityFactor;
  const fineReturnedG = receipt.unusedReturnedWeightG * issuedPurityFactor;
  return { finePieceG, fineDustG, fineReturnedG, totalFineG: finePieceG + fineDustG + fineReturnedG };
}

/**
 * FR-5.01 / FR-5.02 / BR-09 / BR-10: computes Net Wastage and Wastage % for a
 * job stage once material is received back, compares against the configured
 * stage tolerance, and persists (or updates) the WastageRecord. Called after
 * every MaterialReceipt against a stage — a stage can receive gold across
 * more than one receipt (e.g. partial returns), so this recomputes from the
 * full set of issues/receipts for the stage each time rather than
 * incrementally, avoiding drift.
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
  // Weighted-average purity of what was actually handed to the karigar. Used
  // for "unused returned" gold below, since that gold was never melted/
  // alloyed — crediting it at the finished piece's target karat instead of
  // its own issued purity would over- or under-count it.
  const issuedPurityFactor = grossIssuedG > 0 ? fineIssuedG / grossIssuedG : purityFactor;

  const activeReceipts = stage.materialReceipts.filter((r) => !r.isReversed);
  const perReceipt = activeReceipts.map((r) =>
    receiptFineWeights(
      {
        finishedPieceWeightG: Number(r.finishedPieceWeightG),
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

  const { netWastageG, wastagePct } = computeWastage({
    fineIssuedG,
    finePieceG,
    fineDustG,
    fineReturnedG,
  });

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
      exceptionStatus,
    },
  });

  return record;
}
