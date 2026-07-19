import clsx from "clsx";
import { hi } from "@/lib/hi";

type Tone = "success" | "warning" | "danger" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  success: "pill-success",
  warning: "pill-warning",
  danger: "pill-danger",
  neutral: "pill-neutral",
};

export function StatusPill({
  label,
  hiLabel,
  tone,
}: {
  label: string;
  hiLabel?: string;
  tone: Tone;
}) {
  return (
    <span className={clsx("pill", TONE_CLASS[tone])}>
      {label}
      {hiLabel && <span className="opacity-70">· {hiLabel}</span>}
    </span>
  );
}

const PRODUCT_STATUS_TONE: Record<string, Tone> = {
  DESIGN: "neutral",
  ESTIMATED: "warning",
  IN_PRODUCTION: "warning",
  FINISHED: "success",
  SOLD: "success",
  MELTED: "danger",
};

export function ProductStatusPill({ status }: { status: string }) {
  return (
    <StatusPill
      label={status.replace(/_/g, " ")}
      hiLabel={hi.productStatus[status]}
      tone={PRODUCT_STATUS_TONE[status] ?? "neutral"}
    />
  );
}

const JOB_STAGE_STATUS_TONE: Record<string, Tone> = {
  PENDING: "neutral",
  ISSUED: "warning",
  IN_PROGRESS: "warning",
  RECEIVED: "warning",
  APPROVED: "success",
  REWORK: "danger",
};

export function JobStageStatusPill({ status }: { status: string }) {
  return (
    <StatusPill
      label={status.replace(/_/g, " ")}
      hiLabel={hi.jobStageStatus[status]}
      tone={JOB_STAGE_STATUS_TONE[status] ?? "neutral"}
    />
  );
}

const ESTIMATE_STATUS_TONE: Record<string, Tone> = {
  DRAFT: "neutral",
  SUBMITTED: "warning",
  APPROVED: "success",
  SUPERSEDED: "danger",
};

export function EstimateStatusPill({ status }: { status: string }) {
  return <StatusPill label={status} tone={ESTIMATE_STATUS_TONE[status] ?? "neutral"} />;
}
