import { prisma } from "../../db";
import { computeWastage, round3 } from "@jms/shared";
import { badRequest } from "../../utils/httpError";

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

  const fineIssuedG = round3(
    stage.materialIssues
      .filter((i) => i.materialType === "GOLD" && !i.isReversed)
      .reduce((sum, i) => sum + Number(i.fineWeightG), 0)
  );

  const activeReceipts = stage.materialReceipts.filter((r) => !r.isReversed);
  const finePieceG = round3(
    activeReceipts.reduce((sum, r) => sum + Number(r.finishedPieceWeightG) * purityFactor, 0)
  );
  const fineDustG = round3(
    activeReceipts.reduce((sum, r) => sum + Number(r.dustWeightG) * purityFactor, 0)
  );
  const fineReturnedG = round3(
    activeReceipts.reduce(
      (sum, r) => sum + Number(r.unusedReturnedWeightG) * purityFactor,
      0
    )
  );

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
