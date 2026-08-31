/**
 * Chowker silver-domain write flows — a faithful port of the mockup's App
 * state handlers (assign / issue / reconcile / cast|jadai|finding output /
 * stones / labour / approve / close / reopen / hold). Each endpoint mutates the
 * Prod* rows to match the mockup's nested-state mutation exactly.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { badRequest, notFound } from "../../utils/httpError";
import { computeLabourAmount, pureTierLabel, type PurityTier as EngineTier } from "@jms/shared";
import { mapTier, LABOUR_BASIS_ENUM } from "./mapper";

const router = Router();
const MANAGER = ["SUPER_ADMIN", "MANAGER", "PRODUCTION", "STORE"] as const;
const gm = (v: number) => `${v.toFixed(3)} g`;
const money = (v: number) => `₹ ${Math.round(v).toLocaleString("en-IN")}`;

async function tiers(): Promise<EngineTier[]> {
  const rows = await prisma.purityTier.findMany({ where: { isActive: true }, orderBy: { percent: "desc" } });
  return rows.map(mapTier);
}
async function baseRate(): Promise<number> {
  const row = await prisma.appSetting.findUnique({ where: { key: "chowker.baseRate" } });
  return Number(row?.value ?? "98");
}
async function purityIdFor(label: string | null | undefined): Promise<string | null> {
  if (!label) return null;
  const t = await prisma.purityTier.findFirst({ where: { code: label } });
  return t?.id ?? null;
}
async function logActivity(jobCardId: string, text: string) {
  await prisma.prodActivity.create({ data: { jobCardId, text } });
}
async function stageByName(jobNo: string, stageName: string) {
  const jc = await prisma.prodJobCard.findUnique({
    where: { jobNo },
    include: { stages: true },
  });
  if (!jc) throw notFound("Job card not found");
  const stage = jc.stages.find((s) => s.stageName === (stageName as never));
  if (!stage) throw badRequest("Unknown stage");
  return { jc, stage };
}

/* ------------------------- Assign karigar to a stage ---------------------- */
router.post(
  "/job-cards/:jobNo/assign",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const { stageName, karigarId } = z
      .object({ stageName: z.string(), karigarId: z.string().min(1) })
      .parse(req.body);
    const { jc, stage } = await stageByName(req.params.jobNo, stageName);
    const karigar = await prisma.karigar.findUnique({ where: { id: karigarId } });
    if (!karigar) throw badRequest("Unknown karigar");
    const assignment = await prisma.prodAssignment.create({ data: { stageId: stage.id, karigarId } });
    if (stage.status === "Pending") await prisma.prodStage.update({ where: { id: stage.id }, data: { status: "InProgress" } });
    if (jc.status === "Draft") await prisma.prodJobCard.update({ where: { id: jc.id }, data: { status: "InProduction" } });
    await logActivity(jc.id, `${karigar.name} assigned to ${stageName}`);
    res.status(201).json({ assignmentId: assignment.id });
  })
);

/* ----------------------- Remove karigar from a stage ---------------------- */
// Client: a wrong karigar was added to a stage — let them take it off (and add
// the right one). Only safe while the karigar has produced nothing yet; if any
// output exists it must be cleared first so nothing is orphaned. Blocked once
// the stage is Approved (unlock via Edit Stage first).
router.delete(
  "/assignments/:assignmentId",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const a = await prisma.prodAssignment.findUnique({
      where: { id: req.params.assignmentId },
      include: { stage: true, issues: true, stones: true, labour: true, subItems: true, karigar: true },
    });
    if (!a) throw notFound("Assignment not found");
    if (a.stage.status === "Approved") throw badRequest("Stage is approved — unlock it (Edit Stage) before removing a karigar");
    if (a.issues.length || a.stones.length || a.labour.length || a.subItems.length)
      throw badRequest("This karigar already has recorded output — clear/cancel it first, then remove");
    await prisma.prodAssignment.delete({ where: { id: a.id } });
    await logActivity(a.stage.jobCardId, `${a.karigar.name} removed from ${a.stage.stageName}`);
    res.json({ ok: true });
  })
);

/* --------------- Clear a karigar's recorded output on a stage ------------- */
// Client: an output was recorded by mistake (esp. Kundan/Fitting bulk output,
// which the per-line Edit can't zero out). Wipes this karigar's issues / stones /
// labour / sub-items on the stage but keeps the karigar assigned, so they can
// re-record (or then be removed). Blocked once the stage is Approved.
router.delete(
  "/assignments/:assignmentId/output",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const a = await prisma.prodAssignment.findUnique({
      where: { id: req.params.assignmentId },
      include: { stage: true, karigar: true },
    });
    if (!a) throw notFound("Assignment not found");
    if (a.stage.status === "Approved") throw badRequest("Stage is approved — unlock it (Edit Stage) before clearing output");
    await prisma.prodLabourEntry.deleteMany({ where: { assignmentId: a.id } });
    await prisma.prodStoneEntry.deleteMany({ where: { assignmentId: a.id } });
    await prisma.prodMaterialIssue.deleteMany({ where: { assignmentId: a.id } });
    await prisma.prodSubItem.deleteMany({ where: { assignmentId: a.id } });
    await logActivity(a.stage.jobCardId, `${a.karigar.name}'s ${a.stage.stageName} output cleared`);
    res.json({ ok: true });
  })
);

