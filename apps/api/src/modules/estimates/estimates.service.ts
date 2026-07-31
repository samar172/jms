import { prisma } from "../../db";
import { computeEstimateTotals, deriveRate, type EstimateLineForTotals } from "@jms/shared";
import type { EstimateLineHead } from "@prisma/client";

/**
 * Recomputes an estimate's line amounts are assumed already persisted;
 * this recalculates and persists the five roll-up totals + profit + net
 * amount from the current set of lines (BRD 3.3.2 / Appendix A mapping).
 */
export async function recalculateEstimateTotals(estimateId: string) {
  const estimate = await prisma.estimate.findUniqueOrThrow({
    where: { id: estimateId },
    include: { lines: true },
  });

  const linesForTotals: EstimateLineForTotals[] = estimate.lines.map((l) => ({
    head: l.head as EstimateLineHead,
    amount: Number(l.amount),
  }));

  const totals = computeEstimateTotals(
    linesForTotals,
    Number(estimate.profitPct),
    Number(estimate.gstPct)
  );

  return prisma.estimate.update({
    where: { id: estimateId },
    data: {
      materialCost: totals.materialCost,
      makingCharges: totals.makingCharges,
      otherCharges: totals.otherCharges,
      wastageCost: totals.wastageCost,
      cost: totals.cost,
      profit: totals.profit,
      gstAmount: totals.gstAmount,
      netAmount: totals.netAmount,
    },
    include: { lines: true },
  });
}

/** BR-02: default 18K (etc.) rate = 24K rate x purity factor, overridable. */
export function derivedGoldRate(rate24k: number, purityFactor: number): number {
  return deriveRate(rate24k, purityFactor);
}
