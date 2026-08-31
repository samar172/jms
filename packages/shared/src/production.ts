/**
 * Chowker JMS production/costing engine — a faithful port of the client-approved
 * mockup (docs/reference/mockup-v3.html) and the spec (§4, §5, §6, §7, §10).
 *
 * Job cards exist purely for COSTING: work out what a silver piece cost to make
 * (metal + labour + stones). No customer/order concept. Physical mass is
 * additive; purity conversion must NEVER be applied to compute accumulated mass.
 *
 * Keep this file pure and dependency-free — it is the single source of truth for
 * both the API (authoritative) and the web (live preview).
 */

/* ============================== TYPES (spec §2) ============================== */

export type StageName = "Casting" | "Meenakari" | "Jadai" | "Kundan" | "Setting" | "Fitting";
export const STAGE_ORDER: StageName[] = ["Casting", "Meenakari", "Jadai", "Kundan", "Setting", "Fitting"];

export type JobCardStatus = "Draft" | "In Production" | "On Hold" | "Reconciliation" | "Closed";
export type StageStatus = "Pending" | "In Progress" | "Approved";
export type IssueStatus = "Issued" | "Reconciled";
export type LabourBasis = "Wastage %" | "Per Gram" | "Per Stone" | "Flat";

export interface PurityTier {
  id: string;
  label: string; // "24K", "22K", … fully editable
  percent: number; // 0–100, e.g. 92.5
}

export interface MaterialIssue {
  id: string;
  material: "Silver";
  purity: string | null; // null for bulk-stock stages (Casting/Jadai/Fitting)
  issuedWeight: number | null;
  issueDate: string;
  status: IssueStatus;
  returnedWeight: number | null;
  returnedPurity: string | null;
  dustWeight: number | null;
  returnDate: string | null;
  fromBulkStock: boolean;
  pieceCount: number | null;
  wastagePercent: number | null; // Casting only
  wastageWeight: number | null; // Casting only
  labourEntryId: string | null;
  label: string | null; // free-text line name (Fitting finding type: Wire / Push Cap / …)
}

export interface StoneEntry {
  id: string;
  type: string;
  qtyIssued: string;
  valueIssued: number;
  piecesCount?: number;
  carat?: number;
  ratePerCarat?: number;
  qtyReturned: string;
  valueReturned: number;
  caratReturned?: number;
}

export interface LabourEntry {
  id: string;
  basis: LabourBasis;
  qty: number;
  rate: number;
  amount: number;
  note: string;
  purity?: string;
}

export interface Assignment {
  id: string;
  karigar: string;
  issues: MaterialIssue[];
  stones: StoneEntry[];
  labour: LabourEntry[];
  subItems: SubItem[];
}

export interface Stage {
  stage: StageName;
  status: StageStatus;
  approvedDate: string | null;
  assignments: Assignment[];
}

// A row in a casting karigar's output breakdown (name from the master list +
// pieces + weight). Recorded against the casting assignment (shows karigar-wise).
export interface SubItem {
  id: string;
  sortOrder: number;
  name: string; // sub-item name (Ghat / Otla / Chain / …)
  pieces: number;
  weightG: number | null;
}

export interface JobCard {
  id: string;
  itemMasterId: string;
  targetPurity: string; // locked at creation
  status: JobCardStatus;
  pieceCount: number | null;
  createdAt: string;
  dueDate: string;
  closedAt: string | null;
  notes: string;
  holdReason?: string;
  manualSilverValue: number | null;
  todaysSilverRate: number | null;
  stages: Stage[];
}

export interface BulkStockIssue {
  id: string;
  karigar: string;
  purity: string;
  weight: number;
  date: string;
  note: string;
}

/* ============================== PURITY HELPERS (§10) ============================== */

export function factorFor(label: string, tiers: PurityTier[]): number {
  const t = tiers.find((x) => x.label === label);
  return t ? t.percent / 100 : 0;
}
export function rateForLabel(label: string, tiers: PurityTier[], baseRate: number): number {
  return baseRate * factorFor(label, tiers);
}
export function pureTierLabel(tiers: PurityTier[]): string {
  const t = tiers.find((x) => x.percent === 100) || tiers[0];
  return t ? t.label : "";
}

/* ============================== WEIGHT ACCUMULATION (§4) ============================== */

// Casting is the origin: it creates the piece from bulk stock, so its reconciled
// output simply IS the running mass.
export const ORIGIN_STAGES: StageName[] = ["Casting"];
// The piece leaves the running mass and comes back a little lighter (dust/filing).
// Only a PORTION may be sent (e.g. meenakari on some pieces, not all), so the
// running mass changes by (returned − issued) — just the loss on what was sent —
// never a wholesale replace that would discard the metal left behind. A bulk-added
// issue here (no issuedWeight) fuses its returned weight on, same as an ADD stage.
export const DELTA_STAGES: StageName[] = ["Meenakari", "Setting"];
// Bulk-stock material fused onto the piece — physical mass simply adds on,
// regardless of its own karat. Grams are grams when two pieces of metal fuse.
// Kundan gold (24K) is added onto the piece here, so it adds to the mass too.
export const ADD_STAGES: StageName[] = ["Jadai", "Kundan", "Fitting"];

