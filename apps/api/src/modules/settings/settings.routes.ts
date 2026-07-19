import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { getSetting, setSetting } from "../../services/settings";
import { recordAudit } from "../../services/audit";
import { prisma } from "../../db";

const router = Router();

// Read is available to any authenticated user — the frontend needs to know
// whether to show the Store Stock Ledger nav item at all.
router.get(
  "/stock-ledger-enabled",
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({ enabled: (await getSetting("stockLedgerEnabled")) === "true" });
  })
);

const toggleSchema = z.object({ enabled: z.boolean() });

router.put(
  "/stock-ledger-enabled",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const { enabled } = toggleSchema.parse(req.body);
    await setSetting("stockLedgerEnabled", String(enabled));
    await recordAudit(prisma, {
      userId: req.user!.id,
      action: "UPDATE",
      entityType: "AppSetting",
      entityId: "stockLedgerEnabled",
      after: { enabled },
      ipAddress: req.ip ?? null,
    });
    res.json({ enabled });
  })
);

export default router;
