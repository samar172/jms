/* ============================== RBAC / PERMISSIONS ==============================
 *
 * Roles are now data, not a fixed enum: an admin can create named roles and grant
 * each a matrix of (resource × action) permissions. The eight names below are the
 * SYSTEM roles seeded on migration — they exist so existing logins keep working
 * and as sensible starting points; they can be re-permissioned like any other
 * role (only SUPER_ADMIN is special — it bypasses every check).
 *
 * A permission is the pair "<resource>:<action>". Presence grants; absence denies.
 * ============================================================================== */

// Kept for backward compatibility during the enum→table migration. Existing code
// and the old User.role column still reference these names.
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

/* ------------------------------- Resources ------------------------------- */
// Every gated panel in the app. Keep in sync with the sidebar.
export const RESOURCES = [
  "dashboard", // home / KPIs
  "job_cards", // production job cards, stages, assignments, bulk stock
  "karigars", // karigar master + ledger
  "items", // item / product master
  "rates", // metal rates, purity tiers, labour rates — the price masters
  "costing", // costing summary, margins, profit — the money view (VIEW-only in practice)
  "settings", // app settings, master name lists, job-card series, categories, stone types
  "users", // users, roles & permissions administration
] as const;

export type Resource = (typeof RESOURCES)[number];

export const RESOURCE_LABELS: Record<Resource, string> = {
  dashboard: "Dashboard",
  job_cards: "Job Cards & Production",
  karigars: "Karigars",
  items: "Items / Products",
  rates: "Prices & Rates",
  costing: "Costing & Margins",
  settings: "Settings & Masters",
  users: "Users, Roles & Permissions",
};

/* -------------------------------- Actions -------------------------------- */
export const ACTIONS = ["VIEW", "ADD", "UPDATE", "DELETE"] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  VIEW: "View",
  ADD: "Add",
  UPDATE: "Update",
  DELETE: "Delete",
};

// Some resources only make sense as VIEW (nothing to add/update/delete there).
export const VIEW_ONLY_RESOURCES: Resource[] = ["dashboard", "costing"];

export function actionsFor(resource: Resource): Action[] {
  return VIEW_ONLY_RESOURCES.includes(resource) ? ["VIEW"] : [...ACTIONS];
}

/* ------------------------------ Permissions ------------------------------ */
export type Permission = `${Resource}:${Action}`;

export function perm(resource: Resource, action: Action): Permission {
  return `${resource}:${action}`;
}

/** Does a permission set allow the action? A super-admin set is signalled separately. */
export function allows(
  permissions: ReadonlySet<string>,
  resource: Resource,
  action: Action,
): boolean {
  return permissions.has(perm(resource, action));
}

/* ------------------- Default permissions for system roles ------------------ */
// Used by the seed/migration to give each built-in role a reasonable starting
// matrix. Everything here is editable afterwards in the UI.
//
// SUPER_ADMIN is intentionally omitted — it bypasses all checks in code.
const V: Action[] = ["VIEW"];
const VAU: Action[] = ["VIEW", "ADD", "UPDATE"];
const VAUD: Action[] = ["VIEW", "ADD", "UPDATE", "DELETE"];

export const SYSTEM_ROLE_DEFAULTS: Record<
  Exclude<Role, "SUPER_ADMIN">,
  Partial<Record<Resource, Action[]>>
> = {
  MANAGER: {
    dashboard: V,
    job_cards: VAUD,
    karigars: VAUD,
    items: VAUD,
    rates: VAU,
    costing: V,
    settings: VAU,
    users: V,
  },
  COSTING: {
    dashboard: V,
    job_cards: V,
    karigars: V,
    items: V,
    rates: VAU,
    costing: V,
  },
  STORE: {
    dashboard: V,
    job_cards: V,
    karigars: V,
    items: VAU,
  },
  PRODUCTION: {
    dashboard: V,
    job_cards: VAU,
    karigars: V,
    items: V,
  },
  SALES: {
    dashboard: V,
    items: V,
  },
  KARIGAR: {
    job_cards: V,
  },
  AUDITOR: {
    // Read-only across the whole app, cost included.
    dashboard: V,
    job_cards: V,
    karigars: V,
    items: V,
    rates: V,
    costing: V,
    settings: V,
    users: V,
  },
};

/** Flatten a defaults entry to concrete "<resource>:<action>" permission strings. */
export function defaultPermissionsFor(role: Exclude<Role, "SUPER_ADMIN">): Permission[] {
  const out: Permission[] = [];
  const spec = SYSTEM_ROLE_DEFAULTS[role];
  for (const resource of RESOURCES) {
    const actions = spec[resource];
    if (!actions) continue;
    for (const action of actions) out.push(perm(resource, action));
  }
  return out;
}

/* ---------------------- Cost visibility (now a permission) ---------------- */
// Previously a hardcoded role list (COST_HIDDEN_ROLES). Cost/margin data is now
// gated by the costing:VIEW permission so it follows the role's matrix.
export const COST_VIEW: Permission = "costing:VIEW";

export function canSeeCostByPermissions(
  permissions: ReadonlySet<string>,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || permissions.has(COST_VIEW);
}

/* --------------------------- Change requests ------------------------------ */
export const CHANGE_REQUEST_ACTIONS = ["ADD", "UPDATE", "DELETE"] as const;
export type ChangeRequestAction = (typeof CHANGE_REQUEST_ACTIONS)[number];

export const CHANGE_REQUEST_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "APPLIED",
  "CANCELLED",
] as const;
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];

/* --------------------------- Legacy compatibility ------------------------- */
// Old call sites still import these; keep them working until every check is
// migrated to the permission model above. Derived from the AUDITOR/system
// intent: the four "shop-floor" roles never saw cost.
export const COST_HIDDEN_ROLES: Role[] = ["STORE", "PRODUCTION", "SALES", "KARIGAR"];

export function canSeeCost(role: Role): boolean {
  return !COST_HIDDEN_ROLES.includes(role);
}
