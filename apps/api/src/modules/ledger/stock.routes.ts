import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../../db";
import { requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { recordAudit } from "../../services/audit";
import { forbidden } from "../../utils/httpError";
import { isStockLedgerEnabled } from "../../services/settings";
import { round3 } from "@jms/shared";

const router = Router();

router.use(
  asyncHandler(async (_req, _res, next) => {
    if (!(await isStockLedgerEnabled())) {
      throw forbidden(
        "The Store Stock Ledger module is switched off. A Super Admin can enable it in Settings."
      );
    }
    next();
  })
);

// FR-4.05: opening/inward/outward/closing balance per material, for any date range.
router.get(
  "/balances",
  requireRole("SUPER_ADMIN", "MANAGER", "STORE", "COSTING", "AUDITOR"),
  asyncHandler(async (req, res) => {
    const asOf = z.coerce.date().optional().parse(req.query.asOf);
    const entries = await prisma.stockLedgerEntry.findMany({
      where: asOf ? { createdAt: { lte: asOf } } : undefined,
      include: { purity: true, stoneType: true },
    });

    const key = (e: (typeof entries)[number]) =>
      `${e.materialType}:${e.purityId ?? ""}:${e.stoneTypeId ?? ""}`;

    const balances = new Map<
      string,
      { materialType: string; purity?: string; stoneType?: string; balance: number }
    >();

    for (const e of entries) {
      const k = key(e);
      const existing = balances.get(k) ?? {
        materialType: e.materialType,
        purity: e.purity?.code,
        stoneType: e.stoneType?.name,
        balance: 0,
      };
      existing.balance += e.direction === "IN" ? Number(e.quantity) : -Number(e.quantity);
      balances.set(k, existing);
    }

    res.json(
      Array.from(balances.values()).map((b) => ({ ...b, balance: round3(b.balance) }))
    );
  })
);

router.get(
  "/entries",
  requireRole("SUPER_ADMIN", "MANAGER", "STORE", "COSTING", "AUDITOR"),
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        materialType: z.enum(["GOLD", "POLKI", "COLOURED_STONE", "FINDING"]).optional(),
        purityId: z.string().optional(),
        stoneTypeId: z.string().optional(),
      })
      .parse(req.query);
    res.json(
      await prisma.stockLedgerEntry.findMany({
        where: {
          ...(q.materialType && { materialType: q.materialType }),
          ...(q.purityId && { purityId: q.purityId }),
          ...(q.stoneTypeId && { stoneTypeId: q.stoneTypeId }),
        },
        include: { purity: true, stoneType: true, vendor: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      })
    );
  })
);

// FR-4.06: purchases from a vendor, updating store stock.
const purchaseSchema = z.object({
  materialType: z.enum(["GOLD", "POLKI", "COLOURED_STONE", "FINDING"]),
  purityId: z.string().optional(),
  stoneTypeId: z.string().optional(),
  quantity: z.number().positive(),
  vendorId: z.string().optional(),
  rate: z.number().nonnegative().optional(),
  note: z.string().optional(),
});

router.post(
  "/purchases",
  requireRole("SUPER_ADMIN", "MANAGER", "STORE"),
  asyncHandler(async (req, res) => {
    const body = purchaseSchema.parse(req.body);
    const entry = await prisma.stockLedgerEntry.create({
      data: {
        materialType: body.materialType,
        purityId: body.purityId,
        stoneTypeId: body.stoneTypeId,
        direction: "IN",
        quantity: body.quantity,
        vendorId: body.vendorId,
        rate: body.rate,
        referenceType: "Purchase",
        referenceId: crypto.randomUUID(),
        note: body.note,
        createdById: req.user!.id,
      },
    });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "StockLedgerEntry",
      entityId: entry.id,
      after: entry,
      ipAddress: req.ip ?? null,
    });
    res.status(201).json(entry);
  })
);

// Manual correction / opening balance entry — always requires a note.
const adjustmentSchema = z.object({
  materialType: z.enum(["GOLD", "POLKI", "COLOURED_STONE", "FINDING"]),
  purityId: z.string().optional(),
  stoneTypeId: z.string().optional(),
  direction: z.enum(["IN", "OUT"]),
  quantity: z.number().positive(),
  note: z.string().min(1, "A reason is required for a manual stock adjustment"),
});

router.post(
  "/adjustments",
  requireRole("SUPER_ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const body = adjustmentSchema.parse(req.body);
    const entry = await prisma.stockLedgerEntry.create({
      data: {
        materialType: body.materialType,
        purityId: body.purityId,
        stoneTypeId: body.stoneTypeId,
        direction: body.direction,
        quantity: body.quantity,
        referenceType: "Adjustment",
        referenceId: crypto.randomUUID(),
        note: body.note,
        createdById: req.user!.id,
      },
    });
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "CREATE",
      entityType: "StockLedgerEntry",
      entityId: entry.id,
      after: entry,
      ipAddress: req.ip ?? null,
    });
    res.status(201).json(entry);
  })
);

export default router;
