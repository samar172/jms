import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";
import { badRequest, forbidden, notFound } from "../../utils/httpError";
import { lineAmount, round2 } from "@jms/shared";
import { recalculateEstimateTotals, derivedGoldRate } from "./estimates.service";
import { generateEstimatePdf } from "./pdf.service";
import { generateEstimateExcel } from "./excel.service";

const router = Router();

// Costing/estimate data is not exposed to Store, Production, Sales or Karigar
// roles at all per the Section 6.3 matrix (BR-16) — gate the whole module.
router.use(requireRole("SUPER_ADMIN", "MANAGER", "COSTING", "AUDITOR"));

const lineInputSchema = z.object({
  head: z.enum(["GOLD", "POLKI", "COLOURED_STONE", "MAKING", "OTHER", "WASTAGE"]),
  description: z.string().optional(),
  purityId: z.string().optional(),
  stoneTypeId: z.string().optional(),
  chargeTypeId: z.string().optional(),
  karigarName: z.string().optional(),
  quantity: z.number(),
  rate: z.number().nonnegative().optional(),
});

async function resolveLineRate(
  line: z.infer<typeof lineInputSchema>,
  goldRate24k: number
): Promise<number> {
  if (line.rate !== undefined) return line.rate;

  if (line.head === "GOLD" && line.purityId) {
    const purity = await prisma.karat.findUnique({ where: { id: line.purityId } });
    if (!purity) throw badRequest("Unknown purity on gold line");
    return derivedGoldRate(goldRate24k, Number(purity.purityFactor));
  }
  if ((line.head === "POLKI" || line.head === "COLOURED_STONE") && line.stoneTypeId) {
    const stoneType = await prisma.stoneType.findUnique({ where: { id: line.stoneTypeId } });
    if (stoneType?.defaultRatePerCarat) return Number(stoneType.defaultRatePerCarat);
  }
  throw badRequest(`Rate is required for a ${line.head} line and could not be auto-derived`);
}

const createSchema = z.object({
  productId: z.string().min(1),
  type: z.enum(["ROUGH_ESTIMATE", "FINAL_COSTING"]),
  estimateDate: z.coerce.date().default(() => new Date()),
  profitPct: z.number().min(0),
  lines: z.array(lineInputSchema).default([]),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);

    const goldRateRow = await prisma.goldRate.findFirst({
      where: { effectiveFrom: { lte: body.estimateDate } },
      orderBy: { effectiveFrom: "desc" },
    });
    if (!goldRateRow) throw badRequest("No gold rate configured on or before the estimate date");
    const goldRate24k = Number(goldRateRow.ratePerGram24k);

    const priorCount = await prisma.estimate.count({
      where: { productId: body.productId, type: body.type },
    });
    const version = priorCount + 1;

    const linesData = await Promise.all(
      body.lines.map(async (line) => {
        const rate = await resolveLineRate(line, goldRate24k);
        return {
          head: line.head,
          description: line.description,
          purityId: line.purityId,
          stoneTypeId: line.stoneTypeId,
          chargeTypeId: line.chargeTypeId,
          karigarName: line.karigarName,
          quantity: line.quantity,
          rate,
          amount: lineAmount(line.quantity, rate),
          sourceType: "MANUAL" as const,
        };
      })
    );

    const estimate = await prisma.estimate.create({
      data: {
        productId: body.productId,
        type: body.type,
        version,
        estimateDate: body.estimateDate,
        goldRateSnapshot24k: goldRate24k, // FR-7.08: rate is frozen from this point on (BR-03)
        profitPct: body.profitPct,
        createdById: req.user!.id,
        lines: { create: linesData },
      },
    });

    const withTotals = await recalculateEstimateTotals(estimate.id);

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "Estimate",
      entityId: estimate.id,
      after: withTotals,
      ipAddress: req.ip ?? null,
    });

    res.status(201).json(withTotals);
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const status = z
      .enum(["DRAFT", "SUBMITTED", "APPROVED", "SUPERSEDED"])
      .optional()
      .parse(req.query.status);
    res.json(
      await prisma.estimate.findMany({
        where: status ? { status } : undefined,
        include: { product: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    );
  })
);

router.get(
  "/product/:productId",
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.estimate.findMany({
        where: { productId: req.params.productId },
        orderBy: [{ type: "asc" }, { version: "desc" }],
        include: { lines: true },
      })
    );
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const estimate = await prisma.estimate.findUnique({
      where: { id: req.params.id },
      include: { lines: { orderBy: { sortOrder: "asc" } }, product: true },
    });
    if (!estimate) throw notFound("Estimate not found");
    res.json(estimate);
  })
);

