import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@jms/shared";
import { env } from "../env";
import { unauthorized, forbidden } from "../utils/httpError";

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  karigarId: string | null;
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
