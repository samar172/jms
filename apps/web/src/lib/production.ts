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
  LabourLedgerRow,
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
  subItemNames: { id: string; label: string }[];
  findingNames: { id: string; label: string }[];
  workTypeNames: { id: string; label: string }[];
  jobCardSeries: JobCardSeries[];
}

export interface JobCardSeries {
  id: string;
  name: string;
  startAt: number;
  padWidth: number;
  effectiveFrom: string;
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
  imageFullUrl: string | null;
  jobCardCount: number;
  isArchived: boolean;
}

export interface ProdKarigar {
  id: string;
  name: string;
  specialization: string | null;
  contact: string | null;
  defaultWastagePct: number | null;
  defaultRatePerGm: number | null;
  defaultFlatLabour: number | null;
  openingBalance: number;
  openingBalanceDate: string;
  balance: number;
  labourEarned: number;
  holding: { jobId: string; stage: string; weight: number; purity: string | null }[];
}

export interface JobCardListRow {
  id: string;
  itemName: string;
  category: string;
  thumbnailUrl: string | null;
  imageFullUrl: string | null;
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
  item: { id: string; name: string; category: string; designCode: string | null; estGrossWeight: number; images: { url: string; fullUrl: string }[] };
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
export const useItemMasters = (archived = false) =>
  useApi<ItemMaster[]>(`/api/production/item-masters${archived ? "?archived=1" : ""}`);
export const useProdKarigars = () => useApi<ProdKarigar[]>("/api/production/karigars");
export const useJobCards = () => useApi<JobCardListRow[]>("/api/production/job-cards");

export interface DeletedJobCard {
  jobNo: string;
  item: string | null;
  serialNo: string | null;
  status: string | null;
  stages: number | null;
  cardCreatedBy: string | null;
  deletedBy: string;
  deletedAt: string;
}
export const useDeletedJobCards = () =>
  useApi<DeletedJobCard[]>("/api/production/job-cards-deleted");

export interface ItemMasterDetail {
  id: string;
  serialNo: string;
  name: string;
  category: string;
  designCode: string | null;
  targetPurity: string;
  estGrossWeight: number;
  notes: string;
  isArchived: boolean;
  images: { id: string; url: string; fullUrl: string; isPrimary: boolean }[];
  jobCards: { id: string; status: string; pieceCount: number | null; dueDate: string; createdAt: string }[];
}
export const useItemMaster = (key: string | null) =>
  useApi<ItemMasterDetail>(key ? `/api/production/item-masters/${key}` : null);
export const useJobCard = (jobNo: string | null) =>
  useApi<JobCardDetail>(jobNo ? `/api/production/job-cards/${jobNo}` : null);
export const useLedger = () => useApi<Record<string, LedgerRow[]>>("/api/production/ledger");
export const useLabourLedger = () => useApi<Record<string, LabourLedgerRow[]>>("/api/production/labour-ledger");

// ---- mutations ----
const post = (path: string, body?: unknown) => apiFetch(`/api/production${path}`, { method: "POST", body });
const del = (path: string) => apiFetch(`/api/production${path}`, { method: "DELETE" });

export const createJobCard = (body: { itemMasterId: string; seriesId: string; dueDate?: string; pieceCount?: number; notes?: string }) =>
  post("/job-cards", body) as Promise<{ id: string; jobNo: string }>;
export const issueBulkStock = (body: { karigarId: string; purityId: string; weightGrams: number; note?: string }) =>
  post("/bulk-stock", body);
export const recordBulkReceipt = (body: { karigarId: string; purityId: string; weightGrams: number; label?: string; wastagePercent?: number; note?: string }) =>
  post("/bulk-receipt", body);
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
export const castOutput = (jobNo: string, body: { assignmentId: string; returnedWeight: number; wastagePercent: number; pieceCount: number; subItems?: { name: string; pieces: number; weightG: number | null }[] }) =>
  post(`/job-cards/${jobNo}/cast-output`, body);
export const editCastOutput = (jobNo: string, body: { assignmentId: string; returnedWeight: number; wastagePercent: number; pieceCount: number; subItems?: { name: string; pieces: number; weightG: number | null }[] }) =>
  post(`/job-cards/${jobNo}/cast-output/edit`, body);
export const jadaiOutput = (jobNo: string, body: Record<string, unknown>) =>
  post(`/job-cards/${jobNo}/jadai-output`, body);
export const editJadaiOutput = (jobNo: string, body: Record<string, unknown>) =>
  post(`/job-cards/${jobNo}/jadai-output/edit`, body);
export const kundanOutput = (jobNo: string, body: { assignmentId: string; weight: number; labourAmount: number }) =>
  post(`/job-cards/${jobNo}/kundan-output`, body);
export const editKundanOutput = (jobNo: string, body: { assignmentId: string; weight: number; labourAmount: number }) =>
  post(`/job-cards/${jobNo}/kundan-output/edit`, body);
export const findingOutput = (jobNo: string, body: Record<string, unknown>) =>
  post(`/job-cards/${jobNo}/finding-output`, body);
export const editFindingOutput = (jobNo: string, body: Record<string, unknown>) =>
  post(`/job-cards/${jobNo}/finding-output/edit`, body);
export const issueStones = (assignmentId: string, body: Record<string, unknown>) =>
  post(`/assignments/${assignmentId}/stones`, body);
export const returnStones = (stoneId: string, body: Record<string, unknown>) =>
  post(`/stones/${stoneId}/return`, body);
export const editStone = (stoneId: string, body: { type: string; piecesCount: number | null; carat: number | null; ratePerCarat: number | null }) =>
  post(`/stones/${stoneId}/edit`, body);
export const removeStone = (stoneId: string) => del(`/stones/${stoneId}`);
export const removeIssue = (issueId: string) => del(`/issues/${issueId}`);
export const removeAssignment = (assignmentId: string) => del(`/assignments/${assignmentId}`);
export const clearAssignmentOutput = (assignmentId: string) => del(`/assignments/${assignmentId}/output`);
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
export const addSubItemName = (label: string) => post("/sub-item-names", { label });
export const updateSubItemName = (id: string, label: string) => patch(`/sub-item-names/${id}`, { label });
export const deleteSubItemName = (id: string) => del(`/sub-item-names/${id}`);
export const addFindingName = (label: string) => post("/finding-names", { label });
export const updateFindingName = (id: string, label: string) => patch(`/finding-names/${id}`, { label });
export const deleteFindingName = (id: string) => del(`/finding-names/${id}`);
export const addWorkTypeName = (label: string) => post("/work-type-names", { label });
export const updateWorkTypeName = (id: string, label: string) => patch(`/work-type-names/${id}`, { label });
export const deleteWorkTypeName = (id: string) => del(`/work-type-names/${id}`);
export const addJobCardSeries = (body: { name: string; startAt: number; padWidth?: number; effectiveFrom: string }) => post("/job-card-series", body);
export const updateJobCardSeries = (id: string, body: { name?: string; startAt?: number; padWidth?: number; effectiveFrom?: string }) => patch(`/job-card-series/${id}`, body);
export const deleteJobCardSeries = (id: string) => del(`/job-card-series/${id}`);
export const createKarigar = (body: Record<string, unknown>) => post("/karigars", body);
export const updateKarigar = (id: string, body: Record<string, unknown>) => patch(`/karigars/${id}`, body);
export const createItemMaster = (body: Record<string, unknown>) => post("/item-masters", body);
export const updateItemMaster = (id: string, body: Record<string, unknown>) => patch(`/item-masters/${id}`, body);

// Image upload goes through the (older, still-mounted) products module — it's
// the one place with multer + Cloudinary/local-disk storage wired up, shared
// across both the Chowker item masters here and the pre-Chowker Product model.
export const uploadItemImage = (itemId: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  form.append("type", "FINAL_PRODUCT");
  form.append("isPrimary", "true");
  return apiFetch(`/api/products/${itemId}/images`, { method: "POST", body: form, isForm: true });
};
export const deleteItemImage = (imageId: string) => apiFetch(`/api/products/images/${imageId}`, { method: "DELETE" });

export const archiveItemMaster = (key: string) => patch(`/item-masters/${key}/archive`);
export const unarchiveItemMaster = (key: string) => patch(`/item-masters/${key}/unarchive`);
export const deleteItemMaster = (key: string) => del(`/item-masters/${key}`);

export const STAGE_HI: Record<string, string> = {
  Casting: "ढलाई",
  Meenakari: "मीनाकारी",
  Jadai: "जड़ाई",
  Kundan: "कुंदन",
  Setting: "सेटिंग",
  Fitting: "फिटिंग / पॉलिश",
};
