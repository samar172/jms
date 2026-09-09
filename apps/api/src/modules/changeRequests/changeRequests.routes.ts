import { Router } from "express";
import { z } from "zod";
import { RESOURCES, CHANGE_REQUEST_ACTIONS, RESOURCE_LABELS } from "@jms/shared";
import { prisma } from "../../db";
import { requireSuperAdmin } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";
import { notify } from "../../services/notifications";
import { badRequest, notFound, forbidden } from "../../utils/httpError";

const router = Router();

const requesterSelect = {
  id: true,
  requester: { select: { id: true, name: true } },
  reviewer: { select: { id: true, name: true } },
  resource: true,
  targetId: true,
  action: true,
  summary: true,
  details: true,
  status: true,
  reviewNote: true,
  decidedAt: true,
  createdAt: true,
} as const;

/** Notify every owner/super-admin that a request is waiting. */
async function notifySuperAdmins(title: string, body: string, entityId: string) {
  const admins = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [{ role: "SUPER_ADMIN" }, { appRole: { isSuperAdmin: true } }],
    },
    select: { id: true },
  });
  await Promise.all(
    admins.map((a) =>
      notify({
        userId: a.id,
        type: "CHANGE_REQUEST",
        title,
        body,
        entityType: "ChangeRequest",
        entityId,
      }),
    ),
  );
}

const createSchema = z.object({
  resource: z.enum(RESOURCES),
  action: z.enum(CHANGE_REQUEST_ACTIONS),
  targetId: z.string().max(200).optional(),
  summary: z.string().min(3).max(200),
  details: z.string().max(2000).optional(),
});

// Anyone signed in can raise a request (the point is to ask for something you
// cannot do yourself).
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const cr = await prisma.changeRequest.create({
      data: {
        requesterId: req.user!.id,
        resource: body.resource,
        action: body.action,
        targetId: body.targetId,
        summary: body.summary,
        details: body.details,
      },
      select: requesterSelect,
    });

    await notifySuperAdmins(
      `Change request: ${body.action} ${RESOURCE_LABELS[body.resource]}`,
      `${req.user!.name}: ${body.summary}`,
      cr.id,
    );
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "ChangeRequest",
      entityId: cr.id,
      after: { resource: body.resource, action: body.action, summary: body.summary },
      ipAddress: req.ip ?? null,
    });

    res.status(201).json(cr);
  }),
);

// Super-admins see everything; everyone else sees only their own requests.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const mine = req.query.mine === "1";
    const admin = req.user!.isSuperAdmin;

    const rows = await prisma.changeRequest.findMany({
      where: {
        ...(admin && !mine ? {} : { requesterId: req.user!.id }),
        ...(status ? { status: status as never } : {}),
      },
      select: requesterSelect,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 500,
    });
    res.json(rows);
  }),
);

// How many are still pending — for the owner's inbox badge.
router.get(
  "/pending-count",
  requireSuperAdmin,
  asyncHandler(async (_req, res) => {
    res.json({ count: await prisma.changeRequest.count({ where: { status: "PENDING" } }) });
  }),
);

const decideSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().max(1000).optional(),
});

router.patch(
  "/:id/decide",
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const body = decideSchema.parse(req.body);
    const cr = await prisma.changeRequest.findUnique({ where: { id: req.params.id } });
    if (!cr) throw notFound("Request not found");
    if (cr.status !== "PENDING") throw badRequest(`Request is already ${cr.status}`);

    const updated = await prisma.changeRequest.update({
      where: { id: cr.id },
      data: {
        status: body.decision,
        reviewerId: req.user!.id,
        reviewNote: body.reviewNote,
        decidedAt: new Date(),
      },
      select: requesterSelect,
    });

    await notify({
      userId: cr.requesterId,
      type: "CHANGE_REQUEST",
      title: `Your request was ${body.decision.toLowerCase()}`,
      body: cr.summary,
      entityType: "ChangeRequest",
      entityId: cr.id,
    });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "APPROVE",
      entityType: "ChangeRequest",
      entityId: cr.id,
      after: { decision: body.decision, note: body.reviewNote },
      ipAddress: req.ip ?? null,
    });

    res.json(updated);
  }),
);

// After the owner has made the change by hand, mark it applied (closes the loop).
router.patch(
  "/:id/applied",
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const cr = await prisma.changeRequest.findUnique({ where: { id: req.params.id } });
    if (!cr) throw notFound("Request not found");
    if (cr.status !== "APPROVED")
      throw badRequest("Only an approved request can be marked applied");

    const updated = await prisma.changeRequest.update({
      where: { id: cr.id },
      data: { status: "APPLIED" },
      select: requesterSelect,
    });
    await notify({
      userId: cr.requesterId,
      type: "CHANGE_REQUEST",
      title: "Your requested change was applied",
      body: cr.summary,
      entityType: "ChangeRequest",
      entityId: cr.id,
    });
    res.json(updated);
  }),
);

// A requester can withdraw their own still-pending request.
router.patch(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const cr = await prisma.changeRequest.findUnique({ where: { id: req.params.id } });
    if (!cr) throw notFound("Request not found");
    if (cr.requesterId !== req.user!.id) throw forbidden("Not your request");
    if (cr.status !== "PENDING") throw badRequest("Only a pending request can be cancelled");

    const updated = await prisma.changeRequest.update({
      where: { id: cr.id },
      data: { status: "CANCELLED" },
      select: requesterSelect,
    });
    res.json(updated);
  }),
);

export default router;
