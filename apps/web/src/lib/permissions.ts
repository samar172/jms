"use client";

import { useApi } from "./hooks";

interface Me {
  isSuperAdmin: boolean;
  roleName?: string;
  permissions: string[]; // "resource:action"
}

/**
 * The current user's effective permissions, for gating UI. Backed by
 * /api/auth/me so a role change takes effect on the next fetch (no re-login).
 * A super-admin can do everything.
 */
export function usePermissions() {
  const { data } = useApi<Me>("/api/auth/me");
  const isSuperAdmin = !!data?.isSuperAdmin;
  const set = new Set(data?.permissions ?? []);
  return {
    ready: !!data,
    isSuperAdmin,
    roleName: data?.roleName,
    can: (resource: string, action: string) =>
      isSuperAdmin || set.has(`${resource}:${action}`),
  };
}
