import type { Role } from "./roles";

export interface JwtPayload {
  sub: string;
  role: Role;
  name: string;
}

export const PRODUCT_STATUSES = [
  "DESIGN",
  "ESTIMATED",
  "IN_PRODUCTION",
  "FINISHED",
  "SOLD",
  "MELTED",
] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const JOB_STAGE_STATUSES = [
  "PENDING",
  "ISSUED",
  "IN_PROGRESS",
  "RECEIVED",
  "APPROVED",
  "REWORK",
] as const;
export type JobStageStatus = (typeof JOB_STAGE_STATUSES)[number];

export const LABOUR_RATE_BASES = ["PER_GRAM", "PER_PIECE", "PER_CARAT", "DAILY_WAGE"] as const;
export type LabourRateBasis = (typeof LABOUR_RATE_BASES)[number];

export const ESTIMATE_TYPES = ["ROUGH_ESTIMATE", "FINAL_COSTING"] as const;
export type EstimateType = (typeof ESTIMATE_TYPES)[number];

export const ESTIMATE_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "SUPERSEDED"] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

export const MATERIAL_TYPES = ["GOLD", "POLKI", "COLOURED_STONE", "FINDING"] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];