function assertEditable(status: string) {
  // BR-08: an Approved estimate can never be edited; revise via a new version.
  if (status !== "DRAFT") {
    throw badRequest("Only a Draft estimate can be edited. Create a new version instead.");
  }
}

const updateSchema = z.object({
  profitPct: z.number().min(0).optional(),
  showBreakdownOnPdf: z.boolean().optional(),
  gstPct: z.number().min(0).max(100).optional(),
});

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const before = await prisma.estimate.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound("Estimate not found");
    assertEditable(before.status);

    const body = updateSchema.parse(req.body);
    await prisma.estimate.update({ where: { id: req.params.id }, data: body });
    const withTotals = await recalculateEstimateTotals(req.params.id);

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "Estimate",
      entityId: req.params.id,
      before,
      after: withTotals,
      ipAddress: req.ip ?? null,
    });

    res.json(withTotals);
  })
);

router.post(
  "/:id/lines",
  asyncHandler(async (req, res) => {
    const estimate = await prisma.estimate.findUnique({ where: { id: req.params.id } });
    if (!estimate) throw notFound("Estimate not found");
    assertEditable(estimate.status);

    const line = lineInputSchema.parse(req.body);
    const rate = await resolveLineRate(line, Number(estimate.goldRateSnapshot24k));

    await prisma.estimateLine.create({
      data: {
        estimateId: estimate.id,
        head: line.head,
        description: line.description,
        purityId: line.purityId,
        stoneTypeId: line.stoneTypeId,
        chargeTypeId: line.chargeTypeId,
        karigarName: line.karigarName,
        quantity: line.quantity,
        rate,
        amount: lineAmount(line.quantity, rate),
      },
    });

    const withTotals = await recalculateEstimateTotals(estimate.id);
    res.status(201).json(withTotals);
  })
);

router.delete(
  "/lines/:lineId",
  asyncHandler(async (req, res) => {
    const line = await prisma.estimateLine.findUnique({ where: { id: req.params.lineId } });
    if (!line) throw notFound("Line not found");
    const estimate = await prisma.estimate.findUniqueOrThrow({ where: { id: line.estimateId } });
    assertEditable(estimate.status);

    await prisma.estimateLine.delete({ where: { id: req.params.lineId } });
    const withTotals = await recalculateEstimateTotals(estimate.id);
    res.json(withTotals);
  })
);

// --- Auto-populate Making Charges from approved labour (FR-6.07, FR-7.09) ---
router.post(
  "/:id/pull-labour",
  asyncHandler(async (req, res) => {
    const estimate = await prisma.estimate.findUnique({
      where: { id: req.params.id },
      include: { lines: true, product: { include: { jobCards: { include: { stages: true } } } } },
    });
    if (!estimate) throw notFound("Estimate not found");
    assertEditable(estimate.status);

    const stageIds = estimate.product.jobCards.flatMap((jc) => jc.stages.map((s) => s.id));
    const alreadyPulled = new Set(
      estimate.lines.filter((l) => l.sourceLabourEntryId).map((l) => l.sourceLabourEntryId)
    );

    const labourEntries = await prisma.labourEntry.findMany({
      where: { jobStageId: { in: stageIds }, status: "APPROVED" },
      include: { karigar: true, jobStage: { include: { processStage: true } } },
    });

    const newLines = labourEntries.filter((e) => !alreadyPulled.has(e.id));
    if (newLines.length === 0) return res.json(await recalculateEstimateTotals(estimate.id));

    await prisma.estimateLine.createMany({
      data: newLines.map((e) => ({
        estimateId: estimate.id,
        head: "MAKING" as const,
        description: `${e.jobStage.processStage.name} — from job card`,
        karigarName: e.karigar.name,
        quantity: e.quantity,
        rate: e.rate,
        amount: e.amount,
        sourceType: "FROM_LABOUR" as const,
        sourceLabourEntryId: e.id,
      })),
    });

    const withTotals = await recalculateEstimateTotals(estimate.id);
    res.json(withTotals);
  })
);