/* --------------------------- Issue Material (Meenakari/Setting) ----------- */
router.post(
  "/assignments/:assignmentId/issue",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const body = z
      .object({ purity: z.string(), issuedWeight: z.number().positive(), pieceCount: z.number().int().optional() })
      .parse(req.body);
    const a = await assignmentCtx(req.params.assignmentId);
    await prisma.prodMaterialIssue.create({
      data: {
        assignmentId: a.id,
        purityId: await purityIdFor(body.purity),
        issuedWeight: body.issuedWeight,
        issueDate: new Date(),
        status: "Issued",
        pieceCount: body.pieceCount ?? null,
        fromBulkStock: false,
      },
    });
    await logActivity(a.jobCardId, `${gm(body.issuedWeight)} @ ${body.purity} issued for ${a.stageName}`);
    res.status(201).json({ ok: true });
  })
);

/* --------------------------- Reconcile (Meenakari/Setting/Casting) -------- */
router.post(
  "/issues/:issueId/reconcile",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        returnedWeight: z.number(),
        returnedPurity: z.string(),
        dustWeight: z.number().default(0),
        wastagePercent: z.number().nullable().optional(),
        ratePerGm: z.number().nullable().optional(),
        flatLabourAmount: z.number().nullable().optional(),
        pieceCount: z.number().int().nullable().optional(),
      })
      .parse(req.body);
    const issue = await prisma.prodMaterialIssue.findUnique({
      where: { id: req.params.issueId },
      include: { assignment: { include: { stage: { include: { jobCard: true } } } } },
    });
    if (!issue) throw notFound("Issue not found");
    const jobCardId = issue.assignment.stage.jobCardId;
    const stageName = issue.assignment.stage.stageName;
    const [tierList, base] = await Promise.all([tiers(), baseRate()]);

    let labourId: string | null = issue.labourEntryId;
    let labourAmt = 0;
    if (body.wastagePercent != null) {
      labourAmt = computeLabourAmount("Wastage %", body.returnedWeight, body.wastagePercent, body.returnedPurity, tierList, base);
      const l = await prisma.prodLabourEntry.create({
        data: {
          assignmentId: issue.assignmentId,
          basis: "WastagePct",
          qty: body.returnedWeight,
          rate: body.wastagePercent,
          amount: labourAmt,
          purityId: await purityIdFor(body.returnedPurity),
          note: `${body.wastagePercent}% wastage × ${body.returnedWeight.toFixed(3)}g recovered @${body.returnedPurity} (auto-charged on reconcile)`,
        },
      });
      labourId = l.id;
    } else if (body.ratePerGm != null) {
      labourAmt = +(body.returnedWeight * body.ratePerGm).toFixed(2);
      const l = await prisma.prodLabourEntry.create({
        data: {
          assignmentId: issue.assignmentId,
          basis: "PerGram",
          qty: body.returnedWeight,
          rate: body.ratePerGm,
          amount: labourAmt,
          note: `₹${body.ratePerGm}/gm × ${body.returnedWeight.toFixed(3)}g finished weight (net of dust, auto-charged on reconcile)`,
        },
      });
      labourId = l.id;
    } else if (body.flatLabourAmount != null) {
      labourAmt = body.flatLabourAmount;
      const l = await prisma.prodLabourEntry.create({
        data: {
          assignmentId: issue.assignmentId,
          basis: "Flat",
          qty: 1,
          rate: body.flatLabourAmount,
          amount: body.flatLabourAmount,
          note: "Flat labour (auto-charged on reconcile)",
        },
      });
      labourId = l.id;
    }

    await prisma.prodMaterialIssue.update({
      where: { id: issue.id },
      data: {
        status: "Reconciled",
        returnedWeight: body.returnedWeight,
        returnedPurityId: await purityIdFor(body.returnedPurity),
        dustWeight: body.dustWeight,
        returnDate: new Date(),
        pieceCount: body.pieceCount ?? issue.pieceCount,
        labourEntryId: labourId,
      },
    });
    await logActivity(
      jobCardId,
      labourId
        ? `${stageName} reconciled — ${gm(body.returnedWeight)} @ ${body.returnedPurity} finished, labour auto-charged (${money(labourAmt)})`
        : `${stageName} reconciled — ${gm(body.returnedWeight)} @ ${body.returnedPurity} returned`
    );
    res.json({ ok: true });
  })
);

