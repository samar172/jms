import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../db";
import { requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";
import { badRequest, notFound } from "../../utils/httpError";
import type { Role } from "@jms/shared";

const router = Router();

router.use(requireRole("SUPER_ADMIN"));

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  karigarId: true,
  createdAt: true,
  appRoleId: true,
  appRole: { select: { id: true, name: true, isSuperAdmin: true } },
} as const;

/**
 * Reconcile the RBAC role and the legacy enum from whatever the client sent.
 * Accepts either `appRoleId` (new) or `role` (legacy enum) and returns both, so
 * the old and new user forms both work during the transition. A custom (non-
 * system) role maps to the cost-hidden legacy enum "SALES" for any code still
 * reading the enum.
 */
async function resolveRoleInputs(input: {
  appRoleId?: string;
  role?: Role;
}): Promise<{ appRoleId: string; role: Role }> {
  if (input.appRoleId) {
    const role = await prisma.appRole.findUnique({ where: { id: input.appRoleId } });
    if (!role) throw badRequest("Unknown role");
    const legacy = (role.isSystem ? (role.name as Role) : "SALES") as Role;
    return { appRoleId: role.id, role: legacy };
  }
  if (input.role) {
    const role = await prisma.appRole.findUnique({ where: { name: input.role } });
    if (!role) throw badRequest(`Role ${input.role} is not set up yet — run the RBAC seed`);
    return { appRoleId: role.id, role: input.role };
  }
  throw badRequest("A role is required");
}

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(
      await prisma.user.findMany({
        select: userSelect,
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
  role: z.enum(ROLES).optional(),
  appRoleId: z.string().optional(),
  karigarId: z.string().optional(),
  password: z.string().min(8).optional(),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const { appRoleId, role } = await resolveRoleInputs(body);
    const password = body.password ?? crypto.randomBytes(9).toString("base64url");
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        role,
        appRoleId,
        karigarId: body.karigarId,
        passwordHash,
      },
      select: userSelect,
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
  appRoleId: z.string().optional(),
  isActive: z.boolean().optional(),
  name: z.string().min(1).optional(),
});

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const before = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound("User not found");
    const body = updateSchema.parse(req.body);

    // Resolve role change (either field) into both columns; leave role alone
    // when the caller sent neither.
    const roleData =
      body.role || body.appRoleId
        ? await resolveRoleInputs({ role: body.role, appRoleId: body.appRoleId })
        : null;

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        isActive: body.isActive,
        name: body.name,
        ...(roleData ?? {}),
      },
      select: userSelect,
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
