import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { canSeeCost } from "@jms/shared";

const router = Router();

function startOfMonth(date = new Date()) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfYear(date = new Date()) {
  const d = new Date(date);
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Comprehensive analytics dashboard data
router.get(
  "/owner",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!canSeeCost(req.user!.role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const now = new Date();
    const monthStart = startOfMonth(now);

    const [
      jobs,
      materialReceipts,
      karigarLedger,
      customerLedger,
      stockLedger,
      wastageExceptions,
      overReconciliations,
      invoices,
    ] = await Promise.all([
      prisma.jobCard.findMany({
        where: { status: { not: "CLOSED" } },
        include: { stages: { include: { processStage: true } } },
      }),
      prisma.materialReceipt.findMany({
        where: { receivedAt: { gte: monthStart }, isReversed: false },
        select: { chizzatPct: true, chizzatWeightG: true },
      }),
      prisma.karigarLedgerEntry.findMany(),
      prisma.customerLedgerEntry.findMany(),
      prisma.stockLedgerEntry.findMany({ where: { materialType: "SILVER" } }),
      prisma.wastageRecord.findMany({
        where: { exceptionStatus: "PENDING" },
        include: { jobStage: { include: { jobCard: { include: { product: true } } } } },
      }),
      prisma.materialReceipt.findMany({
        where: { overAccounted: true, isReversed: false },
        include: { jobStage: { include: { jobCard: { include: { product: true } } } } },
      }),
      prisma.order.findMany({ where: { invoiceNo: { not: null } } }),
    ]);

    // 1. Gold in Stock
    const goldInStockG = stockLedger.reduce(
      (sum, e) => sum + (e.direction === "IN" ? Number(e.quantity) : -Number(e.quantity)),
      0
    );

    // 2. Gold with Karigars
    const goldWithKarigarsG = karigarLedger.reduce(
      (sum, e) =>
        sum + (e.type === "METAL_DEBIT" ? Number(e.fineGoldG ?? 0) : e.type === "METAL_CREDIT" ? -Number(e.fineGoldG ?? 0) : 0),
      0
    );

    // 3. Jobs in Production & Overdue
    const jobsInProduction = jobs.length;
    const overdueJobs = jobs.filter((j) => j.targetDeliveryDate && j.targetDeliveryDate < now).length;

    // 4. Receivable (Customers)
    const receivable = customerLedger.reduce((sum, e) => {
      if (e.type === "INVOICE_RAISED") return sum + Number(e.amount);
      if (e.type === "PAYMENT_RECEIVED") return sum - Number(e.amount);
      return sum;
    }, 0);

    // 5. Payable to Karigars
    const payableToKarigars = karigarLedger.reduce((sum, e) => {
      if (e.type === "LABOUR_EARNED") return sum + Number(e.amount ?? 0);
      if (e.type === "ADVANCE_PAID" || e.type === "WASTAGE_RECOVERY") return sum - Number(e.amount ?? 0);
      if (e.type === "ADVANCE_ADJUSTED") return sum + Number(e.amount ?? 0); // Re-adds to payable since advance is adjusted
      return sum;
    }, 0);

    // 6. Wastage Stats
    const totalChizzatG = materialReceipts.reduce((sum, r) => sum + Number(r.chizzatWeightG ?? 0), 0);
    const avgChizzatPct =
      materialReceipts.length > 0
        ? materialReceipts.reduce((sum, r) => sum + Number(r.chizzatPct ?? 0), 0) / materialReceipts.length
        : 0;

    // 7. Stage-wise Pipeline
    const pipeline: Record<string, number> = {};
    jobs.forEach((j) => {
      const activeStage = j.stages.find((s) => s.status === "ISSUED" || s.status === "IN_PROGRESS" || s.status === "RECEIVED");
      if (activeStage) {
        const name = activeStage.processStage.name;
        pipeline[name] = (pipeline[name] ?? 0) + 1;
      }
    });

    // 8. Needs Attention
    const needsAttention = [];
    if (overdueJobs > 0) needsAttention.push(`${overdueJobs} jobs are overdue based on target delivery date.`);
    if (wastageExceptions.length > 0) needsAttention.push(`Unresolved wastage exceptions on ${wastageExceptions.length} jobs.`);
    if (overReconciliations.length > 0) needsAttention.push(`Over-reconciliation flagged on ${overReconciliations.length} jobs.`);
    const overdueInvoices = invoices.filter((i) => i.invoicedAt && (now.getTime() - i.invoicedAt.getTime()) > 15 * 86400000);
    if (overdueInvoices.length > 0) needsAttention.push(`${overdueInvoices.length} invoices pending > 15 days.`);

    res.json({
      goldInStockG: Math.round(goldInStockG * 100) / 100,
      goldWithKarigarsG: Math.round(goldWithKarigarsG * 100) / 100,
      jobsInProduction,
      overdueJobs,
      receivable,
      payableToKarigars,
      totalChizzatG: Math.round(totalChizzatG * 100) / 100,
      avgChizzatPct: Math.round(avgChizzatPct * 100) / 100,
      pipeline,
      needsAttention,
    });
  })
);

