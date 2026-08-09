import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type StepState = "complete" | "current" | "upcoming";

interface WorkflowStepperProps {
  estimateType: "ROUGH_ESTIMATE" | "FINAL_COSTING";
  estimateStatus: "DRAFT" | "SUBMITTED" | "APPROVED" | "SUPERSEDED";
}

/**
 * Estimate → Production → Final, so the employee always knows where a piece
 * sits in the costing lifecycle. Derived purely from estimate.type/status —
 * no extra state.
 */
export function WorkflowStepper({ estimateType, estimateStatus }: WorkflowStepperProps) {
  const isRough = estimateType === "ROUGH_ESTIMATE";
  const approved = estimateStatus === "APPROVED";

  const steps: { label: string; state: StepState }[] = isRough
    ? [
        { label: "Estimate", state: approved ? "complete" : "current" },
        { label: "Production", state: approved ? "current" : "upcoming" },
        { label: "Final", state: "upcoming" },
      ]
    : [
        { label: "Estimate", state: "complete" },
        { label: "Production", state: "complete" },
        { label: "Final", state: approved ? "complete" : "current" },
      ];

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                step.state === "complete" && "bg-success text-success-foreground",
                step.state === "current" && "bg-primary text-primary-foreground",
                step.state === "upcoming" && "bg-muted text-muted-foreground"
              )}
            >
              {step.state === "complete" ? <Check size={12} /> : i + 1}
            </span>
            <span className={cn("font-medium", step.state === "upcoming" && "text-muted-foreground")}>
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && <div className="h-px w-8 bg-border" />}
        </div>
      ))}
    </div>
  );
}