export function accumulatedWeight(jc: JobCard): number {
  let weight = 0;
  for (const stageName of STAGE_ORDER) {
    const stage = jc.stages.find((s) => s.stage === stageName);
    if (!stage) continue;
    const reconciled = stage.assignments
      .flatMap((a) => a.issues)
      .filter((i) => i.status === "Reconciled");
    if (reconciled.length === 0) continue;
    if (ORIGIN_STAGES.includes(stageName)) {
      weight = reconciled.reduce((s, i) => s + (i.returnedWeight || 0), 0);
    } else if (DELTA_STAGES.includes(stageName)) {
      weight += reconciled.reduce((s, i) => s + (i.returnedWeight || 0) - (i.issuedWeight || 0), 0);
    } else if (ADD_STAGES.includes(stageName)) {
      weight += reconciled.reduce((s, i) => s + (i.returnedWeight || 0), 0);
    }
  }
  return +weight.toFixed(3);
}

export const CARAT_TO_GRAM = 0.2; // 1 carat = 0.2g

export function stonesNetCaratGrams(jc: JobCard): number {
  let netCarat = 0;
  jc.stages.forEach((st) =>
    st.assignments.forEach((a) =>
      a.stones.forEach((s) => {
        netCarat += Math.max(0, (s.carat || 0) - (s.caratReturned || 0));
      })
    )
  );
  return +(netCarat * CARAT_TO_GRAM).toFixed(3);
}

export function grossWeight(jc: JobCard): number {
  return +(accumulatedWeight(jc) + stonesNetCaratGrams(jc)).toFixed(3);
}

export function accumulatedPureEq(jc: JobCard, tiers: PurityTier[]): number {
  return +(accumulatedWeight(jc) * factorFor(jc.targetPurity, tiers)).toFixed(3);
}

export function carriedSilver(jc: JobCard): { weight: number; purity: string } {
  return { weight: +accumulatedWeight(jc).toFixed(3), purity: jc.targetPurity };
}

export function stonesByType(jc: JobCard): { type: string; carat: number; value: number }[] {
  const map: Record<string, { type: string; carat: number; value: number }> = {};
  jc.stages.forEach((st) =>
    st.assignments.forEach((a) =>
      a.stones.forEach((s) => {
        const key = s.type || "Other";
        if (!map[key]) map[key] = { type: key, carat: 0, value: 0 };
        map[key].carat += Math.max(0, (s.carat || 0) - (s.caratReturned || 0));
        map[key].value += Math.max(0, (s.valueIssued || 0) - (s.valueReturned || 0));
      })
    )
  );
  return Object.values(map).filter((x) => x.value > 0 || x.carat > 0);
}

/* ============================== LABOUR (§5) ============================== */

export function computeLabourAmount(
  basis: LabourBasis,
  qty: number,
  rate: number,
  purity: string,
  tiers: PurityTier[],
  baseRate: number
): number {
  if (basis === "Wastage %") return qty * (rate / 100) * rateForLabel(purity, tiers, baseRate);
  if (basis === "Flat") return rate;
  return qty * rate; // Per Gram / Per Stone
}

/* ============================== COSTING SUMMARY (§7) ============================== */

export interface JcTotals {
  labour: number;
  stonesIssued: number;
  stonesReturned: number;
  stonesConsumed: number;
  currentWeight: number;
  currentPurity: string;
  pureEq: number;
  activeStage: StageName | null;
  activeStageStatus: StageStatus | null;
}

export function activeStageInfo(jc: JobCard): { stage: StageName | null; status: StageStatus | null } {
  const inProg = jc.stages.find((s) => s.status === "In Progress");
  if (inProg) return { stage: inProg.stage, status: inProg.status };
  const approved = [...jc.stages].reverse().find((s) => s.status === "Approved");
  if (approved) return { stage: approved.stage, status: approved.status };
  return { stage: null, status: null };
}

