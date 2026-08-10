"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useApi } from "@/lib/hooks";
import { JobStageStatusPill } from "@/components/StatusPill";
import { formatWeight, formatPct, formatDate, formatINR } from "@/lib/format";
import { TrendingUp, DollarSign, Gauge, AlertCircle, Zap } from "lucide-react";

interface AnalyticsData {
  kpis: {
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    profitMarginPct: number;
    jobsInProgress: number;
    totalLabourCost: number;
    totalAdvancesPending: number;
    goldHeldG: number;
    avgWastagePct: number;
    totalWastageG: number;
    approvedEstimates: number;
    ordersCreated: number;
    karigarsActive: number;
  };
  trends: {
    dailyRevenue: { date: string; revenue: number }[];
  };
  topCustomers: { customerId: string; revenue: number; orders: number }[];
  orderStatusBreakdown: { status: string; count: number }[];
  karigarPerformance: {
    id: string;
    name: string;
    ordersCompleted: number;
    earnings: number;
    advances: number;
  }[];
}

interface JobStage {
  id: string;
  status: string;
  karigar?: { name: string } | null;
  processStage: { name: string };
}

interface JobCardRow {
  id: string;
  targetDeliveryDate: string | null;
  createdAt: string;
  product: { serialNo: string; designName: string; images: { thumbnailUrl: string }[] };
  stages: JobStage[];
}

interface WastageAlert {
  wastageRecordId: string;
  karigarName: string;
  serialNo: string;
  wastagePct: string;
}

function daysOpen(createdAt: string) {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
}

function activeStageOf(jc: JobCardRow) {
  return jc.stages.find((s) => s.status !== "APPROVED") ?? jc.stages[jc.stages.length - 1];
}

