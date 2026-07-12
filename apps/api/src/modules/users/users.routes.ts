import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../db";
import { requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";
import { notFound } from "../../utils/httpError";

const router = Router();

router.use(requireRole("SUPER_ADMIN"));

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(
      await prisma.user.findMany({
        select: { id: true, email: true, name: true, role: true, isActive: true, karigarId: true, createdAt: true },
        orderBy: { name: "asc" },
      })
    );
  })
);

const ROLES = [
  "SUPER_ADMIN",
  "MANAGER",
  "COSTING",
  "STORE",
  "PRODUCTION",
  "SALES",
  "KARIGAR",
  "AUDITOR",
] as const;

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(ROLES),
  karigarId: z.string().optional(),
  password: z.string().min(8).optional(),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const password = body.password ?? crypto.randomBytes(9).toString("base64url");
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        role: body.role,
        karigarId: body.karigarId,
        passwordHash,
      },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "User",
      entityId: user.id,
      after: user,
      ipAddress: req.ip ?? null,
    });

    // temporaryPassword is returned once, out-of-band delivery (email/SMS) is
    // a deployment concern outside this pass's scope.
    res.status(201).json({ ...user, temporaryPassword: body.password ? undefined : password });
  })
);

const updateSchema = z.object({
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
  name: z.string().min(1).optional(),
});

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const before = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound("User not found");
    const body = updateSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: body,
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "User",
      entityId: user.id,
      before: { role: before.role, isActive: before.isActive, name: before.name },
      after: user,
      ipAddress: req.ip ?? null,
    });
    res.json(user);
  })
);

router.post(
  "/:id/reset-password",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw notFound("User not found");
    const tempPassword = crypto.randomBytes(9).toString("base64url");
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "User",
      entityId: user.id,
      after: { event: "password_reset" },
      ipAddress: req.ip ?? null,
    });
    res.json({ temporaryPassword: tempPassword });
  })
);

export default router;
