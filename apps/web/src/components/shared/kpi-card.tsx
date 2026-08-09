import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "warning" | "destructive";

const ICON_TONE: Record<Tone, string> = {
  default: "text-primary bg-primary/10",
  success: "text-success bg-success/10",
  warning: "text-warning bg-warning/10",
  destructive: "text-destructive bg-destructive/10",
};

const VALUE_TONE: Record<Tone, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  href?: string;
}

export function KpiCard({ icon: Icon, label, value, sub, tone = "default", href }: KpiCardProps) {
  const body = (
    <CardContent className="flex items-center justify-between gap-4 pt-0.5">
      <div className="min-w-0 space-y-1">
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
        <div className={cn("text-2xl font-bold tabular-nums tracking-tight md:text-3xl", VALUE_TONE[tone])}>
          {value}
        </div>
        {sub && <div className={cn("text-xs", tone === "default" ? "text-muted-foreground" : VALUE_TONE[tone])}>{sub}</div>}
      </div>
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", ICON_TONE[tone])}>
        <Icon className="h-5 w-5" />
      </div>
    </CardContent>
  );

  if (href) {
    return (
      <Card className="transition-shadow hover:shadow-sm">
        <Link href={href}>{body}</Link>
      </Card>
    );
  }
  return <Card>{body}</Card>;
}