/* ------------------------- Update job-card meta (§7/§8) ------------------- */
router.patch(
  "/job-cards/:jobNo",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        dueDate: z.coerce.date().nullable().optional(),
        notes: z.string().optional(),
        pieceCount: z.number().int().nullable().optional(),
        manualSilverValue: z.number().nullable().optional(),
        todaysSilverRate: z.number().nullable().optional(),
      })
      .parse(req.body);
    const jc = await prisma.prodJobCard.findUnique({ where: { jobNo: req.params.jobNo } });
    if (!jc) throw notFound("Job card not found");
    await prisma.prodJobCard.update({
      where: { id: jc.id },
      data: {
        ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.pieceCount !== undefined ? { pieceCount: body.pieceCount } : {}),
        ...(body.manualSilverValue !== undefined ? { manualSilverValue: body.manualSilverValue } : {}),
        ...(body.todaysSilverRate !== undefined ? { todaysSilverRate: body.todaysSilverRate } : {}),
      },
    });
    res.json({ ok: true });
  })
);

/* --------------------------- Edit / Cancel a reconcile -------------------- */
// Mockup editReconcile: update the issue's returned figures + its linked labour
// entry in place (or create one if missing).
router.post(
  "/issues/:issueId/edit-reconcile",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        returnedWeight: z.number(),
        returnedPurity: z.string(),
        dustWeight: z.number().default(0),
        ratePerGm: z.number().nullable().optional(),
        flatLabourAmount: z.number().nullable().optional(),
        pieceCount: z.number().int().nullable().optional(),
      })
      .parse(req.body);
    const issue = await prisma.prodMaterialIssue.findUnique({
      where: { id: req.params.issueId },
      include: { assignment: { include: { stage: true } } },
    });
    if (!issue) throw notFound("Issue not found");

    let labourId = issue.labourEntryId;
    if (body.ratePerGm != null) {
      const amount = +(body.returnedWeight * body.ratePerGm).toFixed(2);
      const note = `₹${body.ratePerGm}/gm × ${body.returnedWeight.toFixed(3)}g finished weight (edited)`;
      const existing = labourId ? await prisma.prodLabourEntry.findUnique({ where: { id: labourId } }) : null;
      if (existing) await prisma.prodLabourEntry.update({ where: { id: labourId! }, data: { basis: "PerGram", qty: body.returnedWeight, rate: body.ratePerGm, amount, note } });
      else labourId = (await prisma.prodLabourEntry.create({ data: { assignmentId: issue.assignmentId, basis: "PerGram", qty: body.returnedWeight, rate: body.ratePerGm, amount, note } })).id;
    } else if (body.flatLabourAmount != null) {
      const amount = body.flatLabourAmount;
      const existing = labourId ? await prisma.prodLabourEntry.findUnique({ where: { id: labourId } }) : null;
      if (existing) await prisma.prodLabourEntry.update({ where: { id: labourId! }, data: { basis: "Flat", qty: 1, rate: amount, amount, note: "Flat labour (edited)" } });
      else labourId = (await prisma.prodLabourEntry.create({ data: { assignmentId: issue.assignmentId, basis: "Flat", qty: 1, rate: amount, amount, note: "Flat labour (edited)" } })).id;
    }

    await prisma.prodMaterialIssue.update({
      where: { id: issue.id },
      data: {
        returnedWeight: body.returnedWeight,
        returnedPurityId: await purityIdFor(body.returnedPurity),
        dustWeight: body.dustWeight,
        pieceCount: body.pieceCount ?? issue.pieceCount,
        labourEntryId: labourId,
      },
    });
    await logActivity(issue.assignment.stage.jobCardId, `${issue.assignment.stage.stageName} output corrected — ${gm(body.returnedWeight)} @ ${body.returnedPurity}`);
    res.json({ ok: true });
  })
);

// Mockup cancelReconcile: revert the issue to "Issued" and remove its labour.
router.post(
  "/issues/:issueId/cancel-reconcile",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const issue = await prisma.prodMaterialIssue.findUnique({
      where: { id: req.params.issueId },
      include: { assignment: { include: { stage: true } } },
    });
    if (!issue) throw notFound("Issue not found");
    if (issue.labourEntryId) {
      await prisma.prodLabourEntry.delete({ where: { id: issue.labourEntryId } }).catch(() => {});
    }
    await prisma.prodMaterialIssue.update({
      where: { id: issue.id },
      data: { status: "Issued", returnedWeight: null, returnedPurityId: null, dustWeight: null, returnDate: null, pieceCount: null, labourEntryId: null },
    });
    await logActivity(issue.assignment.stage.jobCardId, `${issue.assignment.stage.stageName} reconciliation cancelled — reverted to pending`);
    res.json({ ok: true });
  })
);