export function jcTotals(jc: JobCard, tiers: PurityTier[]): JcTotals {
  let labour = 0,
    stonesIssued = 0,
    stonesReturned = 0;
  jc.stages.forEach((st) =>
    st.assignments.forEach((a) => {
      labour += a.labour.reduce((s, l) => s + l.amount, 0);
      stonesIssued += a.stones.reduce((s, x) => s + (x.valueIssued || 0), 0);
      stonesReturned += a.stones.reduce((s, x) => s + (x.valueReturned || 0), 0);
    })
  );
  const carried = carriedSilver(jc);
  const pureEq = accumulatedPureEq(jc, tiers);
  const info = activeStageInfo(jc);
  return {
    labour,
    stonesIssued,
    stonesReturned,
    stonesConsumed: stonesIssued - stonesReturned,
    currentWeight: carried.weight,
    currentPurity: carried.purity,
    pureEq,
    activeStage: info.stage,
    activeStageStatus: info.status,
  };
}

/* ============================== KARIGAR LEDGER (§6) ============================== */

export type LedgerType =
  | "Issue (Dr)"
  | "Return (Cr)"
  | "Dust Return (Cr)"
  | "Wastage Deduction (Cr)";

export interface LedgerRow {
  date: string;
  karigar: string;
  stage: string;
  jobCardId: string;
  type: LedgerType;
  weight: number;
  purity: string;
  pureEq: number;
  balance: number;
}

export function buildLedger(
  jobCards: JobCard[],
  tiers: PurityTier[],
  bulkIssues: BulkStockIssue[]
): Record<string, LedgerRow[]> {
  const rows: Omit<LedgerRow, "balance">[] = [];
  (bulkIssues || []).forEach((b) => {
    rows.push({
      date: b.date,
      karigar: b.karigar,
      stage: "Bulk Stock",
      jobCardId: "—",
      type: "Issue (Dr)",
      weight: b.weight,
      purity: b.purity,
      pureEq: b.weight * factorFor(b.purity, tiers),
    });
  });
  jobCards.forEach((jc) => {
    jc.stages.forEach((stage) => {
      stage.assignments.forEach((a) => {
        a.issues.forEach((issue) => {
          if (!issue.fromBulkStock && issue.issuedWeight != null && issue.purity != null) {
            rows.push({
              date: issue.issueDate,
              karigar: a.karigar,
              stage: stage.stage,
              jobCardId: jc.id,
              type: "Issue (Dr)",
              weight: issue.issuedWeight,
              purity: issue.purity,
              pureEq: issue.issuedWeight * factorFor(issue.purity, tiers),
            });
          }
          if (issue.status === "Reconciled") {
            if (issue.returnedWeight != null && issue.returnedPurity != null) {
              rows.push({
                date: issue.returnDate || issue.issueDate,
                karigar: a.karigar,
                stage: stage.stage,
                jobCardId: jc.id,
                type: "Return (Cr)",
                weight: issue.returnedWeight,
                purity: issue.returnedPurity,
                pureEq: issue.returnedWeight * factorFor(issue.returnedPurity, tiers),
              });
            }
            if (issue.dustWeight && issue.returnedPurity != null) {
              rows.push({
                date: issue.returnDate || issue.issueDate,
                karigar: a.karigar,
                stage: stage.stage,
                jobCardId: jc.id,
                type: "Dust Return (Cr)",
                weight: issue.dustWeight,
                purity: issue.returnedPurity,
                pureEq: issue.dustWeight * factorFor(issue.returnedPurity, tiers),
              });
            }
            if (issue.wastageWeight) {
              const wastagePurity = pureTierLabel(tiers);
              rows.push({
                date: issue.returnDate || issue.issueDate,
                karigar: a.karigar,
                stage: stage.stage,
                jobCardId: jc.id,
                type: "Wastage Deduction (Cr)",
                weight: issue.wastageWeight,
                purity: wastagePurity,
                pureEq: issue.wastageWeight * factorFor(wastagePurity, tiers),
              });
            }
          }
        });
      });
    });
  });
  rows.sort(
    (a, b) => (a.date || "").localeCompare(b.date || "") || a.karigar.localeCompare(b.karigar)
  );
  const byKarigar: Record<string, LedgerRow[]> = {};
  rows.forEach((r) => {
    if (!byKarigar[r.karigar]) byKarigar[r.karigar] = [];
    const prev = byKarigar[r.karigar];
    const prevBal = prev.length ? prev[prev.length - 1].balance : 0;
    const delta = r.type === "Issue (Dr)" ? r.pureEq : -r.pureEq;
    prev.push({ ...r, balance: prevBal + delta });
  });
  return byKarigar;
}

export function karigarBalance(name: string, ledger: Record<string, LedgerRow[]>): number {
  const rows = ledger[name];
  return rows && rows.length ? rows[rows.length - 1].balance : 0;
}

export function karigarLabourEarned(name: string, jobCards: JobCard[]): number {
  let total = 0;
  jobCards.forEach((jc) =>
    jc.stages.forEach((st) =>
      st.assignments.forEach((a) => {
        if (a.karigar === name) total += a.labour.reduce((s, l) => s + l.amount, 0);
      })
    )
  );
  return total;
}
