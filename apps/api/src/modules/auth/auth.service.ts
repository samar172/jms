import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Role } from "@jms/shared";
import { prisma } from "../../db";
import { env } from "../../env";
import { unauthorized } from "../../utils/httpError";
import { recordAudit } from "../../services/audit";

const ACCESS_TOKEN_TTL = "30m"; // NFR-1.07: idle session should not outlive this without activity
const REFRESH_TOKEN_TTL_DAYS = 7;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export interface TokenUser {
  id: string;
  role: Role;
  name: string;
  karigarId: string | null;
}

function signAccessToken(user: TokenUser) {
  return jwt.sign(user, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

function signRefreshToken(user: TokenUser) {
  return jwt.sign(
    { id: user.id },
    env.JWT_REFRESH_SECRET,
    { expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d` }
  );
}

export async function login(email: string, password: string, ipAddress: string | null) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    throw unauthorized("Invalid email or password");
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw unauthorized(
      `Account locked until ${user.lockedUntil.toISOString()}. Contact your administrator.`
    );
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const failedLoginCount = user.failedLoginCount + 1;
    const lockedUntil =
      failedLoginCount >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
        : null;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount, lockedUntil },
    });
    throw unauthorized("Invalid email or password");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  });

  const tokenUser: TokenUser = {
    id: user.id,
    role: user.role,
    name: user.name,
    karigarId: user.karigarId,
  };

  await recordAudit(prisma, {
    userId: user.id,
    action: "CREATE",
    entityType: "Session",
    entityId: user.id,
    ipAddress,
    after: { event: "login" },
  });

  return {
    accessToken: signAccessToken(tokenUser),
    refreshToken: signRefreshToken(tokenUser),
    user: tokenUser,
  };
}

export async function refresh(refreshToken: string) {
  let payload: { id: string };
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as { id: string };
  } catch {
    throw unauthorized("Invalid or expired refresh token");
  }

  const user = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!user || !user.isActive) throw unauthorized();

  const tokenUser: TokenUser = {
    id: user.id,
    role: user.role,
    name: user.name,
    karigarId: user.karigarId,
  };

  return {
    accessToken: signAccessToken(tokenUser),
    refreshToken: signRefreshToken(tokenUser),
    user: tokenUser,
  };
}

export const REFRESH_COOKIE_NAME = "jms_refresh";
export const REFRESH_COOKIE_MAX_AGE_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
