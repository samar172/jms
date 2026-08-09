"use client";

import { useApi } from "@/lib/hooks";
import { formatWeight } from "@/lib/format";

export default function MetalPositionReport() {
  const { data } = useApi<{ goldWithKarigars: number; stockInStore: number; totalSystemGold: number }>("/api/reports/metal-position");

  return (
    <div className="max-w-2xl">
      <div className="mb-3.5">
        <div className="text-[11px] text-mute mb-1">
          <a href="/reports" className="hover:text-accent">Finance</a>
        </div>
        <h1 className="text-[19px] font-semibold text-ink">Metal Position — &quot;Where is my gold?&quot;</h1>
        <p className="text-xs text-ink2 mt-0.5">
          Total 24K fine gold equivalent currently tracked by the system, aggregated across the store ledger and all karigar ledgers.
        </p>
      </div>

      {!data ? (
        <div className="text-mute text-sm">Loading…</div>
      ) : (
        <div className="console-flowbar">
          <div className="console-fseg">
            <div className="fl">With Karigars</div>
            <div className="fv">{formatWeight(data.goldWithKarigars)}</div>
          </div>
          <div className="console-fseg">
            <div className="fl">In Store</div>
            <div className="fv">{formatWeight(data.stockInStore)}</div>
          </div>
          <div className="console-fseg hi">
            <div className="fl">Total System Gold</div>
            <div className="fv">{formatWeight(data.totalSystemGold)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
