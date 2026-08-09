import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";
import { badRequest, notFound } from "../../utils/httpError";

const router = Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const status = z.enum(["PENDING", "IN_ASSEMBLY", "ASSEMBLED"]).optional().parse(req.query.status);
    res.json(
      await prisma.assembly.findMany({
        where: status ? { status } : {},
        include: {
          order: { include: { product: { select: { serialNo: true, designName: true } }, customer: { select: { name: true } } } },
          assembler: { select: { id: true, name: true } },
          components: { include: { jobCard: { include: { product: { select: { designName: true } } } } } },
        },
        orderBy: { createdAt: "desc" },
      })
    );
  })
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const assembly = await prisma.assembly.findUnique({
      where: { id: req.params.id },
      include: {
        order: { include: { product: true, customer: true } },
        assembler: true,
        components: { include: { jobCard: { include: { product: true, stages: { include: { processStage: true } } } } } },
      },
    });
    if (!assembly) throw notFound("Assembly not found");
    res.json(assembly);
  })
);

// Starts assembly for an order — auto-enrols every JobCard already linked to
// it as a component (mockup's "Pendant / Chain / Earrings" checklist).
const createSchema = z.object({ orderId: z.string().min(1), assemblerId: z.string().optional() });

router.post(
  "/",
  requireRole("SUPER_ADMIN", "MANAGER", "PRODUCTION"),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: body.orderId }, include: { jobCards: true } });
    if (!order) throw notFound("Order not found");
    if (order.jobCards.length === 0) throw badRequest("This order has no job cards to assemble yet");

    const assembly = await prisma.assembly.create({
      data: {
        orderId: order.id,
        assemblerId: body.assemblerId,
        status: "IN_ASSEMBLY",
        startedAt: new Date(),
        createdById: req.user!.id,
        components: { create: order.jobCards.map((jc) => ({ jobCardId: jc.id })) },
      },
      include: { components: true },
    });

    await prisma.order.update({ where: { id: order.id }, data: { status: "ASSEMBLY" } });

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "Assembly",
      entityId: assembly.id,
      after: assembly,
      ipAddress: req.ip ?? null,
    });

    res.status(201).json(assembly);
  })
);

const updateSchema = z.object({
  assemblerId: z.string().optional(),
  finalWeightG: z.number().positive().optional(),
  remarks: z.string().optional(),
});

router.patch(
  "/:id",
  requireRole("SUPER_ADMIN", "MANAGER", "PRODUCTION"),
  asyncHandler(async (req, res) => {
    const before = await prisma.assembly.findUnique({ where: { id: req.params.id }, include: { components: true } });
    if (!before) throw notFound("Assembly not found");
    const body = updateSchema.parse(req.body);

    const assembly = await prisma.assembly.update({ where: { id: req.params.id }, data: body });

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "Assembly",
      entityId: assembly.id,
      before,
      after: assembly,
      ipAddress: req.ip ?? null,
    });

    res.json(assembly);
  })
);

const componentSchema = z.object({ status: z.enum(["PENDING", "COMPLETE", "MISSING"]) });

router.patch(
  "/components/:id",
  requireRole("SUPER_ADMIN", "MANAGER", "PRODUCTION"),
  asyncHandler(async (req, res) => {
    const before = await prisma.assemblyComponent.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound("Component not found");
    const { status } = componentSchema.parse(req.body);
    const component = await prisma.assemblyComponent.update({ where: { id: req.params.id }, data: { status } });

    // All components in — flip the Assembly (and order) to Assembled.
    const siblings = await prisma.assemblyComponent.findMany({ where: { assemblyId: before.assemblyId } });
    if (siblings.every((c) => c.id === component.id ? status === "COMPLETE" : c.status === "COMPLETE")) {
      const assembly = await prisma.assembly.update({
        where: { id: before.assemblyId },
        data: { status: "ASSEMBLED", completedAt: new Date() },
      });
      await prisma.order.update({ where: { id: assembly.orderId }, data: { status: "QC" } });
    }

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "AssemblyComponent",
      entityId: component.id,
      before,
      after: component,
      ipAddress: req.ip ?? null,
    });

    res.json(component);
  })
);

export default router;