// Remove a material issue outright (client: issued the wrong weight/purity on a
// stage and wants it gone, not just reverted). Cleans up its auto-labour too.
// Blocked once the stage is Approved (unlock via Edit Stage first).
router.delete(
  "/issues/:issueId",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const issue = await prisma.prodMaterialIssue.findUnique({
      where: { id: req.params.issueId },
      include: { assignment: { include: { stage: true } } },
    });
    if (!issue) throw notFound("Issue not found");
    if (issue.assignment.stage.status === "Approved") throw badRequest("Stage is approved — unlock it (Edit Stage) before removing");
    if (issue.labourEntryId) {
      await prisma.prodLabourEntry.delete({ where: { id: issue.labourEntryId } }).catch(() => {});
    }
    await prisma.prodMaterialIssue.delete({ where: { id: issue.id } });
    await logActivity(issue.assignment.stage.jobCardId, `Material issue removed on ${issue.assignment.stage.stageName}`);
    res.json({ ok: true });
  })
);

/* ----------------------------- Cast Output (Casting) ---------------------- */
const castBody = z.object({
  assignmentId: z.string().min(1),
  returnedWeight: z.number().positive(),
  wastagePercent: z.number().default(0),
  pieceCount: z.number().int().positive(),
  // Row-wise sub-item breakdown (name from master list × pieces × weight).
  // When present it drives the totals and is stored karigar-wise against
  // this casting assignment; plain returnedWeight/pieceCount are fallback.
  subItems: z
    .array(z.object({ name: z.string(), pieces: z.number().int().default(0), weightG: z.number().nullable().optional() }))
    .default([]),
});

// Writes the casting output (material issue + karigar-wise sub-item breakdown)
// for an assignment. Shared by the create route and the edit route.
async function writeCastOutput(body: z.infer<typeof castBody>, jcId: string, stageId: string, targetPurityId: string | null, verb: "recorded" | "edited") {
  const rows = body.subItems.filter((r) => r.name.trim());
  const totalWeight = rows.length ? +rows.reduce((s, r) => s + (r.weightG ?? 0), 0).toFixed(3) : body.returnedWeight;
  const totalPieces = rows.length ? rows.reduce((s, r) => s + (r.pieces || 0), 0) : body.pieceCount;
  const wastageWeight = +(totalWeight * (body.wastagePercent / 100)).toFixed(3);
  await prisma.prodMaterialIssue.create({
    data: {
      assignmentId: body.assignmentId,
      purityId: null,
      issuedWeight: null,
      issueDate: new Date(),
      status: "Reconciled",
      returnedWeight: totalWeight,
      returnedPurityId: targetPurityId,
      dustWeight: 0,
      returnDate: new Date(),
      fromBulkStock: true,
      pieceCount: totalPieces,
      wastagePercent: body.wastagePercent,
      wastageWeight,
    },
  });
  // Store the sub-item breakdown against this karigar's casting assignment.
  await prisma.prodSubItem.deleteMany({ where: { assignmentId: body.assignmentId } });
  if (rows.length) {
    await prisma.prodSubItem.createMany({
      data: rows.map((r, i) => ({ assignmentId: body.assignmentId, sortOrder: i, name: r.name.trim(), pieces: r.pieces || 0, weightG: r.weightG ?? null })),
    });
  }
  await prisma.prodStage.update({ where: { id: stageId }, data: { status: "InProgress" } });
  await prisma.prodJobCard.update({ where: { id: jcId }, data: { pieceCount: totalPieces } });
  const rowLabel = rows.length ? ` [${rows.map((r) => `${r.pieces}×${r.name.trim()}`).join(", ")}]` : "";
  await logActivity(jcId, `Casting output ${verb} — ${gm(totalWeight)} (${totalPieces} pcs)${rowLabel} + ${gm(wastageWeight)} wastage (${body.wastagePercent}%)`);
}

router.post(
  "/job-cards/:jobNo/cast-output",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const body = castBody.parse(req.body);
    const { jc, stage } = await stageByName(req.params.jobNo, "Casting");
    await writeCastOutput(body, jc.id, stage.id, jc.targetPurityId, "recorded");
    res.status(201).json({ ok: true });
  })
);

// Edit a recorded casting output — clears this assignment's casting material
// issue(s) + sub-items and rewrites from the corrected values. Blocked once the
// stage is Approved (unlock via Edit Stage first). Logs the edit as activity.
router.post(
  "/job-cards/:jobNo/cast-output/edit",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const body = castBody.parse(req.body);
    const { jc, stage } = await stageByName(req.params.jobNo, "Casting");
    if (stage.status === "Approved") throw badRequest("Stage is approved — unlock it (Edit Stage) before editing the output");
    await prisma.prodMaterialIssue.deleteMany({ where: { assignmentId: body.assignmentId } });
    await writeCastOutput(body, jc.id, stage.id, jc.targetPurityId, "edited");
    res.json({ ok: true });
  })
);

