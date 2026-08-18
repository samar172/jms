import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";
import { badRequest, notFound } from "../../utils/httpError";
import { nextVoucherNumber } from "../../services/voucherNumber";

const router = Router();

// --- WIP board / list (FR-3.05) ---------------------------------------------
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const status = z.enum(["OPEN", "ON_HOLD", "CLOSED"]).optional().parse(req.query.status);
    const productId = z.string().optional().parse(req.query.productId);
    const estimateId = z.string().optional().parse(req.query.estimateId);
    const jobCards = await prisma.jobCard.findMany({
      where: {
        ...(status ? { status } : { status: { not: "CLOSED" } }),
        ...(productId ? { productId } : {}),
        ...(estimateId ? { estimateId } : {}),
      },
      include: {
        product: { include: { images: { where: { isPrimary: true }, take: 1 } } },
        customer: true,
        estimate: true,
        stages: { include: { processStage: true, karigar: true }, orderBy: { sequenceOrder: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(jobCards);
  })
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const jobCard = await prisma.jobCard.findUnique({
      where: { id: req.params.id },
      include: {
        product: { include: { purity: true } },
        customer: true,
        estimate: true,
        stages: {
          include: {
            processStage: true,
            karigar: true,
            materialIssues: { where: { isReversed: false }, include: { purity: true, stoneType: true } },
            materialReceipts: { where: { isReversed: false } },
            labourEntries: true,
            wastageRecord: true,
          },
          orderBy: { sequenceOrder: "asc" },
        },
      },
    });
    if (!jobCard) throw notFound("Job card not found");
    res.json(jobCard);
  })
);

// --- Create (FR-3.01, FR-3.02) -----------------------------------------------
// A job card is created directly against an Item Master design (the product) —
// there is no customer/estimate/order in the costing flow (spec §2.4). The same
// design can have many job cards (repeat batches). If no processStageIds are
// supplied, all active process stages (the fixed production route) are used in
// sequence order.
const createSchema = z.object({
  productId: z.string().min(1),
  targetDeliveryDate: z.coerce.date().optional(),
  processStageIds: z.array(z.string().min(1)).min(1).optional(),
});

router.post(
  "/",
  requireRole("SUPER_ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const product = await prisma.product.findUnique({ where: { id: body.productId } });
    if (!product) throw badRequest("Unknown product");

    // Default to the full production route (all active stages, in order) when
    // the caller doesn't specify a subset.
    let stageIds = body.processStageIds;
    if (!stageIds || stageIds.length === 0) {
      const stages = await prisma.processStage.findMany({
        where: { isActive: true },
        orderBy: { sequenceOrder: "asc" },
        select: { id: true },
      });
      stageIds = stages.map((s) => s.id);
    }
    if (stageIds.length === 0) throw badRequest("No process stages configured");

    const jobCard = await prisma.jobCard.create({
      data: {
        jobNo: await nextVoucherNumber("JOB"),
        productId: body.productId,
        targetDeliveryDate: body.targetDeliveryDate,
        createdById: req.user!.id,
        stages: {
          create: stageIds.map((processStageId, index) => ({
            processStageId,
            sequenceOrder: index,
          })),
        },
      },
      include: { stages: true },
    });

    await prisma.product.update({
      where: { id: body.productId },
      data: { status: "IN_PRODUCTION" },
    });

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "JobCard",
      entityId: jobCard.id,
      after: jobCard,
      ipAddress: req.ip ?? null,
    });

    res.status(201).json(jobCard);
  })
);

// --- Hold / resume (FR-3.08) -------------------------------------------------
const holdSchema = z.object({ holdReason: z.string().min(1) });

router.post(
  "/:id/hold",
  requireRole("SUPER_ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const { holdReason } = holdSchema.parse(req.body);
    const jobCard = await prisma.jobCard.update({
      where: { id: req.params.id },
      data: { status: "ON_HOLD", holdReason },
    });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "JobCard",
      entityId: jobCard.id,
      after: jobCard,
      ipAddress: req.ip ?? null,
    });
    res.json(jobCard);
  })
);

router.post(
  "/:id/resume",
  requireRole("SUPER_ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const jobCard = await prisma.jobCard.update({
      where: { id: req.params.id },
      data: { status: "OPEN", holdReason: null },
    });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "JobCard",
      entityId: jobCard.id,
      after: jobCard,
      ipAddress: req.ip ?? null,
    });
    res.json(jobCard);
  })
);

