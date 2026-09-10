/**
 * Chowker settings + masters writes: base rate, default rates, purity tiers,
 * karigars, item masters. Backs the Settings / Karigar / Item Master screens.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requirePermission } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { badRequest } from "../../utils/httpError";

const router = Router();

/* ------------------------------- Settings --------------------------------- */
router.patch(
  "/settings",
  requirePermission("settings", "UPDATE"),
  asyncHandler(async (req, res) => {
    const body = z.object({ baseRate: z.number().positive().optional(), defaultRates: z.record(z.any()).optional() }).parse(req.body);
    if (body.baseRate != null) {
      await prisma.appSetting.upsert({ where: { key: "chowker.baseRate" }, create: { key: "chowker.baseRate", value: String(body.baseRate) }, update: { value: String(body.baseRate) } });
    }
    if (body.defaultRates) {
      await prisma.appSetting.upsert({ where: { key: "chowker.defaultRates" }, create: { key: "chowker.defaultRates", value: JSON.stringify(body.defaultRates) }, update: { value: JSON.stringify(body.defaultRates) } });
    }
    res.json({ ok: true });
  })
);

/* ----------------------------- Purity tiers ------------------------------- */
const tierSchema = z.object({ label: z.string().min(1), percent: z.number().min(0).max(100) });
router.post(
  "/purity-tiers",
  requirePermission("settings", "ADD"),
  asyncHandler(async (req, res) => {
    const body = tierSchema.parse(req.body);
    const t = await prisma.purityTier.create({ data: { code: body.label, percent: body.percent, purityFactor: body.percent / 100 } });
    res.status(201).json(t);
  })
);
router.patch(
  "/purity-tiers/:id",
  requirePermission("settings", "UPDATE"),
  asyncHandler(async (req, res) => {
    const body = tierSchema.partial().parse(req.body);
    const t = await prisma.purityTier.update({
      where: { id: req.params.id },
      data: {
        ...(body.label != null ? { code: body.label } : {}),
        ...(body.percent != null ? { percent: body.percent, purityFactor: body.percent / 100 } : {}),
      },
    });
    res.json(t);
  })
);
router.delete(
  "/purity-tiers/:id",
  requirePermission("settings", "DELETE"),
  asyncHandler(async (req, res) => {
    // Soft-remove — a tier may be referenced by history; hide it from pickers.
    await prisma.purityTier.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ ok: true });
  })
);

/* -------------------------- Sub-item names (master) ----------------------- */
// Admin-managed list of casting sub-item names (Ghat/Otla/Chain/…), shared
// across all job cards and offered in the casting output dropdown.
router.post(
  "/sub-item-names",
  requirePermission("settings", "ADD"),
  asyncHandler(async (req, res) => {
    const body = z.object({ label: z.string().min(1) }).parse(req.body);
    const count = await prisma.prodSubItemName.count();
    const existing = await prisma.prodSubItemName.findUnique({ where: { label: body.label.trim() } });
    if (existing) {
      // Re-activate a previously removed name rather than erroring on the unique.
      const t = await prisma.prodSubItemName.update({ where: { id: existing.id }, data: { isActive: true } });
      return res.status(201).json(t);
    }
    const t = await prisma.prodSubItemName.create({ data: { label: body.label.trim(), sortOrder: count } });
    res.status(201).json(t);
  })
);
router.patch(
  "/sub-item-names/:id",
  requirePermission("settings", "UPDATE"),
  asyncHandler(async (req, res) => {
    const body = z.object({ label: z.string().min(1) }).parse(req.body);
    const t = await prisma.prodSubItemName.update({ where: { id: req.params.id }, data: { label: body.label.trim() } });
    res.json(t);
  })
);
router.delete(
  "/sub-item-names/:id",
  requirePermission("settings", "DELETE"),
  asyncHandler(async (req, res) => {
    // Soft-remove — historical sub-items store the label as text, so hiding the
    // master entry never breaks past records.
    await prisma.prodSubItemName.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ ok: true });
  })
);