/* ----------------------------- Jadai Output ------------------------------- */
const jadaiBody = z.object({
  assignmentId: z.string().min(1),
  // Kundan gold doesn't come in Jadai here — weight is optional (0 = no gold).
  weight: z.number().nonnegative().default(0),
  labourAmount: z.number().default(0),
  pieceCount: z.number().int().positive(),
  stones: z
    .array(z.object({ name: z.string(), pieces: z.number().int().default(0), carat: z.number(), rate: z.number().default(0) }))
    .default([]),
});

// Writes the Jadai output (polki/diamond stones, labour, and — only if any gold
// weight is entered — a material issue) for an assignment. Shared by the create
// route and the edit route.
async function writeJadaiOutput(body: z.infer<typeof jadaiBody>, jcId: string, stageId: string, pureLabel: string) {
  if (body.weight > 0) {
    await prisma.prodMaterialIssue.create({
      data: {
        assignmentId: body.assignmentId,
        purityId: null,
        issueDate: new Date(),
        status: "Reconciled",
        returnedWeight: body.weight,
        returnedPurityId: await purityIdFor(pureLabel),
        dustWeight: 0,
        returnDate: new Date(),
        fromBulkStock: true,
        pieceCount: body.pieceCount,
      },
    });
  }
  for (const s of body.stones) {
    const finalAmount = +(s.carat * s.rate).toFixed(2);
    await prisma.prodStoneEntry.create({
      data: {
        assignmentId: body.assignmentId,
        type: s.name,
        qtyIssued: `${s.pieces} pcs / ${s.carat} ct`,
        valueIssued: finalAmount,
        piecesCount: s.pieces,
        carat: s.carat,
        ratePerCarat: s.rate,
      },
    });
  }
  if (body.labourAmount > 0) {
    await prisma.prodLabourEntry.create({
      data: { assignmentId: body.assignmentId, basis: "Flat", qty: 1, rate: body.labourAmount, amount: body.labourAmount, note: "Manual labour entry (from bulk stock)" },
    });
  }
  await prisma.prodStage.update({ where: { id: stageId }, data: { status: "InProgress" } });
  await prisma.prodJobCard.update({ where: { id: jcId }, data: { pieceCount: body.pieceCount } });
}

router.post(
  "/job-cards/:jobNo/jadai-output",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const body = jadaiBody.parse(req.body);
    const { jc, stage } = await stageByName(req.params.jobNo, "Jadai");
    const pureLabel = pureTierLabel(await tiers());
    await writeJadaiOutput(body, jc.id, stage.id, pureLabel);
    const jadaiGold = body.weight > 0 ? `${gm(body.weight)} @ ${pureLabel}, ` : "";
    await logActivity(jc.id, `Jadai output recorded — ${jadaiGold}${body.pieceCount} pcs, labour ${money(body.labourAmount)}`);
    res.status(201).json({ ok: true });
  })
);

// Edit a recorded Jadai output — client: fix a mistyped kundan weight/rate, or
// fill the kundan weight in after jadai is finished. Clears the assignment's
// existing jadai material/stones/labour and rewrites from the corrected values.
// Blocked once the stage is Approved (use Edit Stage to unlock first).
router.post(
  "/job-cards/:jobNo/jadai-output/edit",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const body = jadaiBody.parse(req.body);
    const { jc, stage } = await stageByName(req.params.jobNo, "Jadai");
    if (stage.status === "Approved") throw badRequest("Stage is approved — unlock it (Edit Stage) before editing the output");
    await prisma.prodLabourEntry.deleteMany({ where: { assignmentId: body.assignmentId } });
    await prisma.prodStoneEntry.deleteMany({ where: { assignmentId: body.assignmentId } });
    await prisma.prodMaterialIssue.deleteMany({ where: { assignmentId: body.assignmentId } });
    const pureLabel = pureTierLabel(await tiers());
    await writeJadaiOutput(body, jc.id, stage.id, pureLabel);
    const jadaiGold = body.weight > 0 ? `${gm(body.weight)} @ ${pureLabel}, ` : "";
    await logActivity(jc.id, `Jadai output edited — ${jadaiGold}${body.pieceCount} pcs, labour ${money(body.labourAmount)}`);
    res.json({ ok: true });
  })
);

/* ----------------------------- Kundan Output ------------------------------ */
// Dedicated stage between Jadai and Setting: kundan gold (24K) is set onto the
// piece here. Records the kundan gold weight (adds to net metal) + labour.
const kundanBody = z.object({
  assignmentId: z.string().min(1),
  weight: z.number().positive(),
  labourAmount: z.number().default(0),
});

