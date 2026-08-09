import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { hi } from "@/lib/hi";

type Tone = "success" | "warning" | "destructive" | "secondary";

/**
 * Replaces the old StatusPill — same tone-map-per-enum pattern, same
 * optional Hindi gloss (hiLabel) for the shop-floor screens, now built on
 * the shared Badge primitive instead of a bespoke .pill CSS class.
 */
export function StatusBadge({
  label,
  hiLabel,
  tone,
  className,
}: {
  label: string;
  hiLabel?: string;
  tone: Tone;
  className?: string;
}) {
  return (
    <Badge variant={tone} className={cn("font-semibold", className)}>
      {label}
      {hiLabel && <span className="font-normal opacity-70">· {hiLabel}</span>}
    </Badge>
  );
}

const PRODUCT_STATUS_TONE: Record<string, Tone> = {
  DESIGN: "secondary",
  ESTIMATED: "warning",
  IN_PRODUCTION: "warning",
  FINISHED: "success",
  SOLD: "success",
  MELTED: "destructive",
};

export function ProductStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge
      label={status.replace(/_/g, " ")}
      hiLabel={hi.productStatus[status]}
      tone={PRODUCT_STATUS_TONE[status] ?? "secondary"}
    />
  );
}

const JOB_STAGE_STATUS_TONE: Record<string, Tone> = {
  PENDING: "secondary",
  ISSUED: "warning",
  IN_PROGRESS: "warning",
  RECEIVED: "warning",
  APPROVED: "success",
  REWORK: "destructive",
};

export function JobStageStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge
      label={status.replace(/_/g, " ")}
      hiLabel={hi.jobStageStatus[status]}
      tone={JOB_STAGE_STATUS_TONE[status] ?? "secondary"}
    />
  );
}

const ESTIMATE_STATUS_TONE: Record<string, Tone> = {
  DRAFT: "secondary",
  SUBMITTED: "warning",
  APPROVED: "success",
  SUPERSEDED: "destructive",
};

export function EstimateStatusBadge({ status }: { status: string }) {
  return <StatusBadge label={status} tone={ESTIMATE_STATUS_TONE[status] ?? "secondary"} />;
}
