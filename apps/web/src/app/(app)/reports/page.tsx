import Link from "next/link";
import { FileText, BarChart2, ShieldAlert, Coins } from "lucide-react";

export default function ReportsDirectory() {
  return (
    <div className="max-w-4xl">
      <div className="mb-3.5">
        <div className="text-[11px] text-mute mb-1">Finance</div>
        <h1 className="text-[19px] font-semibold text-ink">Reports</h1>
        <p className="text-xs text-ink2 mt-0.5">
          Select a report from the catalogue below to view real-time data from the manufacturing and stock ledgers.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <ReportCard
          href="/reports/metal-position"
          icon={Coins}
          title="Metal Position (Gold Ledger)"
          desc="Live view of all 24K fine gold held in the store and distributed across all karigars."
        />
        <ReportCard
          href="/reports/karigar-outstanding"
          icon={BarChart2}
          title="Karigar Outstanding"
          desc="Detailed ageing and balances of fine gold pending recovery from each karigar."
        />
        <ReportCard
          href="/reports/dust-recovery"
          icon={ShieldAlert}
          title="Dust Collection & Recovery"
          desc="Track dust lots sent for refining and monitor the actual recovery percentages."
        />
        <ReportCard
          href="/reports/product-margin"
          icon={FileText}
          title="Product Margin Analysis"
          desc="View realized profit margins on all final costings and approved estimates."
        />
      </div>
    </div>
  );
}

function ReportCard({
  href,
  icon: Icon,
  title,
  desc,
}: {
  href: string;
  icon: typeof Coins;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href} className="console-panel p-3.5 hover:border-accent transition-colors block">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-md bg-accent-bg text-accent flex items-center justify-center shrink-0">
          <Icon size={18} />
        </div>
        <div>
          <h3 className="text-[13px] font-semibold text-ink mb-1">{title}</h3>
          <p className="text-xs text-ink2">{desc}</p>
        </div>
      </div>
    </Link>
  );
}
