"use client";

import { useApi } from "@/lib/hooks";
import { formatWeight } from "@/lib/format";

export default function MetalPositionReport() {
  const { data } = useApi<{ goldWithKarigars: number; stockInStore: number; totalSystemGold: number }>("/api/reports/metal-position");

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold">Metal Position (Gold Ledger)</h1>
      <p className="text-sm text-text-muted">
        This report shows the total 24K fine gold equivalent currently tracked by the system, aggregated across the store ledger and all karigar ledgers.
      </p>

      {!data ? (
        <div className="text-text-muted">Loading…</div>
      ) : (
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="card p-5 border-l-4 border-l-gold">
            <div className="text-sm text-text-muted mb-1">With Karigars</div>
            <div className="text-2xl font-bold tabular">{formatWeight(data.goldWithKarigars)}</div>
            <div className="text-xs text-text-muted mt-1">Fine Gold (24K)</div>
          </div>
          <div className="card p-5 border-l-4 border-l-gold">
            <div className="text-sm text-text-muted mb-1">In Store</div>
            <div className="text-2xl font-bold tabular">{formatWeight(data.stockInStore)}</div>
            <div className="text-xs text-text-muted mt-1">Fine Gold (24K)</div>
          </div>
          <div className="card p-5 border-l-4 border-l-gold bg-gold-tint">
            <div className="text-sm font-semibold mb-1">Total System Gold</div>
            <div className="text-3xl font-bold text-gold tabular">{formatWeight(data.totalSystemGold)}</div>
            <div className="text-xs text-text-muted mt-1">Fine Gold (24K)</div>
          </div>
        </div>
      )}
    </div>
  );
}
