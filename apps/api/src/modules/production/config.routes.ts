/**
 * Chowker settings + masters writes: base rate, default rates, purity tiers,
 * karigars, item masters. Backs the Settings / Karigar / Item Master screens.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { badRequest } from "../../utils/httpError";

const router = Router();
const ADMIN = ["SUPER_ADMIN", "MANAGER"] as const;

/* ------------------------------- Settings --------------------------------- */
router.patch(
  "/settings",
  requireRole(...ADMIN),
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
  requireRole(...ADMIN),
  asyncHandler(async (req, res) => {
    const body = tierSchema.parse(req.body);
    const t = await prisma.purityTier.create({ data: { code: body.label, percent: body.percent, purityFactor: body.percent / 100 } });
    res.status(201).json(t);
  })
);
router.patch(
  "/purity-tiers/:id",
  requireRole(...ADMIN),
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
  requireRole(...ADMIN),
  asyncHandler(async (req, res) => {
    // Soft-remove — a tier may be referenced by history; hide it from pickers.
    await prisma.purityTier.update({ where: { id: req.params.id }, data: { isActive: false } });
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
});
router.post(
  "/karigars",
  requireRole(...ADMIN),
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
      },
    });
    res.status(201).json({ id: k.id });
  })
);
router.patch(
  "/karigars/:id",
  requireRole(...ADMIN),
  asyncHandler(async (req, res) => {
    const body = karigarSchema.partial().parse(req.body);
    await prisma.karigar.update({
      where: { id: req.params.id },
      data: {
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.specialization != null ? { specialization: body.specialization } : {}),
        ...(body.contact !== undefined ? { contactNumber: body.contact } : {}),
        ...(body.defaultWastagePct !== undefined ? { defaultWastagePct: body.defaultWastagePct } : {}),
        ...(body.defaultRatePerGm !== undefined ? { defaultRatePerGm: body.defaultRatePerGm } : {}),
        ...(body.defaultFlatLabour !== undefined ? { defaultFlatLabour: body.defaultFlatLabour } : {}),
      },
    });
    res.json({ ok: true });
  })
);

/* ----------------------------- Item Masters ------------------------------- */
router.post(
  "/item-masters",
  requireRole(...ADMIN),
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

export default router;