// --- Pull wastage cost from recorded wastage on the job (FR-8.7.1) ----------
router.post(
  "/:id/pull-wastage",
  asyncHandler(async (req, res) => {
    const estimate = await prisma.estimate.findUnique({
      where: { id: req.params.id },
      include: { product: { include: { jobCards: { include: { stages: { include: { wastageRecord: true } } } } } } },
    });
    if (!estimate) throw notFound("Estimate not found");
    assertEditable(estimate.status);

    const wastageRecords = estimate.product.jobCards
      .flatMap((jc) => jc.stages)
      .map((s) => s.wastageRecord)
      .filter((w): w is NonNullable<typeof w> => w !== null && w.withinTolerance);

    const totalWastageG = wastageRecords.reduce((sum, w) => sum + Number(w.netWastageG), 0);
    if (totalWastageG <= 0) return res.json(await recalculateEstimateTotals(estimate.id));

    const rate = Number(estimate.goldRateSnapshot24k);
    const amount = round2(totalWastageG * rate);

    await prisma.estimateLine.deleteMany({ where: { estimateId: estimate.id, head: "WASTAGE" } });
    await prisma.estimateLine.create({
      data: {
        estimateId: estimate.id,
        head: "WASTAGE",
        description: "Wastage within tolerance, absorbed into cost",
        quantity: totalWastageG,
        rate,
        amount,
        sourceType: "FROM_WASTAGE",
      },
    });

    const withTotals = await recalculateEstimateTotals(estimate.id);
    res.json(withTotals);
  })
);

router.post(
  "/:id/submit",
  asyncHandler(async (req, res) => {
    const estimate = await prisma.estimate.findUnique({ where: { id: req.params.id } });
    if (!estimate) throw notFound("Estimate not found");
    assertEditable(estimate.status);
    const updated = await prisma.estimate.update({
      where: { id: req.params.id },
      data: { status: "SUBMITTED" },
    });
    res.json(updated);
  })
);

// --- Approval & locking (BR-08, FR-7.12) -------------------------------------
router.post(
  "/:id/approve",
  requireRole("SUPER_ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const estimate = await prisma.estimate.findUnique({
      where: { id: req.params.id },
      include: { product: true },
    });
    if (!estimate) throw notFound("Estimate not found");
    if (estimate.status === "APPROVED") throw badRequest("Estimate is already approved");

    await prisma.estimate.updateMany({
      where: {
        productId: estimate.productId,
        type: estimate.type,
        status: "APPROVED",
        id: { not: estimate.id },
      },
      data: { status: "SUPERSEDED" },
    });

    const approved = await prisma.estimate.update({
      where: { id: req.params.id },
      data: { status: "APPROVED", approvedById: req.user!.id, approvedAt: new Date() },
    });

    await prisma.product.update({
      where: { id: estimate.productId },
      data: { status: estimate.type === "ROUGH_ESTIMATE" ? "ESTIMATED" : undefined },
    });

    // Mirror the approved Final Costing onto the customer's ledger as what
    // they now owe for this piece. Rough Estimates are quotations, not a
    // billable event, so only Final Costing posts here.
    if (estimate.type === "FINAL_COSTING" && estimate.product.customerId) {
      await prisma.customerLedgerEntry.create({
        data: {
          customerId: estimate.product.customerId,
          type: "INVOICE_RAISED",
          amount: approved.netAmount,
          referenceType: "Estimate",
          referenceId: approved.id,
          note: `Final costing — ${estimate.product.serialNo}`,
          createdById: req.user!.id,
        },
      });
    }

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "APPROVE",
      entityType: "Estimate",
      entityId: approved.id,
      after: approved,
      ipAddress: req.ip ?? null,
    });

    res.json(approved);
  })
);

router.get(
  "/:id/pdf",
  asyncHandler(async (req, res) => {
    const estimate = await prisma.estimate.findUnique({
      where: { id: req.params.id },
      include: { 
        product: { include: { customer: true } },
        lines: { include: { purity: true, stoneType: true }, orderBy: { sortOrder: "asc" } }
      },
    });
    if (!estimate) throw notFound("Estimate not found");

    const pdfBuffer = await generateEstimatePdf(estimate);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Estimate-${estimate.product.serialNo}.pdf`);
    res.send(pdfBuffer);
  })
);

router.get(
  "/:id/excel",
  asyncHandler(async (req, res) => {
    const estimate = await prisma.estimate.findUnique({
      where: { id: req.params.id },
      include: { 
        product: { include: { customer: true } },
        lines: { include: { purity: true, stoneType: true }, orderBy: { sortOrder: "asc" } }
      },
    });
    if (!estimate) throw notFound("Estimate not found");

    const excelBuffer = await generateEstimateExcel(estimate);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=Estimate-${estimate.product.serialNo}.xlsx`);
    res.send(excelBuffer);
  })
);

export default router;
