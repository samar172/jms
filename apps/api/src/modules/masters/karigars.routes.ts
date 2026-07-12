import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";
import { canSeeCost } from "@jms/shared";
import { notFound } from "../../utils/httpError";

const router = Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const karigars = await prisma.karigar.findMany({
      where: { isActive: true },
      include: { stageRates: true },
      orderBy: { name: "asc" },
    });
    const visible = canSeeCost(req.user!.role);
    res.json(
      visible
        ? karigars
        : karigars.map(({ stageRates: _rates, ...rest }) => rest)
    );
  })
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const karigar = await prisma.karigar.findUnique({
      where: { id: req.params.id },
      include: { stageRates: { include: { processStage: true } } },
    });
    if (!karigar) throw notFound("Karigar not found");
    const visible = canSeeCost(req.user!.role);
    res.json(visible ? karigar : { ...karigar, stageRates: undefined });
  })
);

const stageRateSchema = z.object({
  processStageId: z.string().min(1),
  rateBasis: z.enum(["PER_GRAM", "PER_PIECE", "PER_CARAT", "DAILY_WAGE"]),
  rate: z.number().nonnegative(),
});

const createSchema = z.object({
  name: z.string().min(1),
  photoUrl: z.string().optional(),
  contactNumber: z.string().optional(),
  address: z.string().optional(),
  specialization: z.string().optional(),
  employmentType: z.enum(["IN_HOUSE", "EXTERNAL"]),
  stageRates: z.array(stageRateSchema).default([]),
});

async function nextKarigarCode(): Promise<string> {
  const count = await prisma.karigar.count();
  return `KR-${String(count + 1).padStart(3, "0")}`;
}

router.post(
  "/",
  requireRole("SUPER_ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const code = await nextKarigarCode();
    const karigar = await prisma.karigar.create({
      data: {
        code,
        name: body.name,
        photoUrl: body.photoUrl,
        contactNumber: body.contactNumber,
        address: body.address,
        specialization: body.specialization,
        employmentType: body.employmentType,
        stageRates: { create: body.stageRates },
      },
      include: { stageRates: true },
    });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "Karigar",
      entityId: karigar.id,
      after: karigar,
      ipAddress: req.ip ?? null,
    });
    res.status(201).json(karigar);
  })
);

router.patch(
  "/:id",
  requireRole("SUPER_ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const before = await prisma.karigar.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound("Karigar not found");
    const body = createSchema.partial().extend({ isActive: z.boolean().optional() }).parse(req.body);
    const { stageRates, ...rest } = body;
    const karigar = await prisma.karigar.update({
      where: { id: req.params.id },
      data: rest,
    });
    if (stageRates) {
      await prisma.karigarStageRate.deleteMany({ where: { karigarId: karigar.id } });
      await prisma.karigarStageRate.createMany({
        data: stageRates.map((r) => ({ ...r, karigarId: karigar.id })),
      });
    }
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "Karigar",
      entityId: karigar.id,
      before,
      after: karigar,
      ipAddress: req.ip ?? null,
    });
    res.json(karigar);
  })
);

export default router;