// Comprehensive analytics dashboard data
router.get(
  "/analytics",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!canSeeCost(req.user!.role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const now = new Date();
    const monthStart = startOfMonth(now);
    const yearStart = startOfYear(now);

    const [
      approvedEstimates,
      jobCardsOpen,
      allKarigarLedger,
      monthlyWastage,
      estimatesByCustomer,
      materialIssues,
      allOrders,
      karigarStats,
    ] = await Promise.all([
      prisma.estimate.findMany({
        where: { status: "APPROVED", type: "FINAL_COSTING" },
        include: { customer: true, product: true },
      }),
      prisma.jobCard.count({ where: { status: "OPEN" } }),
      prisma.karigarLedgerEntry.findMany({
        where: {},
        include: { karigar: true },
      }),
      prisma.wastageRecord.findMany({
        where: { createdAt: { gte: monthStart } },
        include: { jobStage: { include: { jobCard: { include: { product: true } }, karigar: true } } },
      }),
      prisma.estimate.groupBy({
        by: ["customerId"],
        where: { status: "APPROVED", type: "FINAL_COSTING" },
        _sum: { netAmount: true },
        _count: true,
      }),
      prisma.materialIssue.groupBy({
        by: ["materialType"],
        where: { isReversed: false },
        _sum: { grossWeightG: true, fineWeightG: true },
      }),
      prisma.order.findMany({
        where: { createdAt: { gte: yearStart } },
        include: { estimate: true },
      }),
      prisma.karigar.findMany({
        include: {
          _count: { select: { labourEntries: { where: { status: "APPROVED" } } } },
        },
      }),
    ]);

    // Calculate financial KPIs
    const totalRevenue = approvedEstimates.reduce((sum, e) => sum + Number(e.netAmount), 0);
    const totalCost = approvedEstimates.reduce((sum, e) => sum + Number(e.cost), 0);
    const totalProfit = totalRevenue - totalCost;
    const profitMarginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    // Karigar payments
    const karigarPayments = new Map<string, { earned: number; advanced: number; labour: number }>();
    allKarigarLedger.forEach((entry) => {
      const kid = entry.karigarId;
      if (!karigarPayments.has(kid)) {
        karigarPayments.set(kid, { earned: 0, advanced: 0, labour: 0 });
      }
      const k = karigarPayments.get(kid)!;
      if (entry.type === "LABOUR_EARNED") k.labour += Number(entry.amount ?? 0);
      if (entry.type === "ADVANCE_PAID") k.advanced -= Number(entry.amount ?? 0);
      if (entry.type === "ADVANCE_ADJUSTED") k.advanced += Number(entry.amount ?? 0);
    });

    const totalLabourCost = Array.from(karigarPayments.values()).reduce((sum, k) => sum + k.labour, 0);
    const totalAdvancesPending = Array.from(karigarPayments.values()).reduce((sum, k) => sum + k.advanced, 0);

    // Material KPIs
    const totalGoldHeld = materialIssues
      .filter((m) => m.materialType === "SILVER")
      .reduce((sum, m) => sum + Number(m._sum.fineWeightG ?? 0), 0);

    // Wastage analysis
    const avgWastage = monthlyWastage.length > 0
      ? monthlyWastage.reduce((sum, w) => sum + Number(w.wastagePct), 0) / monthlyWastage.length
      : 0;
    const totalWastageG = monthlyWastage.reduce((sum, w) => sum + Number(w.netWastageG), 0);

    // Revenue trend (last 30 days)
    const dailyRevenue = new Map<string, number>();
    approvedEstimates.forEach((e) => {
      const day = e.approvedAt ? e.approvedAt.toISOString().split("T")[0] : "";
      if (day) dailyRevenue.set(day, (dailyRevenue.get(day) ?? 0) + Number(e.netAmount));
    });

    // Customer revenue ranking
    const customerRevenue = estimatesByCustomer
      .filter((c) => c._sum.netAmount && Number(c._sum.netAmount) > 0)
      .map((c) => ({
        customerId: c.customerId,
        revenue: Number(c._sum.netAmount ?? 0),
        orders: c._count,
      }))
      .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
      .slice(0, 10);

    // Order status breakdown
    const orderStatus = new Map<string, number>();
    allOrders.forEach((o) => {
      orderStatus.set(o.status, (orderStatus.get(o.status) ?? 0) + 1);
    });

    res.json({
      kpis: {
        totalRevenue,
        totalCost,
        totalProfit,
        profitMarginPct: Math.round(profitMarginPct * 100) / 100,
        jobsInProgress: jobCardsOpen,
        totalLabourCost,
        totalAdvancesPending,
        goldHeldG: Math.round(totalGoldHeld * 1000) / 1000,
        avgWastagePct: Math.round(avgWastage * 100) / 100,
        totalWastageG: Math.round(totalWastageG * 1000) / 1000,
        approvedEstimates: approvedEstimates.length,
        ordersCreated: allOrders.length,
        karigarsActive: karigarStats.length,
      },
      trends: {
        dailyRevenue: Array.from(dailyRevenue.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-30)
          .map(([date, revenue]) => ({ date, revenue })),
      },
      topCustomers: customerRevenue,
      orderStatusBreakdown: Array.from(orderStatus.entries()).map(([status, count]) => ({
        status,
        count,
      })),
      karigarPerformance: karigarStats
        .map((k) => ({
          id: k.id,
          name: k.name,
          ordersCompleted: k._count.labourEntries,
          earnings: karigarPayments.get(k.id)?.labour ?? 0,
          advances: karigarPayments.get(k.id)?.advanced ?? 0,
        }))
        .sort((a, b) => b.ordersCompleted - a.ordersCompleted)
        .slice(0, 10),
    });
  })
);

