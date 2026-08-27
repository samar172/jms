/**
 * Maps Chowker silver-domain Prisma rows → the pure shared engine shapes
 * (@jms/shared production.ts), so the API and web run identical costing math.
 */
import { Prisma } from "@prisma/client";
import type {
  JobCard as EngineJobCard,
  PurityTier as EnginePurityTier,
  StageName,
  StageStatus,
  JobCardStatus,
  IssueStatus,
  LabourBasis,
  BulkStockIssue as EngineBulkStock,
} from "@jms/shared";

export function mapTier(t: { id: string; code: string; percent: Prisma.Decimal | number }): EnginePurityTier {
  return { id: t.id, label: t.code, percent: Number(t.percent) };
}

const STAGE_STATUS: Record<string, StageStatus> = {
  Pending: "Pending",
  InProgress: "In Progress",
  Approved: "Approved",
};
const JOB_STATUS: Record<string, JobCardStatus> = {
  Draft: "Draft",
  InProduction: "In Production",
  OnHold: "On Hold",
  Reconciliation: "Reconciliation",
  Closed: "Closed",
};
const LABOUR_BASIS: Record<string, LabourBasis> = {
  WastagePct: "Wastage %",
  PerGram: "Per Gram",
  PerStone: "Per Stone",
  Flat: "Flat",
};

// Reverse maps (label → enum) for writes.
export const STAGE_STATUS_ENUM: Record<StageStatus, string> = {
  Pending: "Pending",
  "In Progress": "InProgress",
  Approved: "Approved",
};
export const JOB_STATUS_ENUM: Record<JobCardStatus, string> = {
  Draft: "Draft",
  "In Production": "InProduction",
  "On Hold": "OnHold",
  Reconciliation: "Reconciliation",
  Closed: "Closed",
};
export const LABOUR_BASIS_ENUM: Record<LabourBasis, string> = {
  "Wastage %": "WastagePct",
  "Per Gram": "PerGram",
  "Per Stone": "PerStone",
  Flat: "Flat",
};

const iso = (d: Date | null | undefined): string => (d ? d.toISOString().slice(0, 10) : "");
const num = (d: Prisma.Decimal | number | null | undefined): number | null =>
  d == null ? null : Number(d);

// The Prisma include needed to build a full engine JobCard.
export const jobCardInclude = {
  itemMaster: true,
  targetPurity: true,
  activity: { orderBy: { date: "asc" } },
  reversals: { orderBy: { date: "asc" } },
  stages: {
    orderBy: { sequenceOrder: "asc" },
    include: {
      assignments: {
        include: {
          karigar: true,
          issues: { include: { purity: true, returnedPurity: true } },
          stones: true,
          labour: { include: { purity: true } },
        },
      },
    },
  },
} satisfies Prisma.ProdJobCardInclude;

type FullJobCard = Prisma.ProdJobCardGetPayload<{ include: typeof jobCardInclude }>;

export function mapJobCard(jc: FullJobCard): EngineJobCard {
  return {
    id: jc.jobNo,
    itemMasterId: jc.itemMasterId,
    targetPurity: jc.targetPurity.code,
    status: JOB_STATUS[jc.status] ?? "In Production",
    pieceCount: jc.pieceCount,
    createdAt: iso(jc.createdAt),
    dueDate: iso(jc.dueDate),
    closedAt: jc.closedAt ? iso(jc.closedAt) : null,
    notes: jc.notes,
    holdReason: jc.holdReason ?? undefined,
    manualSilverValue: num(jc.manualSilverValue),
    todaysSilverRate: num(jc.todaysSilverRate),
    stages: jc.stages.map((st) => ({
      stage: st.stageName as StageName,
      status: STAGE_STATUS[st.status] ?? "Pending",
      approvedDate: st.approvedDate ? iso(st.approvedDate) : null,
      assignments: st.assignments.map((a) => ({
        id: a.id,
        karigar: a.karigar.name,
        issues: a.issues.map((i) => ({
          id: i.id,
          material: "Silver" as const,
          purity: i.purity?.code ?? null,
          issuedWeight: num(i.issuedWeight),
          issueDate: iso(i.issueDate),
          status: (i.status === "Reconciled" ? "Reconciled" : "Issued") as IssueStatus,
          returnedWeight: num(i.returnedWeight),
          returnedPurity: i.returnedPurity?.code ?? null,
          dustWeight: num(i.dustWeight),
          returnDate: i.returnDate ? iso(i.returnDate) : null,
          fromBulkStock: i.fromBulkStock,
          pieceCount: i.pieceCount,
          subItemType: i.subItemType ?? null,
          wastagePercent: num(i.wastagePercent),
          wastageWeight: num(i.wastageWeight),
          labourEntryId: i.labourEntryId ?? null,
        })),
        stones: a.stones.map((s) => ({
          id: s.id,
          type: s.type,
          qtyIssued: s.qtyIssued,
          valueIssued: Number(s.valueIssued),
          piecesCount: s.piecesCount ?? undefined,
          carat: s.carat == null ? undefined : Number(s.carat),
          ratePerCarat: s.ratePerCarat == null ? undefined : Number(s.ratePerCarat),
          qtyReturned: s.qtyReturned,
          valueReturned: Number(s.valueReturned),
          caratReturned: s.caratReturned == null ? undefined : Number(s.caratReturned),
        })),
        labour: a.labour.map((l) => ({
          id: l.id,
          basis: LABOUR_BASIS[l.basis] ?? "Flat",
          qty: Number(l.qty),
          rate: Number(l.rate),
          amount: Number(l.amount),
          note: l.note,
          purity: l.purity?.code ?? undefined,
        })),
      })),
    })),
  };
}

export function mapBulkIssue(b: {
  id: string;
  karigar: { name: string };
  purity: { code: string };
  weightGrams: Prisma.Decimal | number;
  issueDate: Date;
  note: string;
}): EngineBulkStock {
  return {
    id: b.id,
    karigar: b.karigar.name,
    purity: b.purity.code,
    weight: Number(b.weightGrams),
    date: iso(b.issueDate),
    note: b.note,
  };
}
