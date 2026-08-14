import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";

const router = Router();

// --- Get Cash & Bank Ledger (FR-6.04) ---------------------------------------
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(50),
        account: z.enum(["CASH", "BANK"]).optional(),
      })
      .parse(req.query);

    const where = q.account ? { account: q.account } : {};

    const [items, total] = await Promise.all([
      prisma.cashBankLedgerEntry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.cashBankLedgerEntry.count({ where }),
    ]);

    // Calculate running balance for the current view (simplistic)
    // A robust system would calculate balance chronologically.
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  })
);

// --- Post Entry (FR-6.04) ---------------------------------------------------
const postEntrySchema = z.object({
  account: z.enum(["CASH", "BANK"]),
  entryType: z.enum(["INVOICE_PAID", "KARIGAR_PAYMENT", "ADVANCE_RECEIVED", "PURCHASE", "MANUAL"]).default("MANUAL"),
  direction: z.enum(["IN", "OUT"]),
  amount: z.number().positive(),
  description: z.string().min(1),
  note: z.string().optional(),
});

router.post(
  "/",
  requireRole("SUPER_ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const body = postEntrySchema.parse(req.body);

    const entry = await prisma.cashBankLedgerEntry.create({
      data: {
        account: body.account,
        entryType: body.entryType,
        description: body.description,
        inAmount: body.direction === "IN" ? body.amount : 0,
        outAmount: body.direction === "OUT" ? body.amount : 0,
        note: body.note,
        createdById: req.user!.id,
      },
    });

    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "CashBankLedgerEntry",
      entityId: entry.id,
      after: entry,
      ipAddress: req.ip ?? null,
    });

    res.status(201).json(entry);
  })
);

export default router;