// FR-10.01: role-aware dashboard KPIs (legacy, kept for compat).
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const now = new Date();
    const monthStart = startOfMonth(now);

    const [jobsInProgress, ledgerEntries, wastageThisMonth, pendingEstimates] = await Promise.all([
      prisma.jobCard.count({ where: { status: "OPEN" } }),
      prisma.karigarLedgerEntry.findMany({
        where: { type: { in: ["METAL_DEBIT", "METAL_CREDIT"] } },
        select: { type: true, fineGoldG: true },
      }),
      prisma.wastageRecord.findMany({
        where: { createdAt: { gte: monthStart } },
        select: { wastagePct: true, tolerancePct: true },
      }),
      canSeeCost(req.user!.role)
        ? prisma.estimate.count({ where: { status: { in: ["DRAFT", "SUBMITTED"] } } })
        : Promise.resolve(null),
    ]);

    const goldWithKarigarsG = ledgerEntries.reduce(
      (sum, e) =>
        sum + (e.type === "METAL_DEBIT" ? Number(e.fineGoldG ?? 0) : -Number(e.fineGoldG ?? 0)),
      0
    );

    const avgWastagePct =
      wastageThisMonth.length > 0
        ? wastageThisMonth.reduce((sum, w) => sum + Number(w.wastagePct), 0) / wastageThisMonth.length
        : 0;
    const avgTolerancePct =
      wastageThisMonth.length > 0
        ? wastageThisMonth.reduce((sum, w) => sum + Number(w.tolerancePct), 0) / wastageThisMonth.length
        : 0;

    res.json({
      jobsInProgress,
      goldWithKarigarsG: Math.round(goldWithKarigarsG * 1000) / 1000,
      wastageThisMonthPct: Math.round(avgWastagePct * 100) / 100,
      wastageToleranceThisMonthPct: Math.round(avgTolerancePct * 100) / 100,
      pendingEstimates,
    });
  })
);

// Wastage alerts
router.get(
  "/wastage-alerts",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const exceptions = await prisma.wastageRecord.findMany({
      where: { exceptionStatus: "PENDING" },
      include: { jobStage: { include: { jobCard: { include: { product: true } }, karigar: true } } },
      take: 10,
      orderBy: { createdAt: "desc" },
    });
    res.json(
      exceptions.map((w) => ({
        wastageRecordId: w.id,
        karigarName: w.jobStage.karigar?.name ?? "Unassigned",
        serialNo: w.jobStage.jobCard.product.serialNo,
        wastagePct: w.wastagePct,
      }))
    );
  })
);

export default router;