async function writeKundanOutput(body: z.infer<typeof kundanBody>, jcId: string, stageId: string, pureLabel: string) {
  await prisma.prodMaterialIssue.create({
    data: {
      assignmentId: body.assignmentId,
      purityId: null,
      issueDate: new Date(),
      status: "Reconciled",
      returnedWeight: body.weight,
      returnedPurityId: await purityIdFor(pureLabel),
      dustWeight: 0,
      returnDate: new Date(),
      fromBulkStock: true,
    },
  });
  if (body.labourAmount > 0) {
    await prisma.prodLabourEntry.create({
      data: { assignmentId: body.assignmentId, basis: "Flat", qty: 1, rate: body.labourAmount, amount: body.labourAmount, note: "Kundan labour (from bulk stock)" },
    });
  }
  await prisma.prodStage.update({ where: { id: stageId }, data: { status: "InProgress" } });
}

router.post(
  "/job-cards/:jobNo/kundan-output",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const body = kundanBody.parse(req.body);
    const { jc, stage } = await stageByName(req.params.jobNo, "Kundan");
    const pureLabel = pureTierLabel(await tiers());
    await writeKundanOutput(body, jc.id, stage.id, pureLabel);
    await logActivity(jc.id, `Kundan output recorded — ${gm(body.weight)} @ ${pureLabel}, labour ${money(body.labourAmount)}`);
    res.status(201).json({ ok: true });
  })
);

// Edit a recorded Kundan output — clears this assignment's kundan material issue
// + labour and rewrites. Blocked once the stage is Approved. Logs the edit.
router.post(
  "/job-cards/:jobNo/kundan-output/edit",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const body = kundanBody.parse(req.body);
    const { jc, stage } = await stageByName(req.params.jobNo, "Kundan");
    if (stage.status === "Approved") throw badRequest("Stage is approved — unlock it (Edit Stage) before editing the output");
    await prisma.prodLabourEntry.deleteMany({ where: { assignmentId: body.assignmentId } });
    await prisma.prodMaterialIssue.deleteMany({ where: { assignmentId: body.assignmentId } });
    const pureLabel = pureTierLabel(await tiers());
    await writeKundanOutput(body, jc.id, stage.id, pureLabel);
    await logActivity(jc.id, `Kundan output edited — ${gm(body.weight)} @ ${pureLabel}, labour ${money(body.labourAmount)}`);
    res.json({ ok: true });
  })
);

/* ----------------------------- Fitting/Finding Output --------------------- */
const findingBody = z.object({
  assignmentId: z.string().min(1),
  pieceCount: z.number().int().positive(),
  labourAmount: z.number().default(0),
  findings: z.array(z.object({ type: z.string(), weight: z.number(), karat: z.string() })).default([]),
  items: z.array(z.object({ type: z.string(), amount: z.number(), carat: z.number().default(0) })).default([]),
});

// Writes the Fitting output (silver findings, flat items, labour) for an
// assignment. Shared by the create route and the edit route.
async function writeFindingOutput(body: z.infer<typeof findingBody>, jcId: string, stageId: string, verb: "recorded" | "edited") {
  for (const f of body.findings) {
    await prisma.prodMaterialIssue.create({
      data: {
        assignmentId: body.assignmentId,
        purityId: null,
        issueDate: new Date(),
        status: "Reconciled",
        returnedWeight: f.weight,
        returnedPurityId: await purityIdFor(f.karat),
        dustWeight: 0,
        returnDate: new Date(),
        fromBulkStock: true,
        label: f.type || null,
      },
    });
  }
  for (const it of body.items) {
    await prisma.prodStoneEntry.create({
      data: {
        assignmentId: body.assignmentId,
        type: it.type,
        qtyIssued: it.carat > 0 ? `flat / ${it.carat} ct` : "flat",
        valueIssued: it.amount,
        carat: it.carat || null,
      },
    });
  }
  if (body.labourAmount > 0) {
    await prisma.prodLabourEntry.create({
      data: { assignmentId: body.assignmentId, basis: "Flat", qty: 1, rate: body.labourAmount, amount: body.labourAmount, note: "Flat labour (Fitting)" },
    });
  }
  await prisma.prodStage.update({ where: { id: stageId }, data: { status: "InProgress" } });
  await prisma.prodJobCard.update({ where: { id: jcId }, data: { pieceCount: body.pieceCount } });
  await logActivity(jcId, `Fitting output ${verb} (${body.pieceCount} pcs), labour ${money(body.labourAmount)}`);
}

router.post(
  "/job-cards/:jobNo/finding-output",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const body = findingBody.parse(req.body);
    const { jc, stage } = await stageByName(req.params.jobNo, "Fitting");
    await writeFindingOutput(body, jc.id, stage.id, "recorded");
    res.status(201).json({ ok: true });
  })
);

