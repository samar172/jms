import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";
import { badRequest, notFound } from "../../utils/httpError";
import { nextVoucherNumber } from "../../services/voucherNumber";

const router = Router();

// --- Ready to Invoice (FR-6.01) ---------------------------------------------
router.get(
  "/ready-to-invoice",
  requireAuth,
  asyncHandler(async (req, res) => {
    // A job is ready to invoice if it has been dispatched, but either
    // has no Order yet, or the Order doesn't have an invoiceNo.
    const jobCards = await prisma.jobCard.findMany({
      where: {
        dispatchedAt: { not: null },
        OR: [
          { orderId: null },
          { order: { invoiceNo: null } },
        ],
      },
      include: {
        product: { include: { images: { where: { isPrimary: true }, take: 1 } } },
        customer: true,
        estimate: true,
      },
      orderBy: { dispatchedAt: "desc" },
    });
    res.json(jobCards);
  })
);

// --- Create Invoice from Actuals (FR-6.02) -----------------------------------
// This takes a Final Costing estimate and turns it into an Invoice, posting
// the necessary ledger entries.
const createInvoiceSchema = z.object({
  estimateId: z.string().min(1),
  // Client calculates actual totals on the Final Costing screen, server trusts
  // them here (in a real system, the server should re-calculate).
  invoiceAmount: z.number().positive(),
  invoiceGstAmt: z.number().nonnegative(),
  invoiceNetAmt: z.number().positive(),
});

router.post(
  "/:jobCardId/create-invoice",
  requireRole("SUPER_ADMIN", "MANAGER", "SALES"),
  asyncHandler(async (req, res) => {
    const jobCard = await prisma.jobCard.findUnique({
      where: { id: req.params.jobCardId },
      include: { order: true, estimate: true, product: true },
    });
    if (!jobCard) throw notFound("Job card not found");
    if (!jobCard.dispatchedAt) throw badRequest("Job card must be dispatched before invoicing");

    const body = createInvoiceSchema.parse(req.body);

    const estimate = await prisma.estimate.findUnique({ where: { id: body.estimateId } });
    if (!estimate) throw notFound("Estimate not found");
    if (estimate.type !== "FINAL_COSTING") throw badRequest("Must invoice from a Final Costing estimate");
    if (!estimate.customerId) throw badRequest("Estimate must have a customer");

    // If there isn't an order already, we create one. If there is, we update it.
    const invoiceNo = await nextVoucherNumber("INV");
    const invoicedAt = new Date();

    let order = jobCard.order;
    if (!order) {
      const orderNo = await nextVoucherNumber("JOB");
      order = await prisma.order.create({
        data: {
          orderNo,
          productId: jobCard.productId,
          estimateId: estimate.id,
          customerId: estimate.customerId,
          approvedAmount: body.invoiceAmount,
          invoiceNo,
          invoicedAt,
          invoiceAmount: body.invoiceAmount,
          invoiceGstAmt: body.invoiceGstAmt,
          invoiceNetAmt: body.invoiceNetAmt,
          createdById: req.user!.id,
          status: "DELIVERED",
        },
      });
      // Link the job card to the new order
      await prisma.jobCard.update({
        where: { id: jobCard.id },
        data: { orderId: order.id },
      });
    } else {
      if (order.invoiceNo) throw badRequest("This order is already invoiced");
      order = await prisma.order.update({
        where: { id: order.id },
        data: {
          invoiceNo,
          invoicedAt,
          invoiceAmount: body.invoiceAmount,
          invoiceGstAmt: body.invoiceGstAmt,
          invoiceNetAmt: body.invoiceNetAmt,
          status: "DELIVERED",
        },
      });
    }

    // Post to Customer Ledger
    await prisma.customerLedgerEntry.create({
      data: {
        customerId: estimate.customerId,
        type: "INVOICE_RAISED",
        amount: body.invoiceNetAmt,
        referenceType: "Order",
        referenceId: order.id,
        note: `Invoice raised — ${invoiceNo}`,
        createdById: req.user!.id,
      },
    });

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "Order",
      entityId: order.id,
      after: order,
      ipAddress: req.ip ?? null,
    });

    res.json(order);
  })
);

// --- List Invoices (FR-6.03) -------------------------------------------------
router.get(
  "/invoices",
  requireAuth,
  asyncHandler(async (req, res) => {
    const search = z.string().optional().parse(req.query.search);
    const invoices = await prisma.order.findMany({
      where: {
        invoiceNo: { not: null },
        ...(search
          ? {
              OR: [
                { invoiceNo: { contains: search, mode: "insensitive" as const } },
                { orderNo: { contains: search, mode: "insensitive" as const } },
                { customer: { name: { contains: search, mode: "insensitive" as const } } },
                { product: { serialNo: { contains: search, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      },
      include: {
        product: { select: { serialNo: true, designName: true } },
        customer: { select: { id: true, name: true } },
        jobCards: { select: { id: true, dispatchMode: true, dispatchTracking: true } },
      },
      orderBy: { invoicedAt: "desc" },
      take: 200,
    });
    res.json(invoices);
  })
);

export default router;
