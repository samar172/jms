/**
 * Core financial and metal-reconciliation math shared by API and web.
 * Mirrors BRD Section 3.3.2 (Excel formulas), Section 7.2 (wastage) and
 * Business Rules BR-01 to BR-16. Keep this file dependency-free and pure —
 * it is the one place both client-side live preview and server-side
 * authoritative calculation must agree, byte for byte.
 */

// Standard purity factors (BR-01). Karat master in the DB can override these.
export const DEFAULT_PURITY_FACTORS: Record<string, number> = {
  "24K": 1.0,
  "22K": 0.9166,
  "18K": 0.75,
  "14K": 0.585,
};

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

/** Fine gold weight = gross weight x purity factor (BR-01). */
export function fineWeight(grossWeightG: number, purityFactor: number): number {
  return round3(grossWeightG * purityFactor);
}

/** Derived rate for a purity below 24K = 24K rate x purity factor (BR-02). */
export function deriveRate(rate24k: number, purityFactor: number): number {
  return round2(rate24k * purityFactor);
}

/** Gold/stone line amount = quantity x rate (BR-04). */
export function lineAmount(quantity: number, rate: number): number {
  return round2(quantity * rate);
}

export interface WastageInput {
  fineIssuedG: number;
  finePieceG: number;
  fineDustG: number;
  fineReturnedG: number;
}

export interface WastageResult {
  netWastageG: number;
  wastagePct: number;
}

/** Net Wastage (g) = Issued - Finished Piece - Dust Recovered - Returned Unused (BR-09). */
export function computeWastage(input: WastageInput): WastageResult {
  const netWastageG = round3(
    input.fineIssuedG - input.finePieceG - input.fineDustG - input.fineReturnedG
  );
  const wastagePct =
    input.fineIssuedG > 0 ? round2((netWastageG / input.fineIssuedG) * 100) : 0;
  return { netWastageG, wastagePct };
}

export function isWithinTolerance(wastagePct: number, tolerancePct: number): boolean {
  return wastagePct <= tolerancePct;
}

export type EstimateLineHead =
  | "GOLD"
  | "POLKI"
  | "COLOURED_STONE"
  | "MAKING"
  | "OTHER"
  | "WASTAGE";

export interface EstimateLineForTotals {
  head: EstimateLineHead;
  amount: number;
}

export interface EstimateTotals {
  materialCost: number;
  makingCharges: number;
  otherCharges: number;
  wastageCost: number;
  cost: number;
  profitPct: number;
  profit: number;
  netAmount: number;
}

const sumHead = (lines: EstimateLineForTotals[], head: EstimateLineHead) =>
  round2(lines.filter((l) => l.head === head).reduce((acc, l) => acc + l.amount, 0));

/**
 * Replicates the legacy workbook cells H16, H22, H24, H25, H26 (BRD 3.3.2 / Appendix A),
 * generalised beyond the 8-polki / 5-stone row caps.
 */
export function computeEstimateTotals(
  lines: EstimateLineForTotals[],
  profitPct: number
): EstimateTotals {
  const gold = sumHead(lines, "GOLD");
  const polki = sumHead(lines, "POLKI");
  const colouredStone = sumHead(lines, "COLOURED_STONE");
  const materialCost = round2(gold + polki + colouredStone);

  const makingCharges = sumHead(lines, "MAKING");
  const otherCharges = sumHead(lines, "OTHER");
  const wastageCost = sumHead(lines, "WASTAGE");

  const cost = round2(materialCost + makingCharges + otherCharges + wastageCost);
  const profit = round2((cost * profitPct) / 100);
  const netAmount = round2(cost + profit);

  return {
    materialCost,
    makingCharges,
    otherCharges,
    wastageCost,
    cost,
    profitPct,
    profit,
    netAmount,
  };
}

/** Serial number segment builder — NK-18K-2607-0042 (Appendix B). */
export function formatSerialNumber(parts: {
  categoryCode: string;
  purityCode: string;
  yymm: string;
  sequence: number;
  sequenceWidth?: number;
}): string {
  const seq = String(parts.sequence).padStart(parts.sequenceWidth ?? 4, "0");
  return `${parts.categoryCode}-${parts.purityCode}-${parts.yymm}-${seq}`;
}

/** Indian digit grouping for currency display, e.g. 1,12,000.00 */
export function formatINR(amount: number): string {
  const fixed = amount.toFixed(2);
  const [whole, decimal] = fixed.split(".");
  const negative = whole.startsWith("-");
  const digits = negative ? whole.slice(1) : whole;
  let last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  if (rest !== "") {
    last3 = "," + last3;
  }
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + last3;
  return `${negative ? "-" : ""}₹${grouped}.${decimal}`;
}