/* -------------------------- Finding names (master) ------------------------ */
// Admin-managed list of Fitting finding names (Wire/Push Clip/Kadi/…), shared
// across all job cards and offered in the Fitting output dropdown — same
// pattern as sub-item names above.
router.post(
  "/finding-names",
  requirePermission("settings", "ADD"),
  asyncHandler(async (req, res) => {
    const body = z.object({ label: z.string().min(1) }).parse(req.body);
    const count = await prisma.prodFindingName.count();
    const existing = await prisma.prodFindingName.findUnique({ where: { label: body.label.trim() } });
    if (existing) {
      const t = await prisma.prodFindingName.update({ where: { id: existing.id }, data: { isActive: true } });
      return res.status(201).json(t);
    }
    const t = await prisma.prodFindingName.create({ data: { label: body.label.trim(), sortOrder: count } });
    res.status(201).json(t);
  })
);
router.patch(
  "/finding-names/:id",
  requirePermission("settings", "UPDATE"),
  asyncHandler(async (req, res) => {
    const body = z.object({ label: z.string().min(1) }).parse(req.body);
    const t = await prisma.prodFindingName.update({ where: { id: req.params.id }, data: { label: body.label.trim() } });
    res.json(t);
  })
);
router.delete(
  "/finding-names/:id",
  requirePermission("settings", "DELETE"),
  asyncHandler(async (req, res) => {
    await prisma.prodFindingName.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ ok: true });
  })
);

/* ------------------------- Work-type names (master) ------------------------ */
// Admin-managed list of Meenakari/Setting work-type reference tags (Enamel,
// Polish, Stone Setting, …) — purely a record of what the labour was for,
// offered in the reconcile dropdown. Same pattern as sub-item/finding names.
router.post(
  "/work-type-names",
  requirePermission("settings", "ADD"),
  asyncHandler(async (req, res) => {
    const body = z.object({ label: z.string().min(1) }).parse(req.body);
    const count = await prisma.prodWorkTypeName.count();
    const existing = await prisma.prodWorkTypeName.findUnique({ where: { label: body.label.trim() } });
    if (existing) {
      const t = await prisma.prodWorkTypeName.update({ where: { id: existing.id }, data: { isActive: true } });
      return res.status(201).json(t);
    }
    const t = await prisma.prodWorkTypeName.create({ data: { label: body.label.trim(), sortOrder: count } });
    res.status(201).json(t);
  })
);
router.patch(
  "/work-type-names/:id",
  requirePermission("settings", "UPDATE"),
  asyncHandler(async (req, res) => {
    const body = z.object({ label: z.string().min(1) }).parse(req.body);
    const t = await prisma.prodWorkTypeName.update({ where: { id: req.params.id }, data: { label: body.label.trim() } });
    res.json(t);
  })
);
router.delete(
  "/work-type-names/:id",
  requirePermission("settings", "DELETE"),
  asyncHandler(async (req, res) => {
    await prisma.prodWorkTypeName.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ ok: true });
  })
);

