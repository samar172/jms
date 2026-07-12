import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-text-muted text-sm font-medium">{label}</span>
        <Icon size={18} className="text-gold" />
      </div>
      <div
        className={clsx(
          "text-2xl font-semibold tabular",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-danger"
        )}
      >
        {value}
      </div>
      {sub && (
        <div
          className={clsx(
            "text-xs",
            tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : "text-text-muted"
          )}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
