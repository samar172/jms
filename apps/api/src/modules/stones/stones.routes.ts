import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";
import { badRequest, notFound } from "../../utils/httpError";
import { nextVoucherNumber } from "../../services/voucherNumber";

const router = Router();

const CODE_PREFIX: Record<string, string> = { DIAMOND: "DIA", POLKI: "POL", COLOURED_STONE: "CS" };

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const status = z.enum(["IN_STOCK", "ISSUED", "RETURNED", "SET", "SOLD"]).optional().parse(req.query.status);
    const search = z.string().optional().parse(req.query.search);
    res.json(
      await prisma.stone.findMany({
        where: {
          ...(status ? { status } : {}),
          ...(search ? { stoneCode: { contains: search, mode: "insensitive" as const } } : {}),
        },
        include: {
          stoneType: { select: { name: true, category: true } },
          currentKarigar: { select: { id: true, name: true } },
          currentJobStage: {
            select: { jobCard: { select: { product: { select: { serialNo: true } } } } },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 300,
      })
    );
  })
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const stone = await prisma.stone.findUnique({
      where: { id: req.params.id },
      include: {
        stoneType: true,
        vendor: true,
        currentKarigar: true,
        currentJobStage: { include: { jobCard: { include: { product: true } } } },
        movements: {
          include: { karigar: { select: { name: true } }, createdBy: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!stone) throw notFound("Stone not found");
    res.json(stone);
  })
);

const createSchema = z.object({
  stoneTypeId: z.string().min(1),
  shape: z.string().optional(),
  caratWeight: z.number().positive(),
  colour: z.string().optional(),
  clarity: z.string().optional(),
  certification: z.string().optional(),
  purchaseCost: z.number().nonnegative().optional(),
  vendorId: z.string().optional(),
});

router.post(
  "/",
  requireRole("SUPER_ADMIN", "MANAGER", "STORE"),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const stoneType = await prisma.stoneType.findUnique({ where: { id: body.stoneTypeId } });
    if (!stoneType) throw badRequest("Unknown stone type");

    const stoneCode = await nextVoucherNumber(CODE_PREFIX[stoneType.category] ?? "ST");

    const stone = await prisma.stone.create({
      data: { ...body, stoneCode, createdById: req.user!.id },
    });

    await prisma.stoneMovement.create({
      data: {
        stoneId: stone.id,
        type: "PURCHASE",
        note: body.vendorId ? "Purchased" : "Added to stock",
        createdById: req.user!.id,
      },
    });

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "Stone",
      entityId: stone.id,
      after: stone,
      ipAddress: req.ip ?? null,
    });

    res.status(201).json(stone);
  })
);

const issueSchema = z.object({ jobStageId: z.string().min(1), karigarId: z.string().min(1) });

router.post(
  "/:id/issue",
  requireRole("SUPER_ADMIN", "MANAGER", "STORE"),
  asyncHandler(async (req, res) => {
    const stone = await prisma.stone.findUnique({ where: { id: req.params.id } });
    if (!stone) throw notFound("Stone not found");
    if (stone.status !== "IN_STOCK") throw badRequest(`Stone is currently ${stone.status.replace(/_/g, " ").toLowerCase()}, not in stock`);

    const { jobStageId, karigarId } = issueSchema.parse(req.body);
    const [updated] = await prisma.$transaction([
      prisma.stone.update({
        where: { id: stone.id },
        data: { status: "ISSUED", currentJobStageId: jobStageId, currentKarigarId: karigarId },
      }),
      prisma.stoneMovement.create({
        data: { stoneId: stone.id, type: "ISSUE", jobStageId, karigarId, createdById: req.user!.id },
      }),
    ]);

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "Stone",
      entityId: stone.id,
      before: stone,
      after: updated,
      ipAddress: req.ip ?? null,
    });

    res.json(updated);
  })
);

const returnSchema = z.object({ outcome: z.enum(["RETURNED", "SET"]), note: z.string().optional() });

router.post(
  "/:id/return",
  requireRole("SUPER_ADMIN", "MANAGER", "STORE"),
  asyncHandler(async (req, res) => {
    const stone = await prisma.stone.findUnique({ where: { id: req.params.id } });
    if (!stone) throw notFound("Stone not found");
    if (stone.status !== "ISSUED") throw badRequest("Stone is not currently issued to a karigar");

    const { outcome, note } = returnSchema.parse(req.body);
    const [updated] = await prisma.$transaction([
      prisma.stone.update({
        where: { id: stone.id },
        data: {
          status: outcome,
          currentJobStageId: outcome === "SET" ? stone.currentJobStageId : null,
          currentKarigarId: null,
        },
      }),
      prisma.stoneMovement.create({
        data: {
          stoneId: stone.id,
          type: outcome === "SET" ? "SET" : "RETURN",
          jobStageId: stone.currentJobStageId,
          karigarId: stone.currentKarigarId,
          note,
          createdById: req.user!.id,
        },
      }),
    ]);

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "Stone",
      entityId: stone.id,
      before: stone,
      after: updated,
      ipAddress: req.ip ?? null,
    });

    res.json(updated);
  })
);

export default router;
