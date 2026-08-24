/**
 * Client for the Chowker silver-domain API (/api/production). Types mirror the
 * server responses (which are built from the shared engine shapes).
 */
import { apiFetch } from "./api";
import { useApi } from "./hooks";
import type {
  JobCard,
  PurityTier,
  JcTotals,
  LedgerRow,
} from "@jms/shared";

export interface ProdSettings {
  tiers: PurityTier[];
  baseRate: number;
  defaultRates: {
    castingWastagePct: number;
    fittingWastagePct: number;
    meenakariRatePerGm: number;
    jadaiRatePerStone: number;
    settingRatePerStone: number;
    flatLabour?: number;
  };
}

export interface ItemMaster {
  id: string;
  serialNo?: string;
  name: string;
  category: string;
  designCode: string | null;
  targetPurity: string;
  estGrossWeight: number;
  notes: string;
  imageUrl: string | null;
  jobCardCount: number;
}

export interface ProdKarigar {
  id: string;
  name: string;
  specialization: string | null;
  contact: string | null;
  defaultWastagePct: number | null;
  defaultRatePerGm: number | null;
  defaultFlatLabour: number | null;
  balance: number;
  labourEarned: number;
  holding: { jobId: string; stage: string; weight: number; purity: string | null }[];
}

export interface JobCardListRow {
  id: string;
  itemName: string;
  category: string;
  thumbnailUrl: string | null;
  status: string;
  pieceCount: number | null;
  dueDate: string;
  grossWeightEst: number;
  grossWeight: number;
  activeStage: string | null;
  labour: number;
  pureEq: number;
}

export interface JobCardDetail {
  jobCard: JobCard;
  tiers: PurityTier[];
  baseRate: number;
  item: { id: string; name: string; category: string; designCode: string | null; estGrossWeight: number; images: { url: string }[] };
  activity: { date: string; text: string }[];
  reversals: { date: string; reason: string; approvedBy: string }[];
  totals: JcTotals & {
    grossWeight: number;
    stonesNetCaratGrams: number;
    silverValue: number;
    effectiveSilverValue: number;
    todaysSaleValue: number;
    estimatedCostToDate: number;
    productionRate: number;
  };
  stonesByType: { type: string; carat: number; value: number }[];
}

export const useProdSettings = () => useApi<ProdSettings>("/api/production/settings");
export const useItemMasters = () => useApi<ItemMaster[]>("/api/production/item-masters");
export const useProdKarigars = () => useApi<ProdKarigar[]>("/api/production/karigars");
export const useJobCards = () => useApi<JobCardListRow[]>("/api/production/job-cards");

export interface ItemMasterDetail {
  id: string;
  serialNo: string;
  name: string;
  category: string;
  designCode: string | null;
  targetPurity: string;
  estGrossWeight: number;
  notes: string;
  images: { url: string }[];
  jobCards: { id: string; status: string; pieceCount: number | null; dueDate: string; createdAt: string }[];
}
export const useItemMaster = (key: string | null) =>
  useApi<ItemMasterDetail>(key ? `/api/production/item-masters/${key}` : null);
export const useJobCard = (jobNo: string | null) =>
  useApi<JobCardDetail>(jobNo ? `/api/production/job-cards/${jobNo}` : null);
export const useLedger = () => useApi<Record<string, LedgerRow[]>>("/api/production/ledger");

// ---- mutations ----
const post = (path: string, body?: unknown) => apiFetch(`/api/production${path}`, { method: "POST", body });
const del = (path: string) => apiFetch(`/api/production${path}`, { method: "DELETE" });

export const createJobCard = (body: { itemMasterId: string; dueDate?: string; pieceCount?: number; notes?: string }) =>
  post("/job-cards", body) as Promise<{ id: string; jobNo: string }>;
export const issueBulkStock = (body: { karigarId: string; purityId: string; weightGrams: number; note?: string }) =>
  post("/bulk-stock", body);
