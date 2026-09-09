import { Router } from "express";
import { z } from "zod";
import {
  RESOURCES,
  ACTIONS,
  RESOURCE_LABELS,
  ACTION_LABELS,
  VIEW_ONLY_RESOURCES,
} from "@jms/shared";
import { prisma } from "../../db";
import { requirePermission } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";
import { clearPermissionCache } from "../../services/permissions";
import { badRequest, notFound, forbidden } from "../../utils/httpError";

const router = Router();

// Role administration lives under the "users" resource. Super-admin bypasses.
const canView = requirePermission("users", "VIEW");
const canManage = requirePermission("users", "UPDATE");

/** Static metadata the UI uses to render the permission matrix. */
router.get(
  "/meta",
  canView,
  asyncHandler(async (_req, res) => {
    res.json({
      resources: RESOURCES.map((r) => ({
        key: r,
        label: RESOURCE_LABELS[r],
        actions: VIEW_ONLY_RESOURCES.includes(r) ? ["VIEW"] : ACTIONS,
      })),
      actions: ACTIONS.map((a) => ({ key: a, label: ACTION_LABELS[a] })),
    });
  }),
);

router.get(
  "/",
  canView,
  asyncHandler(async (_req, res) => {
    const roles = await prisma.appRole.findMany({
      include: { permissions: true, _count: { select: { users: true } } },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
    res.json(
      roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        isSuperAdmin: r.isSuperAdmin,
        userCount: r._count.users,
        permissions: r.permissions.map((p) => `${p.resource}:${p.action}`),
      })),
    );
  }),
);

const permissionSchema = z
  .object({
    resource: z.enum(RESOURCES),
    action: z.enum(ACTIONS),
  })
  .refine((p) => !(VIEW_ONLY_RESOURCES.includes(p.resource) && p.action !== "VIEW"), {
    message: "This resource only supports VIEW",
  });

const createSchema = z.object({
  name: z.string().min(2).max(40),
  description: z.string().max(200).optional(),
  permissions: z.array(permissionSchema).default([]),
});

router.post(
  "/",
  canManage,
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const existing = await prisma.appRole.findUnique({ where: { name: body.name } });
    if (existing) throw badRequest("A role with that name already exists");

    const role = await prisma.appRole.create({
      data: {
        name: body.name,
        description: body.description,
        isSystem: false,
        isSuperAdmin: false,
        permissions: { create: dedupe(body.permissions) },
      },
      include: { permissions: true },
    });

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "AppRole",
      entityId: role.id,
      after: { name: role.name, permissions: role.permissions.length },
      ipAddress: req.ip ?? null,
    });

    res.status(201).json({ id: role.id });
  }),
);

const updateSchema = z.object({
  name: z.string().min(2).max(40).optional(),
  description: z.string().max(200).nullable().optional(),
  // When present, REPLACES the whole permission set for the role.
  permissions: z.array(permissionSchema).optional(),
});

router.patch(
  "/:id",
  canManage,
  asyncHandler(async (req, res) => {
    const role = await prisma.appRole.findUnique({ where: { id: req.params.id } });
    if (!role) throw notFound("Role not found");
    if (role.isSuperAdmin) throw forbidden("The super-admin role cannot be edited");

    const body = updateSchema.parse(req.body);
    if (body.name && body.name !== role.name) {
      const clash = await prisma.appRole.findUnique({ where: { name: body.name } });
      if (clash) throw badRequest("A role with that name already exists");
    }

    await prisma.$transaction(async (tx) => {
      await tx.appRole.update({
        where: { id: role.id },
        data: {
          // A system role keeps its name (used to link legacy users); its
          // permissions are still fully editable.
          name: role.isSystem ? undefined : body.name,
          description: body.description === undefined ? undefined : body.description,
        },
      });
      if (body.permissions) {
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        const rows = dedupe(body.permissions).map((p) => ({ ...p, roleId: role.id }));
        if (rows.length > 0) await tx.rolePermission.createMany({ data: rows });
      }
    });

    clearPermissionCache(role.id);

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "AppRole",
      entityId: role.id,
      before: { name: role.name },
      after: { name: body.name ?? role.name, permissionsReplaced: !!body.permissions },
      ipAddress: req.ip ?? null,
    });

    res.json({ ok: true });
  }),
);

router.delete(
  "/:id",
  canManage,
  asyncHandler(async (req, res) => {
    const role = await prisma.appRole.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw notFound("Role not found");
    if (role.isSystem) throw forbidden("Built-in roles cannot be deleted");
    if (role._count.users > 0)
      throw badRequest(
        `Reassign the ${role._count.users} user(s) on this role before deleting it`,
      );

    await prisma.appRole.delete({ where: { id: role.id } });
    clearPermissionCache(role.id);

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "DELETE",
      entityType: "AppRole",
      entityId: role.id,
      before: { name: role.name },
      ipAddress: req.ip ?? null,
    });

    res.json({ ok: true });
  }),
);

/** Drop duplicate (resource,action) pairs a client might send. */
function dedupe(perms: { resource: string; action: string }[]) {
  const seen = new Set<string>();
  return perms.filter((p) => {
    const k = `${p.resource}:${p.action}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export default router;
