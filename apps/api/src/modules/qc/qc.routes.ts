import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";
import { badRequest, notFound } from "../../utils/httpError";
import { notify } from "../../services/notifications";

const router = Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = z.enum(["PENDING", "PASS", "FAIL", "REWORK_REQUIRED", "APPROVED"]).optional().parse(req.query.result);
    res.json(
      await prisma.qCInspection.findMany({
        where: result ? { result } : {},
        include: {
          order: { include: { product: { select: { serialNo: true, designName: true } } } },
          inspector: { select: { name: true } },
        },
        orderBy: { inspectedAt: "desc" },
      })
    );
  })
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const inspection = await prisma.qCInspection.findUnique({
      where: { id: req.params.id },
      include: { order: { include: { product: true, customer: true } }, inspector: true },
    });
    if (!inspection) throw notFound("QC inspection not found");
    res.json(inspection);
  })
);

const checklistItemSchema = z.object({ item: z.string(), pass: z.boolean(), note: z.string().optional() });
const createSchema = z.object({
  orderId: z.string().min(1),
  checklist: z.array(checklistItemSchema).min(1),
  result: z.enum(["PASS", "FAIL", "REWORK_REQUIRED", "APPROVED"]),
  remarks: z.string().optional(),
});

router.post(
  "/",
  requireRole("SUPER_ADMIN", "MANAGER", "PRODUCTION"),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: body.orderId }, include: { product: true } });
    if (!order) throw notFound("Order not found");

    const inspection = await prisma.qCInspection.create({
      data: {
        orderId: order.id,
        inspectorId: req.user!.id,
        checklistJson: body.checklist,
        result: body.result,
        remarks: body.remarks,
      },
    });

    const nextOrderStatus =
      body.result === "PASS" || body.result === "APPROVED" ? "READY" : order.status;
    if (nextOrderStatus !== order.status) {
      await prisma.order.update({ where: { id: order.id }, data: { status: nextOrderStatus } });
    }

    if (body.result === "FAIL" || body.result === "REWORK_REQUIRED") {
      await notify({
        role: "MANAGER",
        type: "QC_FAILED",
        title: `QC ${body.result === "FAIL" ? "failed" : "needs rework"} — ${order.product.serialNo}`,
        body: body.remarks ?? "See inspection checklist for details.",
        entityType: "Order",
        entityId: order.id,
      });
    }

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "QCInspection",
      entityId: inspection.id,
      after: inspection,
      ipAddress: req.ip ?? null,
    });

    res.status(201).json(inspection);
  })
);

export default router;