export const assignKarigar = (jobNo: string, stageName: string, karigarId: string) =>
  post(`/job-cards/${jobNo}/assign`, { stageName, karigarId });
export const issueMaterial = (assignmentId: string, body: { purity: string; issuedWeight: number; pieceCount?: number }) =>
  post(`/assignments/${assignmentId}/issue`, body);
export const reconcile = (issueId: string, body: Record<string, unknown>) =>
  post(`/issues/${issueId}/reconcile`, body);
export const editReconcile = (issueId: string, body: Record<string, unknown>) =>
  post(`/issues/${issueId}/edit-reconcile`, body);
export const cancelReconcile = (issueId: string) =>
  post(`/issues/${issueId}/cancel-reconcile`);
export const castOutput = (jobNo: string, body: { assignmentId: string; returnedWeight: number; wastagePercent: number; pieceCount: number }) =>
  post(`/job-cards/${jobNo}/cast-output`, body);
export const jadaiOutput = (jobNo: string, body: Record<string, unknown>) =>
  post(`/job-cards/${jobNo}/jadai-output`, body);
export const editJadaiOutput = (jobNo: string, body: Record<string, unknown>) =>
  post(`/job-cards/${jobNo}/jadai-output/edit`, body);
export const findingOutput = (jobNo: string, body: Record<string, unknown>) =>
  post(`/job-cards/${jobNo}/finding-output`, body);
export const issueStones = (assignmentId: string, body: Record<string, unknown>) =>
  post(`/assignments/${assignmentId}/stones`, body);
export const returnStones = (stoneId: string, body: Record<string, unknown>) =>
  post(`/stones/${stoneId}/return`, body);
export const addLabour = (assignmentId: string, body: Record<string, unknown>) =>
  post(`/assignments/${assignmentId}/labour`, body);
export const removeLabour = (labourId: string) => del(`/labour/${labourId}`);
export const approveStage = (jobNo: string, stageName: string) =>
  post(`/job-cards/${jobNo}/stages/${stageName}/approve`);
export const unapproveStage = (jobNo: string, stageName: string, reason?: string) =>
  post(`/job-cards/${jobNo}/stages/${stageName}/unapprove`, { reason });
export const closeJobCard = (jobNo: string) => post(`/job-cards/${jobNo}/close`);
export const reopenJobCard = (jobNo: string, body: { reason: string; approvedBy: string }) =>
  post(`/job-cards/${jobNo}/reopen`, body);
export const toggleHold = (jobNo: string, holdReason?: string) =>
  post(`/job-cards/${jobNo}/hold`, { holdReason });
export const updateJobCardMeta = (jobNo: string, body: Record<string, unknown>) =>
  apiFetch(`/api/production/job-cards/${jobNo}`, { method: "PATCH", body });

// config / masters
const patch = (path: string, body?: unknown) => apiFetch(`/api/production${path}`, { method: "PATCH", body });
export const updateSettings = (body: { baseRate?: number; defaultRates?: Record<string, number> }) => patch("/settings", body);
export const addTier = (body: { label: string; percent: number }) => post("/purity-tiers", body);
export const updateTier = (id: string, body: { label?: string; percent?: number }) => patch(`/purity-tiers/${id}`, body);
export const deleteTier = (id: string) => del(`/purity-tiers/${id}`);
export const createKarigar = (body: Record<string, unknown>) => post("/karigars", body);
export const updateKarigar = (id: string, body: Record<string, unknown>) => patch(`/karigars/${id}`, body);
export const createItemMaster = (body: Record<string, unknown>) => post("/item-masters", body);
export const updateItemMaster = (id: string, body: Record<string, unknown>) => patch(`/item-masters/${id}`, body);

export const STAGE_HI: Record<string, string> = {
  Casting: "ढलाई",
  Meenakari: "मीनाकारी",
  Jadai: "जड़ाई",
  Setting: "सेटिंग",
  Fitting: "फिटिंग / पॉलिश",
};