// Edit a recorded Fitting output — clears this assignment's fitting material
// issues / stones / labour and rewrites from the corrected values. Blocked once
// the stage is Approved (unlock via Edit Stage first). Logs the edit as activity.
router.post(
  "/job-cards/:jobNo/finding-output/edit",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const body = findingBody.parse(req.body);
    const { jc, stage } = await stageByName(req.params.jobNo, "Fitting");
    if (stage.status === "Approved") throw badRequest("Stage is approved — unlock it (Edit Stage) before editing the output");
    await prisma.prodLabourEntry.deleteMany({ where: { assignmentId: body.assignmentId } });
    await prisma.prodStoneEntry.deleteMany({ where: { assignmentId: body.assignmentId } });
    await prisma.prodMaterialIssue.deleteMany({ where: { assignmentId: body.assignmentId } });
    await writeFindingOutput(body, jc.id, stage.id, "edited");
    res.json({ ok: true });
  })
);

/* ------------------------------- Stones ----------------------------------- */
router.post(
  "/assignments/:assignmentId/stones",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        type: z.string(),
        qtyIssued: z.string().default(""),
        valueIssued: z.number().default(0),
        piecesCount: z.number().int().nullable().optional(),
        carat: z.number().nullable().optional(),
        ratePerCarat: z.number().nullable().optional(),
      })
      .parse(req.body);
    const a = await assignmentCtx(req.params.assignmentId);
    await prisma.prodStoneEntry.create({
      data: {
        assignmentId: a.id,
        type: body.type,
        qtyIssued: body.qtyIssued,
        valueIssued: body.valueIssued,
        piecesCount: body.piecesCount ?? null,
        carat: body.carat ?? null,
        ratePerCarat: body.ratePerCarat ?? null,
      },
    });
    await logActivity(a.jobCardId, `Stones issued on ${a.stageName} — ${body.type} (${money(body.valueIssued)})`);
    res.status(201).json({ ok: true });
  })
);
router.post(
  "/stones/:stoneId/return",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const body = z
      .object({ qtyReturned: z.string().default(""), valueReturned: z.number().default(0), caratReturned: z.number().nullable().optional() })
      .parse(req.body);
    await prisma.prodStoneEntry.update({
      where: { id: req.params.stoneId },
      data: { qtyReturned: body.qtyReturned, valueReturned: body.valueReturned, caratReturned: body.caratReturned ?? null },
    });
    res.json({ ok: true });
  })
);

// Edit a stone already issued on a stage (client: fix a mistyped type / pieces /
// carat / rate on Setting). Recomputes qty label + value from pcs × carat × rate.
// Blocked once the stage is Approved (unlock via Edit Stage first).
router.post(
  "/stones/:stoneId/edit",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        type: z.string().min(1),
        piecesCount: z.number().int().nullable().optional(),
        carat: z.number().nullable().optional(),
        ratePerCarat: z.number().nullable().optional(),
      })
      .parse(req.body);
    const stone = await prisma.prodStoneEntry.findUnique({
      where: { id: req.params.stoneId },
      include: { assignment: { include: { stage: true } } },
    });
    if (!stone) throw notFound("Stone not found");
    if (stone.assignment.stage.status === "Approved") throw badRequest("Stage is approved — unlock it (Edit Stage) before editing");
    const pcs = body.piecesCount ?? null;
    const carat = body.carat ?? null;
    const rate = body.ratePerCarat ?? null;
    const valueIssued = +(((carat ?? 0) * (rate ?? 0))).toFixed(2);
    await prisma.prodStoneEntry.update({
      where: { id: stone.id },
      data: {
        type: body.type,
        qtyIssued: `${pcs ?? 0} pcs / ${carat ?? 0} ct`,
        valueIssued,
        piecesCount: pcs,
        carat,
        ratePerCarat: rate,
      },
    });
    await logActivity(stone.assignment.stage.jobCardId, `Stone edited on ${stone.assignment.stage.stageName} — ${body.type} (${money(valueIssued)})`);
    res.json({ ok: true });
  })
);

// Remove a stone issued on a stage (client: issued the wrong stone by mistake).
// Blocked once the stage is Approved (unlock via Edit Stage first).
router.delete(
  "/stones/:stoneId",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const stone = await prisma.prodStoneEntry.findUnique({
      where: { id: req.params.stoneId },
      include: { assignment: { include: { stage: true } } },
    });
    if (!stone) throw notFound("Stone not found");
    if (stone.assignment.stage.status === "Approved") throw badRequest("Stage is approved — unlock it (Edit Stage) before removing");
    await prisma.prodStoneEntry.delete({ where: { id: stone.id } });
    await logActivity(stone.assignment.stage.jobCardId, `Stone removed on ${stone.assignment.stage.stageName} — ${stone.type}`);
    res.json({ ok: true });
  })
);

