import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { prisma } from "../../db";
import * as authService from "./auth.service";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const ip = req.ip ?? null;
    const { accessToken, refreshToken, user } = await authService.login(email, password, ip);

    res.cookie(authService.REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: authService.REFRESH_COOKIE_MAX_AGE_MS,
    });
    res.json({ accessToken, user });
  })
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[authService.REFRESH_COOKIE_NAME];
    if (!token) return res.status(401).json({ error: "No refresh token" });
    const { accessToken, refreshToken, user } = await authService.refresh(token);
    res.cookie(authService.REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: authService.REFRESH_COOKIE_MAX_AGE_MS,
    });
    res.json({ accessToken, user });
  })
);

router.post("/logout", (_req, res) => {
  res.clearCookie(authService.REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
  res.status(204).send();
});

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, name: true, role: true, karigarId: true },
    });
    res.json(user);
  })
);

export default router;
