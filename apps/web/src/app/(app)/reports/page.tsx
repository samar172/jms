import Link from "next/link";
import { FileText, BarChart2, ShieldAlert, Coins } from "lucide-react";

export default function ReportsDirectory() {
  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-semibold">Reports & Dashboards</h1>
      <p className="text-text-muted">
        Select a report from the catalogue below to view real-time data from the manufacturing and stock ledgers.
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        <Link href="/reports/metal-position" className="card p-5 hover:border-gold transition-colors block">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-gold-tint text-gold flex items-center justify-center shrink-0">
              <Coins size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-1">Metal Position (Gold Ledger)</h3>
              <p className="text-sm text-text-muted">
                Live view of all 24K fine gold held in the store and distributed across all karigars.
              </p>
            </div>
          </div>
        </Link>

        <Link href="/reports/karigar-outstanding" className="card p-5 hover:border-gold transition-colors block">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-gold-tint text-gold flex items-center justify-center shrink-0">
              <BarChart2 size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-1">Karigar Outstanding</h3>
              <p className="text-sm text-text-muted">
                Detailed ageing and balances of fine gold pending recovery from each karigar.
              </p>
            </div>
          </div>
        </Link>

        <Link href="/reports/dust-recovery" className="card p-5 hover:border-gold transition-colors block">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-gold-tint text-gold flex items-center justify-center shrink-0">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-1">Dust Collection & Recovery</h3>
              <p className="text-sm text-text-muted">
                Track dust lots sent for refining and monitor the actual recovery percentages.
              </p>
            </div>
          </div>
        </Link>

        <Link href="/reports/product-margin" className="card p-5 hover:border-gold transition-colors block">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-gold-tint text-gold flex items-center justify-center shrink-0">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-1">Product Margin Analysis</h3>
              <p className="text-sm text-text-muted">
                View realized profit margins on all final costings and approved estimates.
              </p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
