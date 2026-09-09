import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role, Resource, Action } from "@jms/shared";
import { env } from "../env";
import { unauthorized, forbidden } from "../utils/httpError";
import { userCan, resolveAppRoleId, isSuperAdmin as roleIsSuperAdmin } from "../services/permissions";

export interface AuthUser {
  id: string;
  role: Role; // legacy enum — kept for existing requireRole/canSeeCost checks
  name: string;
  karigarId: string | null;
  appRoleId: string | null; // RBAC role (source of truth for requirePermission)
  roleName: string; // display name of the assigned AppRole
  isSuperAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw unauthorized("Missing bearer token");
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthUser & {
      exp: number;
    };
    req.user = {
      id: payload.id,
      role: payload.role,
      name: payload.name,
      karigarId: payload.karigarId ?? null,
      appRoleId: payload.appRoleId ?? null,
      roleName: payload.roleName ?? payload.role,
      isSuperAdmin: payload.isSuperAdmin ?? false,
    };
    next();
  } catch {
    throw unauthorized("Invalid or expired token");
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) {
      throw forbidden(`Role ${req.user.role} cannot access this resource`);
    }
    next();
  };
}

/** Allow only the owner / super-admin (used for approving change requests). */
export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (req.user.isSuperAdmin) return next();
  resolveAppRoleId(req.user.appRoleId, req.user.id)
    .then((appRoleId) => roleIsSuperAdmin(appRoleId))
    .then((ok) => (ok ? next() : next(forbidden("Only an owner/super-admin can do this"))))
    .catch(next);
}

/**
 * RBAC gate: allow only if the caller's AppRole grants <resource>:<action>
 * (super-admin bypasses). Tolerates a pre-RBAC token by resolving the role from
 * the DB, so a mid-session deploy doesn't lock anyone out.
 */
export function requirePermission(resource: Resource, action: Action) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    resolveAppRoleId(req.user.appRoleId, req.user.id)
      .then((appRoleId) => userCan(appRoleId, resource, action))
      .then((ok) =>
        ok
          ? next()
          : next(forbidden(`You do not have permission to ${action} ${resource}`)),
      )
      .catch(next);
  };
}
