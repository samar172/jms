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
  quantity: z.number().positive(),
  pieces: z.number().int().positive().optional(),
  rateBasis: z.enum(["PER_CARAT", "PER_PIECE"]).optional(),
  rate: z.number().nonnegative().optional(),
});

// Polki/Coloured Stone lines are normally priced per carat (rate x quantity,
// the weight). A karigar sometimes quotes a flat rate per piece instead —
// when rateBasis is PER_PIECE, price off the piece count instead of weight.
function resolveLineAmount(line: z.infer<typeof lineInputSchema>, rate: number): number {
  if (line.rateBasis === "PER_PIECE" && line.pieces) {
    return lineAmount(line.pieces, rate);
  }
  return lineAmount(line.quantity, rate);
}

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
  customerId: z.string().optional(),
  karigarId: z.string().optional(),
  type: z.enum(["ROUGH_ESTIMATE", "FINAL_COSTING"]),
  estimateDate: z.coerce.date().default(() => new Date()),
  profitPct: z.number().min(0),
  gstPct: z.number().min(0).max(100).optional(),
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
          pieces: line.pieces,
          rateBasis: line.rateBasis,
          rate,
          amount: resolveLineAmount(line, rate),
          sourceType: "MANUAL" as const,
        };
      })
    );

    const estimate = await prisma.estimate.create({
      data: {
        productId: body.productId,
        karigarId: body.karigarId,
        customerId: body.customerId,
        type: body.type,
        version,
        estimateDate: body.estimateDate,
        goldRateSnapshot24k: goldRate24k, // FR-7.08: rate is frozen from this point on (BR-03)
        profitPct: body.profitPct,
        ...(body.gstPct !== undefined ? { gstPct: body.gstPct } : {}),
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
    const search = z.string().optional().parse(req.query.search);
    res.json(
      await prisma.estimate.findMany({
        where: {
          ...(status ? { status } : {}),
          ...(search
            ? {
                OR: [
                  { product: { serialNo: { contains: search, mode: "insensitive" as const } } },
                  { product: { designName: { contains: search, mode: "insensitive" as const } } },
                  { customer: { name: { contains: search, mode: "insensitive" as const } } },
                ],
              }
            : {}),
        },
        include: { product: true, customer: true, karigar: true },
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
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        product: true,
        customer: true,
        karigar: true,
      },
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
  karigarId: z.string().nullable().optional(),
  customerId: z.string().optional(),
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

// --- Cancel a Draft estimate (FR-7.x) ----------------------------------------
// Deletes it outright rather than soft-cancelling, so the next estimate
// created for this product+type reuses the freed version number instead of
// leaving a gap. Only a Draft can be cancelled — anything Submitted/Approved
// has downstream state (ledger entries, audit history) that must be revised
// via a new version instead.
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const estimate = await prisma.estimate.findUnique({ where: { id: req.params.id } });
    if (!estimate) throw notFound("Estimate not found");
    assertEditable(estimate.status);

    await prisma.$transaction([
      prisma.estimateLine.deleteMany({ where: { estimateId: estimate.id } }),
      prisma.estimate.delete({ where: { id: estimate.id } }),
    ]);

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "DELETE",
      entityType: "Estimate",
      entityId: estimate.id,
      before: estimate,
      ipAddress: req.ip ?? null,
    });

    res.status(204).end();
  })
);

const lineUpdateSchema = z.object({
  description: z.string().optional(),
  quantity: z.number().positive().optional(),
  pieces: z.number().int().positive().optional(),
  rate: z.number().nonnegative().optional(),
});