/* ------------------------------- Karigars --------------------------------- */
const karigarSchema = z.object({
  name: z.string().min(1),
  specialization: z.enum(["Casting", "Meenakari", "Jadai", "Setting", "Fitting"]),
  contact: z.string().optional(),
  defaultWastagePct: z.number().nullable().optional(),
  defaultRatePerGm: z.number().nullable().optional(),
  defaultFlatLabour: z.number().nullable().optional(),
  openingBalance: z.number().optional(),
  openingBalanceDate: z.coerce.date().optional(),
});
router.post(
  "/karigars",
  requirePermission("karigars", "ADD"),
  asyncHandler(async (req, res) => {
    const body = karigarSchema.parse(req.body);
    const count = await prisma.karigar.count();
    const k = await prisma.karigar.create({
      data: {
        code: `KR-${String(count + 1).padStart(3, "0")}`,
        name: body.name,
        specialization: body.specialization,
        contactNumber: body.contact ?? null,
        employmentType: "EXTERNAL",
        defaultWastagePct: body.defaultWastagePct ?? null,
        defaultRatePerGm: body.defaultRatePerGm ?? null,
        defaultFlatLabour: body.defaultFlatLabour ?? null,
        openingBalance: body.openingBalance ?? 0,
        // Real as-of date, not a sentinel — defaults to today when a balance
        // is actually set, so the ledger row shows a genuine date.
        openingBalanceDate: body.openingBalance ? (body.openingBalanceDate ?? new Date()) : null,
      },
    });
    res.status(201).json({ id: k.id });
  })
);
router.patch(
  "/karigars/:id",
  requirePermission("karigars", "UPDATE"),
  asyncHandler(async (req, res) => {
    const body = karigarSchema.partial().parse(req.body);
    const existing = body.openingBalance !== undefined ? await prisma.karigar.findUnique({ where: { id: req.params.id }, select: { openingBalanceDate: true } }) : null;
    await prisma.karigar.update({
      where: { id: req.params.id },
      data: {
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.specialization != null ? { specialization: body.specialization } : {}),
        ...(body.contact !== undefined ? { contactNumber: body.contact } : {}),
        ...(body.defaultWastagePct !== undefined ? { defaultWastagePct: body.defaultWastagePct } : {}),
        ...(body.defaultRatePerGm !== undefined ? { defaultRatePerGm: body.defaultRatePerGm } : {}),
        ...(body.defaultFlatLabour !== undefined ? { defaultFlatLabour: body.defaultFlatLabour } : {}),
        ...(body.openingBalance !== undefined ? { openingBalance: body.openingBalance } : {}),
        ...(body.openingBalanceDate !== undefined
          ? { openingBalanceDate: body.openingBalanceDate }
          : body.openingBalance !== undefined
          ? { openingBalanceDate: body.openingBalance ? (existing?.openingBalanceDate ?? new Date()) : null }
          : {}),
      },
    });
    res.json({ ok: true });
  })
);

/* --------------------------- Job Card Series (master) ---------------------- */
// Admin-managed job-card numbering series (Settings) — e.g. "N" starting at
// 001, "P" starting at 001, each effective from a given date. The client
// picks one when creating a job card; numbers within a series always run in
// order (SerialSequence, keyed by series id, is the atomic counter).
const seriesSchema = z.object({
  name: z.string().trim().min(1, "Series name (prefix) is required").max(10),
  // Numbers are entered by hand, so start/pad/effective are optional legacy
  // fields kept only for existing rows — a series just needs a name now.
  startAt: z.number().int().positive().optional(),
  padWidth: z.number().int().min(1).max(10).optional(),
  effectiveFrom: z.coerce.date().optional(),
});

