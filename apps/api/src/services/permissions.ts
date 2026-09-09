import { prisma } from "../db";
import type { Resource, Action } from "@jms/shared";

/**
 * Role → permission resolution with a small in-process cache.
 *
 * Permissions are checked on (potentially) every request, but they change rarely
 * (only when an admin edits a role). So we cache each role's permission set and
 * clear the entry whenever that role is mutated (see clearPermissionCache, called
 * from the roles routes). A cold cache costs one indexed query per role.
 */

interface RoleInfo {
  isSuperAdmin: boolean;
  permissions: Set<string>; // "<resource>:<action>"
}

const cache = new Map<string, RoleInfo>();

export function clearPermissionCache(roleId?: string): void {
  if (roleId) cache.delete(roleId);
  else cache.clear();
}

export async function getRoleInfo(roleId: string): Promise<RoleInfo | null> {
  const hit = cache.get(roleId);
  if (hit) return hit;

  const role = await prisma.appRole.findUnique({
    where: { id: roleId },
    include: { permissions: true },
  });
  if (!role) return null;

  const info: RoleInfo = {
    isSuperAdmin: role.isSuperAdmin,
    permissions: new Set(role.permissions.map((p) => `${p.resource}:${p.action}`)),
  };
  cache.set(roleId, info);
  return info;
}

/** Resolve the caller's appRoleId even if their (older) token predates RBAC. */
export async function resolveAppRoleId(
  appRoleId: string | null | undefined,
  userId: string,
): Promise<string | null> {
  if (appRoleId) return appRoleId;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { appRoleId: true },
  });
  return user?.appRoleId ?? null;
}

export async function userCan(
  appRoleId: string | null,
  resource: Resource,
  action: Action,
): Promise<boolean> {
  if (!appRoleId) return false;
  const info = await getRoleInfo(appRoleId);
  if (!info) return false;
  return info.isSuperAdmin || info.permissions.has(`${resource}:${action}`);
}

export async function isSuperAdmin(appRoleId: string | null): Promise<boolean> {
  if (!appRoleId) return false;
  const info = await getRoleInfo(appRoleId);
  return info?.isSuperAdmin ?? false;
}
