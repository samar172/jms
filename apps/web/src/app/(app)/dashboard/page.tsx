"use client";

import Link from "next/link";
import { ClipboardList, Gem, TriangleAlert, FileText, Inbox } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { formatWeight, formatPct } from "@/lib/format";
import { KpiCard } from "@/components/shared/kpi-card";
import { JobStageStatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PageListSkeleton } from "@/components/shared/page-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { AreaChart, Area, XAxis, CartesianGrid } from "recharts";

interface DashboardKpis {
  jobsInProgress: number;
  goldWithKarigarsG: number;
  wastageThisMonthPct: number;
  wastageToleranceThisMonthPct: number;
  pendingEstimates: number | null;
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

const chartConfig = {
  jobs: { label: "Jobs Opened", color: "var(--chart-3)" },
} satisfies ChartConfig;

function buildWeeklyIntake(jobCards: JobCardRow[] | undefined) {
  const weeks = 8;
  const buckets: { week: string; jobs: number }[] = [];
  const now = new Date();
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(now);
    start.setDate(now.getDate() - i * 7 - now.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const count = (jobCards ?? []).filter((jc) => {
      const created = new Date(jc.createdAt);
      return created >= start && created < end;
    }).length;
    buckets.push({
      week: start.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      jobs: count,
    });
  }
  return buckets;
}

export default function DashboardPage() {
  const { data: kpis } = useApi<DashboardKpis>("/api/dashboard");
  const { data: jobCards } = useApi<JobCardRow[]>("/api/job-cards");
  const { data: alerts } = useApi<WastageAlert[]>("/api/dashboard/wastage-alerts");

  const loading = !kpis || !jobCards || !alerts;
  const wastageTone =
    kpis && kpis.wastageThisMonthPct > kpis.wastageToleranceThisMonthPct ? "warning" : "default";

  if (loading) {
    return <PageListSkeleton rows={6} hasFilters={false} />;
  }

  const weeklyIntake = buildWeeklyIntake(jobCards);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={ClipboardList} label="Jobs in Progress" value={String(kpis.jobsInProgress)} href="/job-cards" />
        <KpiCard icon={Gem} label="Gold with Karigars" value={formatWeight(kpis.goldWithKarigarsG)} />
        <KpiCard
          icon={TriangleAlert}
          label="Wastage This Month"
          value={formatPct(kpis.wastageThisMonthPct)}
          sub={`tolerance ${formatPct(kpis.wastageToleranceThisMonthPct)}`}
          tone={wastageTone}
        />
        <KpiCard
          icon={FileText}
          label="Pending Estimates"
          value={kpis.pendingEstimates === null ? "—" : String(kpis.pendingEstimates)}
          href="/costing"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Job Intake — last 8 weeks</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
            <AreaChart data={weeklyIntake} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="fillJobs" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-jobs)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-jobs)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              <Area
                dataKey="jobs"
                type="monotone"
                fill="url(#fillJobs)"
                stroke="var(--color-jobs)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Work in Progress</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {jobCards.length === 0 ? (
              <EmptyState icon={Inbox} title="No open jobs" description="New job cards will show up here." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serial No.</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Karigar</TableHead>
                    <TableHead>Days Open</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobCards.slice(0, 8).map((jc) => {
                    const activeStage =
                      jc.stages.find((s) => s.status !== "APPROVED") ?? jc.stages[jc.stages.length - 1];
                    return (
                      <TableRow key={jc.id}>
                        <TableCell>
                          <Link href={`/products/${jc.product.serialNo}`} className="font-mono font-semibold text-primary">
                            {jc.product.serialNo}
                          </Link>
                          <div className="text-xs text-muted-foreground">{jc.product.designName}</div>
                        </TableCell>
                        <TableCell>{activeStage?.processStage.name ?? "—"}</TableCell>
                        <TableCell>{activeStage?.karigar?.name ?? "Unassigned"}</TableCell>
                        <TableCell className="tabular-nums">{daysOpen(jc.createdAt)}</TableCell>
                        <TableCell>{activeStage && <JobStageStatusBadge status={activeStage.status} />}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Wastage Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.length === 0 ? (
              <EmptyState icon={TriangleAlert} title="All clear" description="No open wastage exceptions." className="py-6" />
            ) : (
              alerts.map((a) => (
                <div key={a.wastageRecordId} className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0">
                  <div>
                    <div className="text-sm font-medium">{a.karigarName}</div>
                    <div className="font-mono text-xs text-muted-foreground">{a.serialNo}</div>
                  </div>
                  <div className="text-right">
                    <Badge variant="destructive" className="mb-1">{formatPct(a.wastagePct)}</Badge>
                    <Link href="/job-cards" className="block text-xs text-primary hover:underline">
                      Review
                    </Link>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