/* ------------------------------- Labour ----------------------------------- */
router.post(
  "/assignments/:assignmentId/labour",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        basis: z.enum(["Wastage %", "Per Gram", "Per Stone", "Flat"]),
        qty: z.number().default(0),
        rate: z.number().default(0),
        amount: z.number(),
        note: z.string().default(""),
        purity: z.string().optional(),
      })
      .parse(req.body);
    const a = await assignmentCtx(req.params.assignmentId);
    await prisma.prodLabourEntry.create({
      data: {
        assignmentId: a.id,
        basis: LABOUR_BASIS_ENUM[body.basis] as never,
        qty: body.qty,
        rate: body.rate,
        amount: body.amount,
        note: body.note,
        purityId: await purityIdFor(body.purity),
      },
    });
    await logActivity(a.jobCardId, `Labour added on ${a.stageName} — ${money(body.amount)}`);
    res.status(201).json({ ok: true });
  })
);
router.delete(
  "/labour/:labourId",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    await prisma.prodLabourEntry.delete({ where: { id: req.params.labourId } });
    res.json({ ok: true });
  })
);

/* --------------------------- Stage / job lifecycle ------------------------ */
router.post(
  "/job-cards/:jobNo/stages/:stageName/approve",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const { jc, stage } = await stageByName(req.params.jobNo, req.params.stageName);
    await prisma.prodStage.update({ where: { id: stage.id }, data: { status: "Approved", approvedDate: new Date() } });
    await logActivity(jc.id, `${req.params.stageName} stage approved`);
    res.json({ ok: true });
  })
);
// Unlock an already-approved stage so its karigars/outputs/stones can be edited
// again (client: "stage approve ke baad edit ka option"). Reverts to In Progress
// and logs it; re-approve when done. If the job was Closed, reopen it too.
router.post(
  "/job-cards/:jobNo/stages/:stageName/unapprove",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().optional() }).parse(req.body ?? {});
    const { jc, stage } = await stageByName(req.params.jobNo, req.params.stageName);
    if (stage.status !== "Approved") throw badRequest("Stage is not approved");
    await prisma.prodStage.update({ where: { id: stage.id }, data: { status: "InProgress", approvedDate: null } });
    if (jc.status === "Closed") {
      await prisma.prodJobCard.update({ where: { id: jc.id }, data: { status: "InProduction", closedAt: null } });
    }
    await logActivity(jc.id, `${req.params.stageName} stage unlocked for editing${reason ? ` — ${reason}` : ""}`);
    res.json({ ok: true });
  })
);
router.post(
  "/job-cards/:jobNo/close",
  requireRole("SUPER_ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const jc = await prisma.prodJobCard.findUnique({ where: { jobNo: req.params.jobNo }, include: { stages: { include: { assignments: true } } } });
    if (!jc) throw notFound("Job card not found");
    const blocker = jc.stages.find((s) => s.assignments.length > 0 && s.status !== "Approved");
    if (blocker) throw badRequest(`Stage ${blocker.stageName} is not approved yet`);
    await prisma.prodJobCard.update({ where: { id: jc.id }, data: { status: "Closed", closedAt: new Date() } });
    await logActivity(jc.id, "Job card closed — all stages approved");
    res.json({ ok: true });
  })
);
router.post(
  "/job-cards/:jobNo/reopen",
  requireRole("SUPER_ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const body = z.object({ reason: z.string().min(1), approvedBy: z.string().min(1) }).parse(req.body);
    const jc = await prisma.prodJobCard.findUnique({ where: { jobNo: req.params.jobNo } });
    if (!jc) throw notFound("Job card not found");
    await prisma.prodReversal.create({ data: { jobCardId: jc.id, reason: body.reason, approvedBy: body.approvedBy, reversedFromClosedAt: jc.closedAt } });
    await prisma.prodJobCard.update({ where: { id: jc.id }, data: { status: "InProduction", closedAt: null } });
    await logActivity(jc.id, `Reopened (audited) by ${body.approvedBy}`);
    res.json({ ok: true });
  })
);
router.post(
  "/job-cards/:jobNo/hold",
  requireRole("SUPER_ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const reason = z.object({ holdReason: z.string().optional() }).parse(req.body).holdReason || "Put on hold by admin";
    const jc = await prisma.prodJobCard.findUnique({ where: { jobNo: req.params.jobNo } });
    if (!jc) throw notFound("Job card not found");
    const resume = jc.status === "OnHold";
    await prisma.prodJobCard.update({
      where: { id: jc.id },
      data: resume ? { status: "InProduction", holdReason: null } : { status: "OnHold", holdReason: reason },
    });
    await logActivity(jc.id, resume ? "Resumed from hold" : "Put on hold");
    res.json({ ok: true, status: resume ? "In Production" : "On Hold" });
  })
);

async function assignmentCtx(assignmentId: string) {
  const a = await prisma.prodAssignment.findUnique({
    where: { id: assignmentId },
    include: { stage: true },
  });
  if (!a) throw notFound("Assignment not found");
  return { id: a.id, jobCardId: a.stage.jobCardId, stageName: a.stage.stageName as string };
}

export default router;
