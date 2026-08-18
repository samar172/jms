"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApi, useProcessStages, type ProcessStage } from "@/lib/hooks";
import { Gem, Wallet, HandCoins, Scale } from "lucide-react";
import { formatWeight, formatINR, formatDateTime } from "@/lib/format";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { canSeeCost } from "@jms/shared";

interface Summary {
  goldHeldG: number;
  labourEarnedThisMonth: number;
  advancesPaid: number;
  netPayable: number;
}
interface LedgerEntry {
  id: string;
  type: string;
  fineGoldG: string | null;
  amount: string | null;
  note: string | null;
  createdAt: string;
}
interface StageRate {
  id: string;
  processStageId: string;
  processStage: { id: string; name: string };
  rateBasis: "PER_GRAM" | "PER_PIECE" | "PER_CARAT" | "DAILY_WAGE";
  rate: string;
}
interface Karigar {
  id: string;
  code: string;
  name: string;
  employmentType: string;
  specialization?: string;
  stageRates?: StageRate[];
}

export default function KarigarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  
  useEffect(() => {
    if (id === "ledger") {
      router.replace("/karigars");
    }
  }, [id, router]);

  const { user } = useAuth();
  const { data: karigar, mutate: mutateKarigar } = useApi<Karigar>(`/api/masters/karigars/${id}`);
  const { data: summary, mutate: mutateSummary } = useApi<Summary>(`/api/labour/karigars/${id}/summary`);
  const { data: ledger, mutate: mutateLedger } = useApi<LedgerEntry[]>(`/api/labour/karigars/${id}/ledger`);
  const { data: processStages } = useProcessStages();
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const showCost = user ? canSeeCost(user.role) : false;
  const canEditRates = user?.role === "SUPER_ADMIN" || user?.role === "MANAGER";

  if (!karigar) return <div className="text-text-muted">Loading…</div>;

  async function payAdvance() {
    setError(null);
    try {
      await apiFetch("/api/labour/advances", {
        method: "POST",
        body: { karigarId: id, amount: Number(advanceAmount) },
      });
      setAdvanceAmount("");
      await Promise.all([mutateSummary(), mutateLedger()]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  let goldBal = 0;
  let payableBal = 0;
  const ledgerWithBalances = ledger ? [...ledger].reverse().map(e => {
    if (e.type === "METAL_DEBIT") goldBal += Number(e.fineGoldG ?? 0);
    if (e.type === "METAL_CREDIT") goldBal -= Number(e.fineGoldG ?? 0);
    if (e.type === "LABOUR_EARNED") payableBal += Number(e.amount ?? 0);
    if (e.type === "ADVANCE_PAID" || e.type === "WASTAGE_RECOVERY") payableBal -= Number(e.amount ?? 0);
    // ADVANCE_ADJUSTED doesn't change net payable directly because it's a bookkeeping entry that reduces Advance balance and offsets against labour. Wait, actually we said netPayable = labour - (advancesPaid - advanceAdjusted). So netPayable decreases when advance is paid. Wait: netPayable = labour - advancesPaid + advancesAdjusted. No, wait. 
    if (e.type === "ADVANCE_ADJUSTED") payableBal += Number(e.amount ?? 0); 

    return { ...e, goldBalance: goldBal, payableBalance: payableBal };
  }).reverse() : [];

  return (
    <div>
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">Manufacturing</div>
        <h1 className="text-[19px] font-semibold flex items-center gap-2.5 text-ink">
          {karigar.name}
          <span className="text-xs text-mute font-medium mono">
            {karigar.code} · {karigar.employmentType === "IN_HOUSE" ? "In-house" : "External"}
            {karigar.specialization ? ` · ${karigar.specialization}` : ""}
          </span>
        </h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3.5">
        <Kpi icon={Gem} label="Silver Held" value={formatWeight(summary?.goldHeldG)} />
        {showCost && (
          <>
            <Kpi icon={Wallet} label="Labour Earned (MTD)" value={formatINR(summary?.labourEarnedThisMonth ?? 0)} />
            <Kpi icon={HandCoins} label="Advances Paid" value={formatINR(summary?.advancesPaid ?? 0)} />
            <Kpi icon={Scale} label="Net Payable" value={formatINR(summary?.netPayable ?? 0)} alert />
          </>
        )}
      </div>

      {showCost && (
        <div className="console-panel p-3.5 flex items-end gap-2 mb-3.5">
          <div>
            <label className="console-field-label">Pay Advance (₹)</label>
            <input
              type="number"
              className="console-field w-40"
              value={advanceAmount}
              onChange={(e) => setAdvanceAmount(e.target.value)}
            />
          </div>
          <button className="console-btn primary" onClick={payAdvance} disabled={!advanceAmount}>
            Record Advance
          </button>
          {error && <p className="text-sm text-err-tx">{error}</p>}
        </div>
      )}

      {showCost && (
        <StageRatesPanel
          karigarId={id}
          stageRates={karigar.stageRates ?? []}
          processStages={processStages ?? []}
          editable={canEditRates}
          onChange={mutateKarigar}
        />
      )}

      <div className="console-panel overflow-hidden">
        <div className="ph">Metal &amp; Payable Ledger</div>
        <div className="overflow-x-auto">
          <table className="console-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th className="num">Silver (g)</th>
                <th className="num">Silver Bal (g)</th>
                {showCost && <th className="num">Amount</th>}
                {showCost && <th className="num">Payable Bal</th>}
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {ledgerWithBalances?.map((e) => (
                <tr key={e.id}>
                  <td className="text-ink2">{formatDateTime(e.createdAt)}</td>
                  <td>{e.type.replace(/_/g, " ")}</td>
                  <td className={`num mono ${e.type === 'METAL_DEBIT' ? 'text-emerald-600' : e.type === 'METAL_CREDIT' ? 'text-rose-600' : ''}`}>
                    {e.fineGoldG ? (e.type === 'METAL_CREDIT' ? '-' : '') + Number(e.fineGoldG).toFixed(3) : "—"}
                  </td>
                  <td className="num mono font-medium">{e.goldBalance.toFixed(3)}</td>
                  {showCost && (
                    <>
                      <td className={`num mono ${['LABOUR_EARNED', 'ADVANCE_ADJUSTED'].includes(e.type) ? 'text-emerald-600' : ['ADVANCE_PAID', 'WASTAGE_RECOVERY'].includes(e.type) ? 'text-rose-600' : ''}`}>
                        {e.amount ? (['ADVANCE_PAID', 'WASTAGE_RECOVERY'].includes(e.type) ? '-' : '') + formatINR(Number(e.amount)) : "—"}
                      </td>
                      <td className="num mono font-medium">{formatINR(e.payableBalance)}</td>
                    </>
                  )}
                  <td className="text-ink2">{e.note ?? "—"}</td>
                </tr>
              ))}
              {ledgerWithBalances?.length === 0 && (
                <tr>
                  <td colSpan={showCost ? 7 : 5} className="py-8 text-center text-mute">
                    No ledger entries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const RATE_BASIS_OPTIONS = [
  { value: "PER_GRAM", label: "Per Gram" },
  { value: "PER_PIECE", label: "Per Piece" },
  { value: "PER_CARAT", label: "Per Carat" },
  { value: "DAILY_WAGE", label: "Daily Wage" },
] as const;

// Job-card labour entries auto-fill their rate from here by karigar + stage;
// without a row here, PRODUCTION-role users can't log labour at all (they're
// not allowed to type a rate manually — only Manager/Super Admin can).
function StageRatesPanel({
  karigarId,
  stageRates,
  processStages,
  editable,
  onChange,
}: {
  karigarId: string;
  stageRates: StageRate[];
  processStages: ProcessStage[];
  editable: boolean;
  onChange: () => void;
}) {
  const [stageId, setStageId] = useState("");
  const [rateBasis, setRateBasis] = useState<StageRate["rateBasis"]>("PER_GRAM");
  const [rate, setRate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveRates(next: { processStageId: string; rateBasis: string; rate: number }[]) {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/masters/karigars/${karigarId}`, {
        method: "PATCH",
        body: { stageRates: next },
      });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save rate");
    } finally {
      setSubmitting(false);
    }
  }

  async function addRate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!stageId || !rate) return;
    const next = [
      ...stageRates
        .filter((r) => r.processStageId !== stageId)
        .map((r) => ({ processStageId: r.processStageId, rateBasis: r.rateBasis, rate: Number(r.rate) })),
      { processStageId: stageId, rateBasis, rate: Number(rate) },
    ];
    await saveRates(next);
    setStageId("");
    setRate("");
  }

  async function removeRate(processStageId: string) {
    const next = stageRates
      .filter((r) => r.processStageId !== processStageId)
      .map((r) => ({ processStageId: r.processStageId, rateBasis: r.rateBasis, rate: Number(r.rate) }));
    await saveRates(next);
  }

  return (
    <div className="console-panel overflow-hidden mb-3.5">
      <div className="ph">Stage Rates (used to price labour entries at the job card)</div>
      <div className="p-3.5">
        {stageRates.length > 0 ? (
          <table className="console-table mb-3">
            <thead>
              <tr>
                <th>Stage</th>
                <th>Basis</th>
                <th className="num">Rate</th>
                {editable && <th></th>}
              </tr>
            </thead>
            <tbody>
              {stageRates.map((r) => (
                <tr key={r.id}>
                  <td>{r.processStage?.name ?? "—"}</td>
                  <td>{r.rateBasis.replace(/_/g, " ")}</td>
                  <td className="num mono">{formatINR(Number(r.rate))}</td>
                  {editable && (
                    <td>
                      <button
                        className="text-mute hover:text-err-tx text-xs"
                        disabled={submitting}
                        onClick={() => removeRate(r.processStageId)}
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-mute mb-3">
            No stage rates set — labour entries for this karigar will need a manually typed rate (Manager/Super
            Admin only), or will fail for other roles.
          </p>
        )}
        {editable && (
          <form onSubmit={addRate} className="flex flex-wrap items-end gap-2">
            <div>
              <label className="console-field-label">Stage</label>
              <select required className="console-field" value={stageId} onChange={(e) => setStageId(e.target.value)}>
                <option value="">Select…</option>
                {processStages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="console-field-label">Rate Basis</label>
              <select
                className="console-field"
                value={rateBasis}
                onChange={(e) => setRateBasis(e.target.value as StageRate["rateBasis"])}
              >
                {RATE_BASIS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="console-field-label">Rate (₹)</label>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                className="console-field w-28"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
            <button className="console-btn primary" disabled={submitting}>
              {submitting ? "Saving…" : "Add / Update Rate"}
            </button>
          </form>
        )}
        {error && <p className="text-sm text-err-tx mt-2">{error}</p>}
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  alert,
}: {
  icon: typeof Gem;
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div className="console-panel px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide text-mute mb-1.5">
        <Icon size={12} />
        {label}
      </div>
      <div className={`text-xl font-bold mono ${alert ? "text-warn-tx" : "text-ink"}`}>{value}</div>
    </div>
  );
}