export default function DashboardPage() {
  const { data: analytics } = useApi<AnalyticsData>("/api/dashboard/analytics");
  const { data: jobCards } = useApi<JobCardRow[]>("/api/job-cards");
  const { data: alerts } = useApi<WastageAlert[]>("/api/dashboard/wastage-alerts");
  const [activeTab, setActiveTab] = useState<"overview" | "revenue" | "karigars" | "material">("overview");

  const pipeline = useMemo(() => {
    const map = new Map<string, number>();
    jobCards?.forEach((jc) => {
      const stage = activeStageOf(jc);
      const name = stage?.processStage.name ?? "Unassigned";
      map.set(name, (map.get(name) ?? 0) + 1);
    });
    return map;
  }, [jobCards]);

  return (
    <div>
      <div className="mb-3.5">
        <div className="text-[11px] text-mute mb-1">Home</div>
        <h1 className="text-[19px] font-semibold flex items-center gap-2.5 text-ink">
          Analytics Dashboard <span className="text-xs text-mute font-medium">{formatDate(new Date().toISOString())}</span>
        </h1>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-3.5 border-b border-line">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === "overview"
              ? "border-accent text-accent"
              : "border-transparent text-mute hover:text-ink"
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab("revenue")}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === "revenue"
              ? "border-accent text-accent"
              : "border-transparent text-mute hover:text-ink"
          }`}
        >
          Revenue & Profit
        </button>
        <button
          onClick={() => setActiveTab("karigars")}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === "karigars"
              ? "border-accent text-accent"
              : "border-transparent text-mute hover:text-ink"
          }`}
        >
          Karigars
        </button>
        <button
          onClick={() => setActiveTab("material")}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === "material"
              ? "border-accent text-accent"
              : "border-transparent text-mute hover:text-ink"
          }`}
        >
          Material & Wastage
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <>
          {/* Financial KPIs */}
          <div className="mb-3.5">
            <h2 className="text-sm font-bold text-ink mb-2">Financial</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <KpiCard
                icon={DollarSign}
                label="Revenue (Approved)"
                value={formatINR(analytics?.kpis.totalRevenue ?? 0)}
                subtext={`${analytics?.kpis.approvedEstimates ?? 0} estimates`}
              />
              <KpiCard
                icon={Gauge}
                label="Total Cost"
                value={formatINR(analytics?.kpis.totalCost ?? 0)}
              />
              <KpiCard
                icon={TrendingUp}
                label="Profit"
                value={formatINR(analytics?.kpis.totalProfit ?? 0)}
                highlight
              />
              <KpiCard
                icon={Zap}
                label="Profit Margin"
                value={`${analytics?.kpis.profitMarginPct ?? 0}%`}
                highlight
              />
            </div>
          </div>

          {/* Operational KPIs */}
          <div className="mb-3.5">
            <h2 className="text-sm font-bold text-ink mb-2">Operations</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <KpiCard label="Jobs in Progress" value={String(analytics?.kpis.jobsInProgress ?? "—")} />
              <KpiCard label="Orders Created" value={String(analytics?.kpis.ordersCreated ?? "—")} />
              <KpiCard label="Active Karigars" value={String(analytics?.kpis.karigarsActive ?? "—")} />
              <KpiCard label="Labour Cost (MTD)" value={formatINR(analytics?.kpis.totalLabourCost ?? 0)} />
            </div>
          </div>

          {/* Material & Wastage KPIs */}
          <div className="mb-3.5">
            <h2 className="text-sm font-bold text-ink mb-2">Material & Wastage</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <KpiCard label="Gold Held" value={formatWeight(analytics?.kpis.goldHeldG)} />
              <KpiCard label="Total Wastage (g)" value={formatWeight(analytics?.kpis.totalWastageG)} />
              <KpiCard label="Avg Wastage %" value={formatPct(analytics?.kpis.avgWastagePct)} />
              <KpiCard label="Advances Pending" value={formatINR(analytics?.kpis.totalAdvancesPending ?? 0)} />
            </div>
          </div>

          {/* Alerts & Pipeline */}
          <div className="grid lg:grid-cols-[1.3fr_1fr] gap-3.5 mb-3.5">
            <div className="console-panel">
              <div className="ph flex items-center gap-2">
                <AlertCircle size={14} />
                Exceptions Requiring Action
              </div>
              <div>
                {alerts?.map((a) => (
                  <div
                    key={a.wastageRecordId}
                    className="flex items-center gap-2.5 px-3 py-2 border-b border-line last:border-0 text-xs"
                  >
                    <span className="w-[7px] h-[7px] rounded-full bg-[#DC2626] shrink-0" />
                    <span className="flex-1 text-ink">
                      Wastage on <span className="mono">{a.serialNo}</span> — {a.karigarName} at{" "}
                      <span className="font-semibold text-err-tx">{formatPct(a.wastagePct)}</span>
                    </span>
                    <Link href="/job-cards" className="text-accent font-semibold text-[11.5px] shrink-0">
                      Review →
                    </Link>
                  </div>
                ))}
                {alerts?.length === 0 && <div className="px-3 py-4 text-xs text-mute">No open exceptions.</div>}
              </div>
            </div>

            <div className="console-panel">
              <div className="ph">Production Pipeline</div>
              <table className="w-full text-xs">
                <tbody>
                  {[...pipeline.entries()].map(([name, count]) => (
                    <tr key={name} className="border-b border-line last:border-0">
                      <td className="px-3 py-1.5 text-ink2">{name}</td>
                      <td className="px-3 py-1.5 text-right mono font-semibold text-ink">{count}</td>
                    </tr>
                  ))}
                  {pipeline.size === 0 && (
                    <tr>
                      <td className="px-3 py-4 text-mute text-center">No open jobs.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Work in Progress */}
          <div className="console-panel">
            <div className="ph">Work in Progress (Last 8)</div>
            <div className="overflow-x-auto">
              <table className="console-table">
                <thead>
                  <tr>
                    <th>Serial No.</th>
                    <th>Stage</th>
                    <th>Karigar</th>
                    <th className="num">Days Open</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {jobCards?.slice(0, 8).map((jc) => {
                    const stage = activeStageOf(jc);
                    return (
                      <tr key={jc.id}>
                        <td>
                          <Link href={`/products/${jc.product.serialNo}`} className="rid">
                            {jc.product.serialNo}
                          </Link>
                          <div className="text-mute text-[11px]">{jc.product.designName}</div>
                        </td>
                        <td className="text-ink2">{stage?.processStage.name ?? "—"}</td>
                        <td className="text-ink2">{stage?.karigar?.name ?? "Unassigned"}</td>
                        <td className="num mono">{daysOpen(jc.createdAt)}</td>
                        <td>{stage && <JobStageStatusPill status={stage.status} />}</td>
                      </tr>
                    );
                  })}
                  {jobCards?.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-mute">
                        No open jobs.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Revenue & Profit Tab */}
      {activeTab === "revenue" && (
        <div className="space-y-3.5">
          <div className="console-panel">
            <div className="ph">Revenue Trend (Last 30 Days)</div>
            <div className="p-3 h-64 flex items-end justify-around gap-1">
              {analytics?.trends.dailyRevenue && analytics.trends.dailyRevenue.length > 0 ? (
                analytics.trends.dailyRevenue.map((day) => {
                  const maxRev = Math.max(...analytics.trends.dailyRevenue.map((d) => d.revenue));
                  const height = maxRev > 0 ? (day.revenue / maxRev) * 100 : 0;
                  return (
                    <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full bg-accent rounded-t opacity-70 hover:opacity-100 transition"
                        style={{ height: `${Math.max(height, 3)}%` }}
                        title={`${day.date}: ${formatINR(day.revenue)}`}
                      />
                      <span className="text-[9px] text-mute">{day.date.split("-")[2]}</span>
                    </div>
                  );
                })
              ) : (
                <div className="text-mute text-sm">No revenue data yet.</div>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-3.5">
            <div className="console-panel">
              <div className="ph">Order Status Breakdown</div>
              <div className="p-3 space-y-2">
                {analytics?.orderStatusBreakdown && analytics.orderStatusBreakdown.length > 0 ? (
                  analytics.orderStatusBreakdown.map((status) => (
                    <div key={status.status} className="flex justify-between items-center text-sm">
                      <span className="text-ink2 capitalize">{status.status}</span>
                      <span className="mono font-semibold text-ink">{status.count}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-mute text-sm">No order data yet.</div>
                )}
              </div>
            </div>

            <div className="console-panel">
              <div className="ph">Top Customers by Revenue</div>
              <table className="w-full text-xs">
                <tbody>
                  {analytics?.topCustomers && analytics.topCustomers.length > 0 ? (
                    analytics.topCustomers.map((c) => (
                      <tr key={c.customerId} className="border-b border-line last:border-0">
                        <td className="px-3 py-2 text-ink2">{c.orders} orders</td>
                        <td className="px-3 py-2 text-right mono font-semibold">{formatINR(c.revenue)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="px-3 py-4 text-center text-mute">
                        No customer data yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Karigars Tab */}
      {activeTab === "karigars" && (
        <div className="console-panel">
          <div className="ph">Karigar Performance & Earnings</div>
          <div className="overflow-x-auto">
            <table className="console-table">
              <thead>
                <tr>
                  <th>Karigar</th>
                  <th className="num">Orders Completed</th>
                  <th className="num">Earnings</th>
                  <th className="num">Advances</th>
                  <th className="num">Net Payable</th>
                </tr>
              </thead>
              <tbody>
                {analytics?.karigarPerformance && analytics.karigarPerformance.length > 0 ? (
                  analytics.karigarPerformance.map((k) => (
                    <tr key={k.id}>
                      <td>
                        <Link href={`/karigars/${k.id}`} className="text-accent hover:underline">
                          {k.name}
                        </Link>
                      </td>
                      <td className="num mono">{k.ordersCompleted}</td>
                      <td className="num mono font-semibold text-ink">{formatINR(k.earnings)}</td>
                      <td className="num mono">{formatINR(Math.abs(k.advances))}</td>
                      <td className="num mono font-semibold text-ink">{formatINR(k.earnings - k.advances)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-mute">
                      No karigar data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Material & Wastage Tab */}
      {activeTab === "material" && (
        <div className="space-y-3.5">
          <div className="grid lg:grid-cols-3 gap-3.5">
            <KpiCard
              label="Total Gold Held"
              value={formatWeight(analytics?.kpis.goldHeldG)}
              subtext="In production"
            />
            <KpiCard
              label="Total Wastage (MTD)"
              value={formatWeight(analytics?.kpis.totalWastageG)}
              subtext={`Avg: ${formatPct(analytics?.kpis.avgWastagePct)}`}
            />
            <KpiCard label="Karigar Advances Pending" value={formatINR(analytics?.kpis.totalAdvancesPending ?? 0)} />
          </div>

          <div className="console-panel">
            <div className="ph">Material Utilization</div>
            <div className="p-4">
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-ink2">Gold in Use</span>
                    <span className="mono font-semibold">{formatWeight(analytics?.kpis.goldHeldG)}</span>
                  </div>
                  <div className="w-full bg-neu-bg rounded-full h-2">
                    <div className="bg-accent rounded-full h-2" style={{ width: "65%" }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-ink2">Wastage Ratio</span>
                    <span className="mono font-semibold">{formatPct(analytics?.kpis.avgWastagePct)}</span>
                  </div>
                  <div className="w-full bg-neu-bg rounded-full h-2">
                    <div
                      className={`rounded-full h-2 ${(analytics?.kpis.avgWastagePct ?? 0) > 3 ? "bg-warn" : "bg-ok"}`}
                      style={{ width: `${Math.min((analytics?.kpis.avgWastagePct ?? 0) * 10, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  subtext,
  highlight,
}: {
  icon?: typeof DollarSign;
  label: string;
  value: string;
  subtext?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`console-panel px-3 py-2.5 ${highlight ? "ring-2 ring-accent/30" : ""}`}>
      <div className="flex items-center gap-2 mb-1.5">
        {Icon && <Icon size={14} className="text-mute" />}
        <div className="text-[10.5px] uppercase tracking-wide text-mute">{label}</div>
      </div>
      <div className={`text-lg font-bold mono ${highlight ? "text-accent" : "text-ink"}`}>{value}</div>
      {subtext && <div className="text-[11px] text-ink2 mt-0.5">{subtext}</div>}
    </div>
  );
}