// --- Close (FR-3.07: blocked until fully reconciled/approved) ---------------
router.post(
  "/:id/close",
  requireRole("SUPER_ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const jobCard = await prisma.jobCard.findUnique({
      where: { id: req.params.id },
      include: { stages: { include: { wastageRecord: true, labourEntries: true } } },
    });
    if (!jobCard) throw notFound("Job card not found");

    const blockers: string[] = [];
    for (const stage of jobCard.stages) {
      if (stage.status !== "APPROVED" && stage.status !== "PENDING") {
        blockers.push(`Stage not approved`);
      }
      if (
        stage.wastageRecord &&
        stage.wastageRecord.exceptionStatus === "PENDING"
      ) {
        blockers.push(`Unresolved wastage exception on a stage`);
      }
      const unapprovedLabour = stage.labourEntries.some((l) => l.status !== "APPROVED");
      if (unapprovedLabour) {
        blockers.push(`Unapproved labour entry on a stage`);
      }
    }
    if (blockers.length > 0) {
      throw badRequest("Job card cannot be closed", { blockers: [...new Set(blockers)] });
    }

    const closed = await prisma.jobCard.update({
      where: { id: req.params.id },
      data: { status: "CLOSED", closedAt: new Date() },
    });
    await prisma.product.update({
      where: { id: jobCard.productId },
      data: { status: "FINISHED" },
    });

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "APPROVE",
      entityType: "JobCard",
      entityId: closed.id,
      after: closed,
      ipAddress: req.ip ?? null,
    });

    res.json(closed);
  })
);

// --- Stage assignment / status (FR-3.02, FR-3.03) ---------------------------
const stageUpdateSchema = z.object({
  karigarId: z.string().optional(),
  status: z.enum(["PENDING", "ISSUED", "IN_PROGRESS", "RECEIVED", "APPROVED", "REWORK"]).optional(),
  expectedCompletionAt: z.coerce.date().optional(),
});

router.patch(
  "/stages/:stageId",
  requireRole("SUPER_ADMIN", "MANAGER", "PRODUCTION"),
  asyncHandler(async (req, res) => {
    const before = await prisma.jobStage.findUnique({ where: { id: req.params.stageId } });
    if (!before) throw notFound("Job stage not found");

    const body = stageUpdateSchema.parse(req.body);

    if (body.status === "APPROVED") {
      const wastage = await prisma.wastageRecord.findUnique({
        where: { jobStageId: before.id },
      });
      if (wastage && wastage.exceptionStatus === "PENDING") {
        throw badRequest(
          "Blocked until wastage exception is approved (BR-10, AC-06)"
        );
      }
    }

    const stage = await prisma.jobStage.update({
      where: { id: req.params.stageId },
      data: {
        ...body,
        assignedAt: body.karigarId ? new Date() : undefined,
      },
    });

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "JobStage",
      entityId: stage.id,
      before,
      after: stage,
      ipAddress: req.ip ?? null,
    });

    res.json(stage);
  })
);

// --- Pull Labour (Incremental, per-stage) (FR-6.07) -------------------------
router.post(
  "/stages/:stageId/pull-labour",
  requireRole("SUPER_ADMIN", "MANAGER", "PRODUCTION"),
  asyncHandler(async (req, res) => {
    const stage = await prisma.jobStage.findUnique({
      where: { id: req.params.stageId },
      include: { 
        jobCard: { include: { estimate: true } }, 
        processStage: { include: { labourRule: true } }
      }
    });
    if (!stage) throw notFound("Job stage not found");
    if (!stage.karigarId) throw badRequest("No karigar assigned to this stage");

    // Idempotency: Prevent double pull for the same job+stage+karigar
    const existing = await prisma.labourEntry.findFirst({
      where: { jobStageId: stage.id, karigarId: stage.karigarId, status: "PULLED" }
    });
    if (existing) {
      throw badRequest("Labour already pulled for this karigar on this stage.");
    }

    const rule = stage.processStage.labourRule;
    if (!rule) {
      throw badRequest("No Labour Rule configured for this stage. Please add a manual entry instead.");
    }

    const goldValue = stage.jobCard.estimate ? Number(stage.jobCard.estimate.materialCost) : 0;
    const baseAmount = goldValue; // Tweak base if needed

    const pct = Number(rule.pct);
    const amount = (baseAmount * pct) / 100;

    const entry = await prisma.labourEntry.create({
      data: {
        jobStageId: stage.id,
        karigarId: stage.karigarId,
        rateBasis: rule.calcBase.includes("MAKING") ? "PERCENT_GOLD_MAKING" : (rule.calcBase.includes("STONE") ? "PERCENT_GOLD_STONE" : "LUMPSUM"),
        quantity: baseAmount,
        rate: pct,
        amount: amount,
        status: "PULLED",
        enteredById: req.user!.id,
      }
    });

    res.json(entry);
  })
);

// --- Rework loop (FR-3.04) ---------------------------------------------------
router.post(
  "/stages/:stageId/rework",
  requireRole("SUPER_ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const original = await prisma.jobStage.findUnique({ where: { id: req.params.stageId } });
    if (!original) throw notFound("Job stage not found");

    const karigarId = z.object({ karigarId: z.string().optional() }).parse(req.body).karigarId;

    const reworkStage = await prisma.jobStage.create({
      data: {
        jobCardId: original.jobCardId,
        processStageId: original.processStageId,
        karigarId: karigarId ?? original.karigarId,
        sequenceOrder: original.sequenceOrder,
        isRework: true,
        reworkOfStageId: original.id,
      },
    });

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "JobStage",
      entityId: reworkStage.id,
      after: reworkStage,
      ipAddress: req.ip ?? null,
    });

    res.status(201).json(reworkStage);
  })
);

export default router;

