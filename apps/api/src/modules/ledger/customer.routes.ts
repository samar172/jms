import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../../db";
import { requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";
import { notFound } from "../../utils/httpError";
import { round2 } from "@jms/shared";

const router = Router();

function balanceOf(entries: { type: string; amount: unknown }[]) {
  // Positive balance = customer owes the business money.
  return round2(
    entries.reduce((sum, e) => {
      const amt = Number(e.amount);
      if (e.type === "INVOICE_RAISED") return sum + amt;
      if (e.type === "ADVANCE_RECEIVED" || e.type === "PAYMENT_RECEIVED") return sum - amt;
      return sum + amt; // ADJUSTMENT: signed by the user when recorded
    }, 0)
  );
}

router.get(
  "/",
  requireRole("SUPER_ADMIN", "MANAGER", "COSTING", "SALES", "AUDITOR"),
  asyncHandler(async (_req, res) => {
    const customers = await prisma.customer.findMany({
      where: { isActive: true },
      include: { ledgerEntries: true },
      orderBy: { name: "asc" },
    });
    res.json(
      customers.map((c) => ({
        id: c.id,
        name: c.name,
        contact: c.contact,
        balanceDue: balanceOf(c.ledgerEntries),
      }))
    );
  })
);

// --- Full customer profile/dashboard: purchase history, designs, job cards,
// costing history, estimates, balance and payment history in one call.
router.get(
  "/:id/profile",
  requireRole("SUPER_ADMIN", "MANAGER", "COSTING", "SALES", "AUDITOR"),
  asyncHandler(async (req, res) => {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: {
        products: {
          orderBy: { createdAt: "desc" },
          include: {
            category: true,
            purity: true,
            images: { where: { isActive: true, isPrimary: true }, take: 1 },
            jobCards: {
              orderBy: { createdAt: "desc" },
              include: { stages: { include: { processStage: true, karigar: true }, orderBy: { sequenceOrder: "asc" } } },
            },
          },
        },
        // Estimates are matched to this customer directly (Estimate.customerId),
        // not via the product they're for — the same design can be re-estimated
        // for different prospective customers, so product.estimates would miss
        // (or wrongly include) rows here.
        estimates: {
          orderBy: [{ createdAt: "desc" }],
          include: { product: { select: { serialNo: true, designName: true } } },
        },
        ledgerEntries: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!customer) throw notFound("Customer not found");
    res.json({ ...customer, balanceDue: balanceOf(customer.ledgerEntries) });
  })
);

router.get(
  "/:id/ledger",
  requireRole("SUPER_ADMIN", "MANAGER", "COSTING", "SALES", "AUDITOR"),
  asyncHandler(async (req, res) => {
    const entries = await prisma.customerLedgerEntry.findMany({
      where: { customerId: req.params.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ entries, balanceDue: balanceOf(entries) });
  })
);

const entrySchema = z.object({
  type: z.enum(["ADVANCE_RECEIVED", "PAYMENT_RECEIVED", "ADJUSTMENT"]),
  amount: z.number().positive(),
  note: z.string().optional(),
});

router.post(
  "/:id/ledger",
  requireRole("SUPER_ADMIN", "MANAGER", "COSTING", "SALES"),
  asyncHandler(async (req, res) => {
    const body = entrySchema.parse(req.body);
    const entry = await prisma.customerLedgerEntry.create({
      data: {
        customerId: req.params.id,
        type: body.type,
        amount: body.amount,
        referenceType: "Manual",
        referenceId: crypto.randomUUID(),
        note: body.note,
        createdById: req.user!.id,
      },
    });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "CustomerLedgerEntry",
      entityId: entry.id,
      after: entry,
      ipAddress: req.ip ?? null,
    });
    res.status(201).json(entry);
  })
);

export default router;
