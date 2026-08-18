import { canSeeCost, type Role } from "@jms/shared";

// BR-16: cost, rate, margin and profit values must never be present in any
// response body for Store, Production, Sales or Karigar roles — not merely
// hidden client-side. Strip the named fields recursively before serializing.
const COST_FIELD_NAMES = new Set([
  "rate",
  "amount",
  "materialCost",
  "makingCharges",
  "otherCharges",
  "wastageCost",
  "cost",
  "profit",
  "profitPct",
  "netAmount",
  "goldRateSnapshot24k",
  "ratePerGramPure",
  "defaultRatePerCarat",
  "recoveryAmount",
]);

export function stripCostFields<T>(role: Role, payload: T): T {
  if (canSeeCost(role)) return payload;
  return redact(payload) as T;
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (COST_FIELD_NAMES.has(key)) continue;
      out[key] = redact(val);
    }
    return out;
  }
  return value;
}
