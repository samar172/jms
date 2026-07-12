export const ROLES = [
  "SUPER_ADMIN",
  "MANAGER",
  "COSTING",
  "STORE",
  "PRODUCTION",
  "SALES",
  "KARIGAR",
  "AUDITOR",
] as const;

export type Role = (typeof ROLES)[number];

// Roles that must never see cost/rate/margin data anywhere in a response (BR-16).
export const COST_HIDDEN_ROLES: Role[] = ["STORE", "PRODUCTION", "SALES", "KARIGAR"];

export function canSeeCost(role: Role): boolean {
  return !COST_HIDDEN_ROLES.includes(role);
}
