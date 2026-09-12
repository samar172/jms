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
  piecesReturned?: number;
}

export interface LabourEntry {
  id: string;
  basis: LabourBasis;
  qty: number;
  rate: number;
  amount: number;
  note: string;
  purity?: string;
  date: string;
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

// The reverse of BulkStockIssue — a karigar hands bulk-made findings
// (Wire/Push Clip/Kadi/…) back to the store, off metal they were already
// holding. This is the karigar's ONLY ledger credit for that metal — it is
// deliberately not tied to any job card (see buildLedger, which skips Fitting
// stage entirely for this reason: crediting there too would double-count).
export interface BulkStockReceipt {
  id: string;
  karigar: string;
  purity: string;
  weight: number;
  label: string;
  wastagePercent: number | null;
  wastageWeight: number | null;
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

// Pure (fine-metal) equivalent of the running mass. Each contribution is
// converted at ITS OWN karat, never one blanket job-target factor — the base
// metal cast at the target purity (e.g. 18K → ×0.76), but Kundan gold and
// Fitting findings are added as pure (24K → ×1.0) and must count at full value.
// Falls back to the job's target purity only when a row has no purity recorded.
export function accumulatedPureEq(jc: JobCard, tiers: PurityTier[]): number {
  const f = (label: string | null): number => factorFor(label ?? jc.targetPurity, tiers);
  let pure = 0;
  for (const stageName of STAGE_ORDER) {
    const stage = jc.stages.find((s) => s.stage === stageName);
    if (!stage) continue;
    const reconciled = stage.assignments
      .flatMap((a) => a.issues)
      .filter((i) => i.status === "Reconciled");
    if (reconciled.length === 0) continue;
    if (ORIGIN_STAGES.includes(stageName)) {
      pure = reconciled.reduce((s, i) => s + (i.returnedWeight || 0) * f(i.returnedPurity), 0);
    } else if (DELTA_STAGES.includes(stageName)) {
      pure += reconciled.reduce(
        (s, i) => s + ((i.returnedWeight || 0) - (i.issuedWeight || 0)) * f(i.returnedPurity ?? i.purity),
        0
      );
    } else if (ADD_STAGES.includes(stageName)) {
      pure += reconciled.reduce((s, i) => s + (i.returnedWeight || 0) * f(i.returnedPurity), 0);
    }
  }
  return +pure.toFixed(3);
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
  wastageWeight: number; // total wastage metal lost (g), across all stages
  wastageValue: number; // ₹ charged for that wastage (the "Wastage %" labour, already in `labour`)
  activeStage: StageName | null;
  activeStageStatus: StageStatus | null;
}

// Per-line wastage detail for the costing breakdown (stage / karigar / % / g / ₹).
export interface WastageLine {
  stage: StageName;
  karigar: string;
  percent: number | null;
  weight: number;
  value: number;
}

export function wastageLines(jc: JobCard): WastageLine[] {
  const rows: WastageLine[] = [];
  jc.stages.forEach((st) =>
    st.assignments.forEach((a) => {
      const weight = a.issues.reduce((s, i) => s + (i.wastageWeight || 0), 0);
      const percent = a.issues.find((i) => i.wastagePercent != null)?.wastagePercent ?? null;
      const value = a.labour.filter((l) => l.basis === "Wastage %").reduce((s, l) => s + l.amount, 0);
      if (weight > 0 || value > 0) rows.push({ stage: st.stage, karigar: a.karigar, percent, weight: +weight.toFixed(3), value: +value.toFixed(2) });
    })
  );
  return rows;
}

// Per-line labour detail for the costing breakdown (stage / karigar / basis / ₹).
export interface LabourLine {
  stage: StageName;
  karigar: string;
  basis: LabourBasis;
  qty: number;
  rate: number;
  amount: number;
  note: string;
  date: string;
}

export function labourLines(jc: JobCard): LabourLine[] {
  const rows: LabourLine[] = [];
  jc.stages.forEach((st) =>
    st.assignments.forEach((a) =>
      a.labour.forEach((l) => {
        rows.push({ stage: st.stage, karigar: a.karigar, basis: l.basis, qty: l.qty, rate: l.rate, amount: l.amount, note: l.note, date: l.date });
      })
    )
  );
  return rows;
}

// The karigar-side labour ledger — every labour entry this karigar has ever
// earned, across every job card, newest first. Unlike the metal ledger
// (buildLedger), this always includes every stage — labour is what the
// karigar is actually paid, regardless of whether that stage's metal is
// tracked in his ledger (Meenakari/Setting/Fitting deliberately aren't, see
// buildLedger — but he's still paid for the work).
export interface LabourLedgerRow extends LabourLine {
  jobCardId: string;
}

export function buildLabourLedger(jobCards: JobCard[]): Record<string, LabourLedgerRow[]> {
  const byKarigar: Record<string, LabourLedgerRow[]> = {};
  jobCards.forEach((jc) => {
    labourLines(jc).forEach((l) => {
      (byKarigar[l.karigar] ??= []).push({ ...l, jobCardId: jc.id });
    });
  });
  Object.values(byKarigar).forEach((rows) => rows.sort((a, b) => (b.date || "").localeCompare(a.date || "")));
  return byKarigar;
}

// Named metal line items — Casting sub-items (Ghat/Otla/Chain/…) and Fitting
// findings (Wire/Push Clip/Kadi/…), the two places a job card records metal
// under a specific name rather than just a bulk weight. Drives the "Metal"
// section of the printed job-card sheet (description / wt / purity / pure).
export interface MetalLine {
  stage: StageName;
  karigar: string;
  name: string;
  pieces: number | null;
  weightG: number;
  purity: string;
  pureG: number;
}

export function metalLines(jc: JobCard, tiers: PurityTier[]): MetalLine[] {
  const rows: MetalLine[] = [];
  jc.stages.forEach((st) =>
    st.assignments.forEach((a) => {
      a.subItems.forEach((s) => {
        const w = s.weightG ?? 0;
        rows.push({
          stage: st.stage,
          karigar: a.karigar,
          name: s.name,
          pieces: s.pieces,
          weightG: w,
          purity: jc.targetPurity,
          pureG: +(w * factorFor(jc.targetPurity, tiers)).toFixed(3),
        });
      });
      a.issues.forEach((i) => {
        if (!i.label || i.label.startsWith("Wastage")) return;
        const w = i.returnedWeight ?? 0;
        const purity = i.returnedPurity ?? jc.targetPurity;
        rows.push({
          stage: st.stage,
          karigar: a.karigar,
          name: i.label,
          pieces: i.pieceCount,
          weightG: w,
          purity,
          pureG: +(w * factorFor(purity, tiers)).toFixed(3),
        });
      });
    })
  );
  return rows;
}

// Per-line stone detail for the costing breakdown (stage / karigar / issued / returned / net).
export interface StoneLine {
  stage: StageName;
  karigar: string;
  type: string;
  qtyIssued: string;
  valueIssued: number;
  qtyReturned: string;
  valueReturned: number;
  netValue: number;
}

export function stoneLines(jc: JobCard): StoneLine[] {
  const rows: StoneLine[] = [];
  jc.stages.forEach((st) =>
    st.assignments.forEach((a) =>
      a.stones.forEach((s) => {
        rows.push({
          stage: st.stage,
          karigar: a.karigar,
          type: s.type,
          qtyIssued: s.qtyIssued,
          valueIssued: s.valueIssued,
          qtyReturned: s.qtyReturned,
          valueReturned: s.valueReturned,
          netValue: +((s.valueIssued || 0) - (s.valueReturned || 0)).toFixed(2),
        });
      })
    )
  );
  return rows;
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
    stonesReturned = 0,
    wastageWeight = 0,
    wastageValue = 0;
  jc.stages.forEach((st) =>
    st.assignments.forEach((a) => {
      labour += a.labour.reduce((s, l) => s + l.amount, 0);
      stonesIssued += a.stones.reduce((s, x) => s + (x.valueIssued || 0), 0);
      stonesReturned += a.stones.reduce((s, x) => s + (x.valueReturned || 0), 0);
      wastageWeight += a.issues.reduce((s, i) => s + (i.wastageWeight || 0), 0);
      wastageValue += a.labour.filter((l) => l.basis === "Wastage %").reduce((s, l) => s + l.amount, 0);
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
    wastageWeight: +wastageWeight.toFixed(3),
    wastageValue: +wastageValue.toFixed(2),
    activeStage: info.stage,
    activeStageStatus: info.status,
  };
}

/* ============================== KARIGAR LEDGER (§6) ============================== */

export type LedgerType =
  | "Opening Balance"
  | "Issue (Dr)"
  | "Return (Cr)"
  | "Bulk Receive (Cr)"
  | "Dust Return (Cr)"
  | "Wastage Deduction (Cr)";

export type LedgerSource = "opening" | "bulkIssue" | "bulkReceipt" | "jobcard";

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
  // Where this row comes from, so the UI can edit/delete the right source.
  sourceType: LedgerSource;
  sourceId: string;
}

export interface KarigarOpeningBalance {
  karigar: string;
  balance: number; // pure-eq grams, signed — positive = karigar owes, negative = store owes karigar
  date: string; // as-of date, shown as the ledger row's own date
}

export function buildLedger(
  jobCards: JobCard[],
  tiers: PurityTier[],
  bulkIssues: BulkStockIssue[],
  bulkReceipts: BulkStockReceipt[] = [],
  openingBalances: KarigarOpeningBalance[] = []
): Record<string, LedgerRow[]> {
  const rows: Omit<LedgerRow, "balance">[] = [];
  const pure = pureTierLabel(tiers);
  (openingBalances || []).forEach((o) => {
    if (!o.balance) return;
    rows.push({
      date: o.date,
      karigar: o.karigar,
      stage: "Opening Balance",
      jobCardId: "—",
      type: "Opening Balance",
      weight: Math.abs(o.balance),
      purity: pure,
      pureEq: o.balance,
      sourceType: "opening",
      sourceId: o.karigar,
    });
  });
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
      sourceType: "bulkIssue",
      sourceId: b.id,
    });
  });
  (bulkReceipts || []).forEach((b) => {
    rows.push({
      date: b.date,
      karigar: b.karigar,
      stage: b.label ? `Bulk Receive — ${b.label}` : "Bulk Receive",
      jobCardId: "—",
      type: "Bulk Receive (Cr)",
      weight: b.weight,
      purity: b.purity,
      pureEq: b.weight * factorFor(b.purity, tiers),
      sourceType: "bulkReceipt",
      sourceId: b.id,
    });
    // Same wastage-% formula as Casting/Fitting job-card output — always
    // credited at pure (24K/100%), never this receipt's own purity.
    if (b.wastageWeight) {
      const wastagePurity = pureTierLabel(tiers);
      rows.push({
        date: b.date,
        karigar: b.karigar,
        stage: b.label ? `Bulk Receive — ${b.label} (wastage)` : "Bulk Receive (wastage)",
        jobCardId: "—",
        type: "Wastage Deduction (Cr)",
        weight: b.wastageWeight,
        purity: wastagePurity,
        pureEq: b.wastageWeight * factorFor(wastagePurity, tiers),
        sourceType: "bulkReceipt",
        sourceId: b.id,
      });
    }
  });
  jobCards.forEach((jc) => {
    jc.stages.forEach((stage) => {
      // Fitting findings are credited to the karigar exclusively via
      // BulkStockReceipt (bulk, ahead of any specific job card) — crediting
      // them again here, per job card, would double-count the same metal.
      // Meenakari and Setting draw the piece itself from the job card (that
      // part of the flow is unchanged) but the karigar is only ever paid
      // labour for the work — the gold/metal is the job's, not theirs to be
      // credited or debited against, so neither stage touches the ledger.
      if (stage.stage === "Fitting" || stage.stage === "Meenakari" || stage.stage === "Setting") return;
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
              sourceType: "jobcard",
              sourceId: jc.id,
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
                sourceType: "jobcard",
                sourceId: jc.id,
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
                sourceType: "jobcard",
                sourceId: jc.id,
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
                sourceType: "jobcard",
                sourceId: jc.id,
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
    const delta = r.type === "Issue (Dr)" || r.type === "Opening Balance" ? r.pureEq : -r.pureEq;
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