/** Prisma unique-constraint violation. */
function isDuplicate(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}
router.get(
  "/job-card-series",
  requirePermission("settings", "VIEW"),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.prodJobCardSeries.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
    res.json(rows);
  })
);
router.post(
  "/job-card-series",
  requirePermission("settings", "ADD"),
  asyncHandler(async (req, res) => {
    const body = seriesSchema.parse(req.body);
    const startAt = body.startAt ?? 1;
    const padWidth = body.padWidth ?? String(startAt).length;
    let created;
    try {
      created = await prisma.prodJobCardSeries.create({
        data: { name: body.name, startAt, padWidth, effectiveFrom: body.effectiveFrom ?? new Date() },
      });
    } catch (e) {
      if (isDuplicate(e)) throw badRequest(`A job-card series named "${body.name}" already exists`);
      throw e;
    }
    res.status(201).json(created);
  })
);
router.patch(
  "/job-card-series/:id",
  requirePermission("settings", "UPDATE"),
  asyncHandler(async (req, res) => {
    const body = seriesSchema.partial().parse(req.body);
    // Changing startAt after numbers have already been issued would collide
    // with what's already out there — only allow it while the counter is
    // still untouched (i.e. no job card has used this series yet).
    if (body.startAt != null) {
      const seq = await prisma.serialSequence.findUnique({ where: { bucketKey: `jobcard-series-${req.params.id}` } });
      const series = await prisma.prodJobCardSeries.findUnique({ where: { id: req.params.id } });
      if (seq && series && seq.lastValue !== series.startAt - 1) {
        throw badRequest("This series has already issued numbers — Start By can no longer be changed");
      }
      await prisma.serialSequence.upsert({
        where: { bucketKey: `jobcard-series-${req.params.id}` },
        create: { bucketKey: `jobcard-series-${req.params.id}`, lastValue: body.startAt - 1 },
        update: { lastValue: body.startAt - 1 },
      });
    }
    let updated;
    try {
      updated = await prisma.prodJobCardSeries.update({
        where: { id: req.params.id },
        data: {
          ...(body.name != null ? { name: body.name } : {}),
          ...(body.startAt != null ? { startAt: body.startAt, padWidth: body.padWidth ?? String(body.startAt).length } : {}),
          ...(body.effectiveFrom != null ? { effectiveFrom: body.effectiveFrom } : {}),
        },
      });
    } catch (e) {
      if (isDuplicate(e)) throw badRequest(`A job-card series named "${body.name}" already exists`);
      throw e;
    }
    res.json(updated);
  })
);
router.delete(
  "/job-card-series/:id",
  requirePermission("settings", "DELETE"),
  asyncHandler(async (req, res) => {
    await prisma.prodJobCardSeries.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ ok: true });
  })
);

/* ----------------------------- Item Masters ------------------------------- */
router.post(
  "/item-masters",
  requirePermission("items", "ADD"),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1),
        category: z.string().min(1),
        designCode: z.string().optional(),
        targetPurity: z.string().min(1),
        estGrossWeight: z.number().nonnegative(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    const purity = await prisma.purityTier.findFirst({ where: { code: body.targetPurity } });
    if (!purity) throw badRequest("Unknown purity tier");
    let category = await prisma.category.findFirst({ where: { name: body.category } });
    if (!category) {
      const code = body.category.slice(0, 2).toUpperCase();
      category = await prisma.category.create({ data: { name: body.category, code: `${code}-${Date.now().toString().slice(-4)}` } });
    }
    const count = await prisma.product.count();
    const serialNo = `SLV-${String(count + 1).padStart(4, "0")}`;
    const p = await prisma.product.create({
      data: {
        serialNo,
        designName: body.name,
        categoryId: category.id,
        purityId: purity.id,
        grossWeightG: body.estGrossWeight,
        netWeightG: body.estGrossWeight,
        designCode: body.designCode ?? null,
        description: body.notes ?? null,
        createdById: req.user!.id,
      },
    });
    res.status(201).json({ id: p.id });
  })
);
router.patch(
  "/item-masters/:id",
  requirePermission("items", "UPDATE"),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().optional(),
        designCode: z.string().nullable().optional(),
        targetPurity: z.string().optional(),
        estGrossWeight: z.number().nonnegative().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    let purityId: string | undefined;
    if (body.targetPurity) {
      const purity = await prisma.purityTier.findFirst({ where: { code: body.targetPurity } });
      if (!purity) throw badRequest("Unknown purity tier");
      purityId = purity.id;
    }
    await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...(body.name != null ? { designName: body.name } : {}),
        ...(body.designCode !== undefined ? { designCode: body.designCode } : {}),
        ...(purityId ? { purityId } : {}),
        ...(body.estGrossWeight != null ? { grossWeightG: body.estGrossWeight, netWeightG: body.estGrossWeight } : {}),
        ...(body.notes !== undefined ? { description: body.notes } : {}),
      },
    });
    res.json({ ok: true });
  })
);

export default router;
