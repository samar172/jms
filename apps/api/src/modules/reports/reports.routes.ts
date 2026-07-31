import { Router } from "express";
import { prisma } from "../../db";
import { requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

const router = Router();

// Only Managers, Store, and Costing roles can view reports
router.use(requireRole("SUPER_ADMIN", "MANAGER", "STORE", "COSTING", "AUDITOR"));

// R-02: Metal Position (Gold Ledger)
router.get(
  "/metal-position",
  asyncHandler(async (_req, res) => {
    // Current fine gold held by all karigars
    const karigarLedger = await prisma.karigarLedgerEntry.groupBy({
      by: ["type"],
      _sum: { fineGoldG: true },
    });
    
    let goldWithKarigars = 0;
    for (const group of karigarLedger) {
      const val = Number(group._sum.fineGoldG || 0);
      if (group.type === "METAL_DEBIT") goldWithKarigars += val;
      if (group.type === "METAL_CREDIT") goldWithKarigars -= val;
    }

    // Current stock in store (if Stock Ledger is enabled)
    const stockLedger = await prisma.stockLedgerEntry.groupBy({
      by: ["direction"],
      where: { materialType: "GOLD" },
      _sum: { quantity: true },
    });

    let stockInStore = 0;
    for (const group of stockLedger) {
      const val = Number(group._sum.quantity || 0);
      if (group.direction === "IN") stockInStore += val;
      if (group.direction === "OUT") stockInStore -= val;
    }

    res.json({
      goldWithKarigars: Math.round(goldWithKarigars * 1000) / 1000,
      stockInStore: Math.round(stockInStore * 1000) / 1000,
      totalSystemGold: Math.round((goldWithKarigars + stockInStore) * 1000) / 1000,
    });
  })
);

// R-03: Karigar Metal Outstanding
router.get(
  "/karigar-outstanding",
  asyncHandler(async (_req, res) => {
    const karigars = await prisma.karigar.findMany({
      include: { ledgerEntries: true }
    });

    const outstanding = karigars.map((k) => {
      let balance = 0;
      let lastIssueDate: Date | null = null;
      for (const entry of k.ledgerEntries) {
        if (entry.type === "METAL_DEBIT") {
          balance += Number(entry.fineGoldG || 0);
          if (!lastIssueDate || entry.createdAt > lastIssueDate) {
            lastIssueDate = entry.createdAt;
          }
        }
        if (entry.type === "METAL_CREDIT") {
          balance -= Number(entry.fineGoldG || 0);
        }
      }
      return {
        karigarId: k.id,
        karigarName: k.name,
        balance: Math.round(balance * 1000) / 1000,
        lastIssueDate,
      };
    });

    // Filter to only those with non-zero balances (or negative balances)
    res.json(outstanding.filter(o => Math.abs(o.balance) > 0.001).sort((a, b) => b.balance - a.balance));
  })
);

// R-05: Dust Collection & Refining Recovery
router.get(
  "/dust-recovery",
  asyncHandler(async (_req, res) => {
    const lots = await prisma.dustLot.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    
    let totalDustSent = 0;
    let totalGoldRecovered = 0;

    const formattedLots = lots.map((lot) => {
      if (lot.status === "RECEIVED") {
        totalDustSent += Number(lot.totalDustWeightG);
        totalGoldRecovered += Number(lot.recoveredPureGoldG);
      }
      return {
        id: lot.id,
        lotNo: lot.lotNo,
        status: lot.status,
        dustWeightG: Number(lot.totalDustWeightG),
        recoveredPureGoldG: Number(lot.recoveredPureGoldG),
        recoveryPct: Number(lot.recoveryPct),
        createdAt: lot.createdAt,
      };
    });

    const avgRecoveryPct = totalDustSent > 0 ? (totalGoldRecovered / totalDustSent) * 100 : 0;

    res.json({
      summary: {
        totalDustSent: Math.round(totalDustSent * 1000) / 1000,
        totalGoldRecovered: Math.round(totalGoldRecovered * 1000) / 1000,
        avgRecoveryPct: Math.round(avgRecoveryPct * 100) / 100,
      },
      lots: formattedLots,
    });
  })
);

// R-08: Product Costing & Margin
router.get(
  "/product-margin",
  requireRole("SUPER_ADMIN", "MANAGER", "COSTING"),
  asyncHandler(async (_req, res) => {
    const finalEstimates = await prisma.estimate.findMany({
      where: { type: "FINAL_COSTING", status: "APPROVED" },
      include: { product: true },
      orderBy: { approvedAt: "desc" },
      take: 100,
    });

    const margins = finalEstimates.map(est => ({
      estimateId: est.id,
      serialNo: est.product.serialNo,
      designName: est.product.designName,
      cost: Number(est.cost),
      profit: Number(est.profit),
      netAmount: Number(est.netAmount),
      profitPct: Number(est.profitPct),
      approvedAt: est.approvedAt,
    }));

    const totalCost = margins.reduce((sum, m) => sum + m.cost, 0);
    const totalProfit = margins.reduce((sum, m) => sum + m.profit, 0);
    const avgProfitPct = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

    res.json({
      summary: {
        totalCost: Math.round(totalCost * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        avgProfitPct: Math.round(avgProfitPct * 100) / 100,
      },
      estimates: margins,
    });
  })
);

export default router;