router.patch(
  "/lines/:lineId",
  asyncHandler(async (req, res) => {
    const line = await prisma.estimateLine.findUnique({ where: { id: req.params.lineId } });
    if (!line) throw notFound("Line not found");
    const estimate = await prisma.estimate.findUniqueOrThrow({ where: { id: line.estimateId } });
    assertEditable(estimate.status);

    const body = lineUpdateSchema.parse(req.body);
    const quantity = body.quantity ?? Number(line.quantity);
    const rate = body.rate ?? Number(line.rate);
    const pieces = body.pieces ?? line.pieces ?? undefined;
    const amount =
      line.rateBasis === "PER_PIECE" && pieces ? lineAmount(pieces, rate) : lineAmount(quantity, rate);

    await prisma.estimateLine.update({
      where: { id: line.id },
      data: {
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.quantity !== undefined ? { quantity: body.quantity } : {}),
        ...(body.pieces !== undefined ? { pieces: body.pieces } : {}),
        ...(body.rate !== undefined ? { rate: body.rate } : {}),
        amount,
      },
    });

    const withTotals = await recalculateEstimateTotals(estimate.id);
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
        pieces: line.pieces,
        rateBasis: line.rateBasis,
        rate,
        amount: resolveLineAmount(line, rate),
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

// --- Refresh gold rate on a Draft estimate (Section 16: production costing
// left open for a few days shouldn't be stuck at a stale gold rate). Only
// GOLD-head lines are re-priced at today's rate via their stored purity;
// negotiated Polki/stone/making/other rates are left untouched. The source
// Rough Estimate this was converted from is never touched, so it stays
// historically accurate. ------------------------------------------------------
router.post(
  "/:id/refresh-gold-rate",
  asyncHandler(async (req, res) => {
    const estimate = await prisma.estimate.findUnique({
      where: { id: req.params.id },
      include: { lines: true },
    });
    if (!estimate) throw notFound("Estimate not found");
    assertEditable(estimate.status);

    const goldRateRow = await prisma.goldRate.findFirst({
      where: { effectiveFrom: { lte: new Date() } },
      orderBy: { effectiveFrom: "desc" },
    });
    if (!goldRateRow) throw badRequest("No gold rate configured on or before today");
    const goldRate24k = Number(goldRateRow.ratePerGram24k);

    const goldLines = estimate.lines.filter((l) => l.head === "GOLD" && l.purityId);
    const purityIds = [...new Set(goldLines.map((l) => l.purityId!))];
    const purities = purityIds.length
      ? await prisma.karat.findMany({ where: { id: { in: purityIds } } })
      : [];
    const purityFactorById = new Map(purities.map((p) => [p.id, Number(p.purityFactor)]));

    await Promise.all(
      goldLines.map((l) => {
        const purityFactor = purityFactorById.get(l.purityId!);
        if (purityFactor === undefined) return Promise.resolve();
        const rate = derivedGoldRate(goldRate24k, purityFactor);
        return prisma.estimateLine.update({
          where: { id: l.id },
          data: { rate, amount: lineAmount(Number(l.quantity), rate) },
        });
      })
    );

    await prisma.estimate.update({
      where: { id: estimate.id },
      data: { goldRateSnapshot24k: goldRate24k },
    });

    const withTotals = await recalculateEstimateTotals(estimate.id);

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "Estimate",
      entityId: estimate.id,
      before: estimate,
      after: withTotals,
      ipAddress: req.ip ?? null,
    });

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
    if (estimate.type === "FINAL_COSTING" && estimate.customerId) {
      await prisma.customerLedgerEntry.create({
        data: {
          customerId: estimate.customerId,
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

// --- Super Admin amend (post-approval correction) ----------------------------
// BR-08 keeps an Approved estimate immutable to everyone else, but a Super
// Admin can still need to fix a genuine mistake after the fact. Rather than
// silently reopening it (which would desync the customer ledger from the
// estimate's netAmount), reverse the original invoice with a matching
// negative CustomerLedgerEntry, then drop the estimate back to Draft — the
// normal edit + /approve flow posts a fresh, correct entry when it's
// re-approved. Both entries stay on the ledger permanently (BR-13).
router.post(
  "/:id/amend",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const estimate = await prisma.estimate.findUnique({
      where: { id: req.params.id },
      include: { product: true },
    });
    if (!estimate) throw notFound("Estimate not found");
    if (estimate.status !== "APPROVED") {
      throw badRequest("Only an approved estimate needs amending — a Draft or Submitted one is already editable.");
    }

    if (estimate.type === "FINAL_COSTING" && estimate.customerId) {
      await prisma.customerLedgerEntry.create({
        data: {
          customerId: estimate.customerId,
          type: "ADJUSTMENT",
          amount: -Number(estimate.netAmount),
          referenceType: "Estimate",
          referenceId: estimate.id,
          note: `Reversal — amending final costing for ${estimate.product.serialNo}`,
          createdById: req.user!.id,
        },
      });
    }

    const amended = await prisma.estimate.update({
      where: { id: req.params.id },
      data: { status: "DRAFT" },
    });

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "Estimate",
      entityId: amended.id,
      before: estimate,
      after: amended,
      ipAddress: req.ip ?? null,
    });

    res.json(amended);
  })
);

// --- Admin unlock (FR-7.13) ---------------------------------------------------
// A Submitted estimate is read-only to normal users, but an admin may need to
// send it back for corrections before it's approved. Approved estimates are
// deliberately excluded — BR-08 makes those permanently immutable because an
// approval already posts a CustomerLedgerEntry (invoice) against their
// netAmount; silently reopening one would desync the two. Revise via a new
// version (or /convert-to-final-costing) instead.
router.post(
  "/:id/unlock",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const estimate = await prisma.estimate.findUnique({ where: { id: req.params.id } });
    if (!estimate) throw notFound("Estimate not found");
    if (estimate.status === "APPROVED") {
      throw badRequest("An approved estimate can never be unlocked — it has already been billed to the customer. Create a new version instead.");
    }
    if (estimate.status === "DRAFT") throw badRequest("Estimate is already editable");

    const unlocked = await prisma.estimate.update({
      where: { id: req.params.id },
      data: { status: "DRAFT" },
    });

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "Estimate",
      entityId: unlocked.id,
      before: estimate,
      after: unlocked,
      ipAddress: req.ip ?? null,
    });

    res.json(unlocked);
  })
);

