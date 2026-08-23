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

/* ----------------------------- Cast Output (Casting) ---------------------- */
router.post(
  "/job-cards/:jobNo/cast-output",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        assignmentId: z.string().min(1),
        returnedWeight: z.number().positive(),
        wastagePercent: z.number().default(0),
        pieceCount: z.number().int().positive(),
      })
      .parse(req.body);
    const { jc, stage } = await stageByName(req.params.jobNo, "Casting");
    const wastageWeight = +(body.returnedWeight * (body.wastagePercent / 100)).toFixed(3);
    await prisma.prodMaterialIssue.create({
      data: {
        assignmentId: body.assignmentId,
        purityId: null,
        issuedWeight: null,
        issueDate: new Date(),
        status: "Reconciled",
        returnedWeight: body.returnedWeight,
        returnedPurityId: jc.targetPurityId,
        dustWeight: 0,
        returnDate: new Date(),
        fromBulkStock: true,
        pieceCount: body.pieceCount,
        wastagePercent: body.wastagePercent,
        wastageWeight,
      },
    });
    await prisma.prodStage.update({ where: { id: stage.id }, data: { status: "InProgress" } });
    await prisma.prodJobCard.update({ where: { id: jc.id }, data: { pieceCount: body.pieceCount } });
    await logActivity(jc.id, `Casting output recorded — ${gm(body.returnedWeight)} (${body.pieceCount} pcs) + ${gm(wastageWeight)} wastage (${body.wastagePercent}%)`);
    res.status(201).json({ ok: true });
  })
);

/* ----------------------------- Jadai Output ------------------------------- */
router.post(
  "/job-cards/:jobNo/jadai-output",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        assignmentId: z.string().min(1),
        weight: z.number().positive(),
        labourAmount: z.number().default(0),
        pieceCount: z.number().int().positive(),
        stones: z
          .array(z.object({ name: z.string(), pieces: z.number().int().default(0), carat: z.number(), rate: z.number().default(0) }))
          .default([]),
      })
      .parse(req.body);
    const { jc, stage } = await stageByName(req.params.jobNo, "Jadai");
    const tierList = await tiers();
    const pureLabel = pureTierLabel(tierList);
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
    await prisma.prodStage.update({ where: { id: stage.id }, data: { status: "InProgress" } });
    await prisma.prodJobCard.update({ where: { id: jc.id }, data: { pieceCount: body.pieceCount } });
    await logActivity(jc.id, `Jadai output recorded — ${gm(body.weight)} @ ${pureLabel} (${body.pieceCount} pcs), labour ${money(body.labourAmount)}`);
    res.status(201).json({ ok: true });
  })
);

/* ----------------------------- Fitting/Finding Output --------------------- */
router.post(
  "/job-cards/:jobNo/finding-output",
  requireRole(...MANAGER),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        assignmentId: z.string().min(1),
        pieceCount: z.number().int().positive(),
        labourAmount: z.number().default(0),
        findings: z.array(z.object({ type: z.string(), weight: z.number(), karat: z.string() })).default([]),
        items: z.array(z.object({ type: z.string(), amount: z.number(), carat: z.number().default(0) })).default([]),
      })
      .parse(req.body);
    const { jc, stage } = await stageByName(req.params.jobNo, "Fitting");
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
    await prisma.prodStage.update({ where: { id: stage.id }, data: { status: "InProgress" } });
    await prisma.prodJobCard.update({ where: { id: jc.id }, data: { pieceCount: body.pieceCount } });
    await logActivity(jc.id, `Fitting output recorded (${body.pieceCount} pcs), labour ${money(body.labourAmount)}`);
    res.status(201).json({ ok: true });
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
