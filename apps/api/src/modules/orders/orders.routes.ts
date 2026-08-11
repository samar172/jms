import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";
import { badRequest, notFound } from "../../utils/httpError";
import { generateOrderInvoicePdf } from "./invoice.service";

const router = Router();

const ORDER_STATUSES = [
  "CONFIRMED",
  "MATERIAL_PLANNING",
  "MATERIAL_ISSUED",
  "IN_PRODUCTION",
  "MATERIAL_RETURN",
  "RECONCILIATION",
  "ASSEMBLY",
  "QC",
  "READY",
  "DELIVERED",
] as const;

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const status = z.enum(ORDER_STATUSES).optional().parse(req.query.status);
    const search = z.string().optional().parse(req.query.search);
    res.json(
      await prisma.order.findMany({
        where: {
          ...(status ? { status } : {}),
          ...(search
            ? {
                OR: [
                  { orderNo: { contains: search, mode: "insensitive" as const } },
                  { product: { serialNo: { contains: search, mode: "insensitive" as const } } },
                  { customer: { name: { contains: search, mode: "insensitive" as const } } },
                ],
              }
            : {}),
        },
        include: {
          product: { select: { serialNo: true, designName: true } },
          customer: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      })
    );
  })
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        product: true,
        customer: true,
        estimate: { select: { id: true, netAmount: true, version: true } },
        jobCards: {
          include: {
            product: { select: { serialNo: true, designName: true } },
            stages: { include: { processStage: true, karigar: true }, orderBy: { sequenceOrder: "asc" } },
          },
        },
        assemblies: {
          include: { assembler: { select: { name: true } }, components: { include: { jobCard: { include: { product: true } } } } },
          orderBy: { createdAt: "desc" },
        },
        qcInspections: {
          include: { inspector: { select: { name: true } } },
          orderBy: { inspectedAt: "desc" },
        },
      },
    });
    if (!order) throw notFound("Order not found");
    res.json(order);
  })
);

router.get(
  "/:id/invoice",
  requireAuth,
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        product: true,
        customer: true,
        estimate: { include: { lines: { include: { purity: true, stoneType: true }, orderBy: { sortOrder: "asc" } } } },
      },
    });
    if (!order) throw notFound("Order not found");

    const pdfBuffer = await generateOrderInvoicePdf(order);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Invoice-${order.orderNo}.pdf`);
    res.send(pdfBuffer);
  })
);

const updateSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  expectedDeliveryDate: z.coerce.date().optional(),
});

router.patch(
  "/:id",
  requireRole("SUPER_ADMIN", "MANAGER", "SALES", "PRODUCTION"),
  asyncHandler(async (req, res) => {
    const before = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound("Order not found");
    const body = updateSchema.parse(req.body);

    if (body.status === "DELIVERED" && before.status !== "DELIVERED") {
      if (Number(before.advanceReceived) < Number(before.approvedAmount)) {
        throw badRequest("Cannot mark as delivered while balance is still outstanding");
      }
    }

    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: {
        ...body,
        deliveredAt: body.status === "DELIVERED" && before.status !== "DELIVERED" ? new Date() : undefined,
      },
    });

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "Order",
      entityId: order.id,
      before,
      after: order,
      ipAddress: req.ip ?? null,
    });

    res.json(order);
  })
);

// Records a payment against this order's balance. Mirrors it onto the
// customer ledger as a real, append-only CustomerLedgerEntry rather than
// just bumping a number on the Order row — the ledger stays the single
// source of truth for money, same as everywhere else in the app (BR-13).
const recordPaymentSchema = z.object({ amount: z.number().positive() });

router.post(
  "/:id/payments",
  requireRole("SUPER_ADMIN", "MANAGER", "SALES", "COSTING"),
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) throw notFound("Order not found");
    const { amount } = recordPaymentSchema.parse(req.body);

    const [updated, ledgerEntry] = await prisma.$transaction([
      prisma.order.update({
        where: { id: order.id },
        data: { advanceReceived: { increment: amount } },
      }),
      prisma.customerLedgerEntry.create({
        data: {
          customerId: order.customerId,
          type: "PAYMENT_RECEIVED",
          amount,
          referenceType: "Order",
          referenceId: order.id,
          note: `Payment against ${order.orderNo}`,
          createdById: req.user!.id,
        },
      }),
    ]);

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "CustomerLedgerEntry",
      entityId: ledgerEntry.id,
      after: ledgerEntry,
      ipAddress: req.ip ?? null,
    });

    // Also surface this on the Order's own timeline, not just the customer ledger.
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "Order",
      entityId: order.id,
      before: order,
      after: updated,
      ipAddress: req.ip ?? null,
    });

    res.json(updated);
  })
);

// Link an existing (unassigned) JobCard to this order — used for
// multi-component orders where each component's JobCard is created
// separately and then attached here for Assembly to gather them back up.
const linkJobCardSchema = z.object({ jobCardId: z.string().min(1) });

router.post(
  "/:id/job-cards",
  requireRole("SUPER_ADMIN", "MANAGER", "PRODUCTION"),
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) throw notFound("Order not found");
    const { jobCardId } = linkJobCardSchema.parse(req.body);
    const jobCard = await prisma.jobCard.findUnique({ where: { id: jobCardId } });
    if (!jobCard) throw notFound("Job card not found");
    if (jobCard.orderId) throw badRequest("This job card is already linked to an order");

    const updated = await prisma.jobCard.update({ where: { id: jobCardId }, data: { orderId: order.id } });

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