// --- Convert to Final Costing (FR-7.14) --------------------------------------
// One-click way to start a Final Costing pre-filled from an existing (usually
// approved) Rough Estimate's lines, instead of manually re-entering everything
// on /costing/new. Always creates a new estimate — never mutates the source.
router.post(
  "/:id/convert-to-final-costing",
  asyncHandler(async (req, res) => {
    const source = await prisma.estimate.findUnique({
      where: { id: req.params.id },
      include: { lines: true },
    });
    if (!source) throw notFound("Estimate not found");
    if (source.type === "FINAL_COSTING") throw badRequest("This estimate is already a Final Costing");

    const estimateDate = new Date();
    const goldRateRow = await prisma.goldRate.findFirst({
      where: { effectiveFrom: { lte: estimateDate } },
      orderBy: { effectiveFrom: "desc" },
    });
    if (!goldRateRow) throw badRequest("No gold rate configured on or before today");
    const goldRate24k = Number(goldRateRow.ratePerGram24k);

    const priorCount = await prisma.estimate.count({
      where: { productId: source.productId, type: "FINAL_COSTING" },
    });

    // Gold lines are repriced at today's rate (that's the point of converting
    // a rough estimate days/weeks later); other heads keep their original
    // negotiated rate rather than being silently overwritten.
    const purityIds = [...new Set(source.lines.map((l) => l.purityId).filter((id): id is string => !!id))];
    const purities = purityIds.length
      ? await prisma.karat.findMany({ where: { id: { in: purityIds } } })
      : [];
    const purityFactorById = new Map(purities.map((p) => [p.id, Number(p.purityFactor)]));

    const linesData = source.lines.map((l) => {
      const purityFactor = l.purityId ? purityFactorById.get(l.purityId) : undefined;
      const rate =
        l.head === "GOLD" && purityFactor !== undefined ? derivedGoldRate(goldRate24k, purityFactor) : Number(l.rate);
      return {
        head: l.head,
        description: l.description,
        purityId: l.purityId,
        stoneTypeId: l.stoneTypeId,
        chargeTypeId: l.chargeTypeId,
        karigarName: l.karigarName,
        quantity: l.quantity,
        rate,
        amount: lineAmount(Number(l.quantity), rate),
        sourceType: "MANUAL" as const,
      };
    });

    const estimate = await prisma.estimate.create({
      data: {
        productId: source.productId,
        customerId: source.customerId,
        type: "FINAL_COSTING",
        version: priorCount + 1,
        estimateDate,
        goldRateSnapshot24k: goldRate24k,
        profitPct: source.profitPct,
        gstPct: source.gstPct,
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
  "/:id/pdf",
  asyncHandler(async (req, res) => {
    const estimate = await prisma.estimate.findUnique({
      where: { id: req.params.id },
      include: {
        product: true,
        customer: true,
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
        product: true,
        customer: true,
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
