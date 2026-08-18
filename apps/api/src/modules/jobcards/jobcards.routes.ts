import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";
import { badRequest, notFound } from "../../utils/httpError";
import { nextVoucherNumber } from "../../services/voucherNumber";
import { recalculateEstimateTotals } from "../estimates/estimates.service";

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
const createSchema = z.object({
  productId: z.string().min(1),
  estimateId: z.string().min(1),
  customerId: z.string().optional(),
  targetDeliveryDate: z.coerce.date().optional(),
  processStageIds: z.array(z.string().min(1)).min(1),
});

router.post(
  "/",
  requireRole("SUPER_ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const product = await prisma.product.findUnique({ where: { id: body.productId } });
    if (!product) throw badRequest("Unknown product");
    const estimate = await prisma.estimate.findUnique({ where: { id: body.estimateId } });
    if (!estimate) throw badRequest("Unknown estimate");

    // Production runs are scoped to the Estimate (the specific customer's
    // quotation/costing), not the Product (the reusable design) — the same
    // design can be in production for several customers at once, each with
    // their own job card, karigars and labour. Only block a duplicate job
    // card on the SAME estimate.
    const activeJobCard = await prisma.jobCard.findFirst({
      where: { estimateId: body.estimateId, status: { not: "CLOSED" } },
    });
    if (activeJobCard) {
      throw badRequest(`This estimate already has an active job card in production.`);
    }

    const jobCard = await prisma.jobCard.create({
      data: {
        jobNo: await nextVoucherNumber("JOB"),
        productId: body.productId,
        estimateId: body.estimateId,
        customerId: body.customerId,
        targetDeliveryDate: body.targetDeliveryDate,
        createdById: req.user!.id,
        stages: {
          create: body.processStageIds.map((processStageId, index) => ({
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

    if (jobCard.estimateId) {
      const roughEstimate = await prisma.estimate.findUnique({
        where: { id: jobCard.estimateId },
      });
      
      if (roughEstimate && roughEstimate.type === "ROUGH_ESTIMATE") {
        const allJobCardsWithStages = await prisma.jobCard.findMany({
          where: { estimateId: roughEstimate.id },
          include: { stages: { include: { labourEntries: true } } }
        });
        const allClosed = allJobCardsWithStages.every((jc) => jc.status === "CLOSED");
        
        if (allClosed) {
          const latestEstimate = await prisma.estimate.findFirst({
            where: { productId: roughEstimate.productId, type: "FINAL_COSTING", customerId: roughEstimate.customerId ?? null },
            orderBy: { version: "desc" },
            select: { version: true }
          });
          const version = (latestEstimate?.version ?? 0) + 1;
          const { nextVoucherNumber } = await import("../../services/voucherNumber");
          const estimateNo = await nextVoucherNumber("EST");
          
          const goldRateRow = await prisma.metalRate.findFirst({
            where: { effectiveFrom: { lte: new Date() } },
            orderBy: { effectiveFrom: "desc" },
          });
          const goldRate24k = goldRateRow ? Number(goldRateRow.ratePerGramPure) : Number(roughEstimate.goldRateSnapshot24k);

          let totalPulledLabour = 0;
          for (const jc of allJobCardsWithStages) {
            for (const stage of jc.stages) {
              for (const entry of stage.labourEntries) {
                if (entry.status === "PULLED" || entry.status === "APPROVED") {
                  totalPulledLabour += Number(entry.amount);
                }
              }
            }
          }

          const roughLines = await prisma.estimateLine.findMany({ where: { estimateId: roughEstimate.id } });
          let finalLinesData = roughLines.map(line => ({
            head: line.head,
            description: line.description,
            purityId: line.purityId,
            stoneTypeId: line.stoneTypeId,
            chargeTypeId: line.chargeTypeId,
            karigarName: line.karigarName,
            quantity: Number(line.quantity),
            pieces: line.pieces,
            rateBasis: line.rateBasis,
            rate: Number(line.rate),
            amount: Number(line.amount),
            sourceType: line.sourceType,
          }));

          if (totalPulledLabour > 0) {
            finalLinesData = finalLinesData.filter(l => l.head !== "MAKING");
            finalLinesData.push({
              head: "MAKING",
              description: "Actual Labour (Pulled from Job Cards)",
              purityId: null,
              stoneTypeId: null,
              chargeTypeId: null,
              karigarName: null,
              quantity: 1,
              pieces: null,
              rateBasis: null,
              rate: totalPulledLabour,
              amount: totalPulledLabour,
              sourceType: "FROM_LABOUR",
            });
          }

          const finalCosting = await prisma.estimate.create({
            data: {
              estimateNo,
              productId: roughEstimate.productId,
              customerId: roughEstimate.customerId,
              type: "FINAL_COSTING",
              version,
              estimateDate: new Date(),
              pieces: roughEstimate.pieces,
              grossWeightG: roughEstimate.grossWeightG,
              goldRateSnapshot24k: goldRate24k,
              profitPct: roughEstimate.profitPct,
              gstPct: roughEstimate.gstPct,
              createdById: req.user!.id,
              lines: { create: finalLinesData }
            }
          });
          
          await recalculateEstimateTotals(finalCosting.id);
          
          await prisma.jobCard.updateMany({
            where: { estimateId: roughEstimate.id },
            data: { estimateId: finalCosting.id }
          });
        }
      }
    }

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

// --- Record Dispatch (mockup flow: popup when moving to Dispatched) ----------
// Captures dispatch mode/tracking/date directly on the JobCard (1 job = 1 dispatch).
// This is the final stage action — after this, the job moves to Dispatch & Invoicing.
const dispatchSchema = z.object({
  dispatchMode: z.enum(["Insured Courier", "Hand Delivery", "Self Pickup", "Registered Post"]),
  dispatchTracking: z.string().optional(),
  dispatchDate: z.coerce.date(),
});

router.post(
  "/:id/record-dispatch",
  requireRole("SUPER_ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const jobCard = await prisma.jobCard.findUnique({
      where: { id: req.params.id },
      include: { stages: { include: { processStage: true }, orderBy: { sequenceOrder: "asc" } } },
    });
    if (!jobCard) throw notFound("Job card not found");
    if (jobCard.dispatchedAt) throw badRequest("Dispatch already recorded for this job card");

    const body = dispatchSchema.parse(req.body);

    const updated = await prisma.jobCard.update({
      where: { id: req.params.id },
      data: {
        dispatchMode: body.dispatchMode,
        dispatchTracking: body.dispatchTracking ?? null,
        dispatchDate: body.dispatchDate,
        dispatchedAt: new Date(),
      },
    });

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "JobCard",
      entityId: updated.id,
      before: jobCard,
      after: updated,
      ipAddress: req.ip ?? null,
    });

    res.json(updated);
  })
);

export default router;

