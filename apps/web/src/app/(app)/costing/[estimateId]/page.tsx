"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApi, useKarats, useStoneTypes, useCustomers } from "@/lib/hooks";
import { apiFetch, ApiError, openAuthenticated } from "@/lib/api";
import { EstimateStatusPill } from "@/components/StatusPill";
import { formatINR, formatDate } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { type EstimateLine, HEADS, MATERIAL_HEADS, CHARGE_HEADS, SectionCard } from "@/components/EstimateLines";
import { ProductionPanel } from "@/components/ProductionPanel";

interface Estimate {
  id: string;
  estimateNo: string | null;
  productId: string;
  type: string;
  version: number;
  status: string;
  goldRateSnapshot24k: string;
  estimateDate: string;
  profitPct: string;
  materialCost: string;
  makingCharges: string;
  otherCharges: string;
  wastageCost: string;
  cost: string;
  profit: string;
  gstPct: string;
  gstAmount: string;
  netAmount: string;
  lines: EstimateLine[];
  product: { serialNo: string; designName: string; grossWeightG: number | null };
  customerId: string | null;
  customer: { id: string; name: string } | null;
  jobCards: { id: string; targetDeliveryDate?: string | Date | null }[];
  quotationSentAt: string | null;
}

export default function EstimatePage({ params }: { params: Promise<{ estimateId: string }> }) {
  const { estimateId } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { data: estimate, mutate } = useApi<Estimate>(`/api/estimates/${estimateId}`);
  const { data: karats } = useKarats();
  const { data: stoneTypes } = useStoneTypes();
  const { data: customers } = useCustomers();
  const [profitPct, setProfitPct] = useState<string | null>(null);
  const [gstPct, setGstPct] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertingOrder, setConvertingOrder] = useState(false);
  const [amending, setAmending] = useState(false);
  const [refreshingRate, setRefreshingRate] = useState(false);
  const [pullingLabour, setPullingLabour] = useState(false);
  const [pullingWastage, setPullingWastage] = useState(false);
  const [sendingQuotation, setSendingQuotation] = useState(false);
  const [recordingApproval, setRecordingApproval] = useState(false);

  if (!estimate) return <div className="text-mute">Loading…</div>;

  const editable = estimate.status === "DRAFT";
  const canUnlock = user?.role === "SUPER_ADMIN" && estimate.status === "SUBMITTED";
  const canAmend = user?.role === "SUPER_ADMIN" && estimate.status === "APPROVED";
  const linesByHead = (head: EstimateLine["head"]) => estimate.lines.filter((l) => l.head === head);
  const subtotal = (head: EstimateLine["head"]) =>
    linesByHead(head).reduce((sum, l) => sum + Number(l.amount), 0);

  async function saveProfitPct() {
    if (profitPct === null) return;
    try {
      await apiFetch(`/api/estimates/${estimateId}`, { method: "PATCH", body: { profitPct: Number(profitPct) } });
      setProfitPct(null);
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function saveGstPct() {
    if (gstPct === null) return;
    try {
      await apiFetch(`/api/estimates/${estimateId}`, { method: "PATCH", body: { gstPct: Number(gstPct) } });
      setGstPct(null);
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function approve() {
    try {
      await apiFetch(`/api/estimates/${estimateId}/approve`, { method: "POST" });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function deleteLine(lineId: string) {
    await apiFetch(`/api/estimates/lines/${lineId}`, { method: "DELETE" });
    await mutate();
  }

  async function unlock() {
    setError(null);
    try {
      await apiFetch(`/api/estimates/${estimateId}/unlock`, { method: "POST" });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function amend() {
    setError(null);
    if (
      !window.confirm(
        "This reverses the invoice already posted to the customer's ledger and reopens the estimate for editing. A corrected invoice is posted when you re-approve. Continue?"
      )
    ) {
      return;
    }
    setAmending(true);
    try {
      await apiFetch(`/api/estimates/${estimateId}/amend`, { method: "POST" });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setAmending(false);
    }
  }

  async function saveCustomer(customerId: string) {
    if (!customerId) return;
    try {
      await apiFetch(`/api/estimates/${estimateId}`, { method: "PATCH", body: { customerId } });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function convertToFinalCosting() {
    setError(null);
    setConverting(true);
    try {
      const created = await apiFetch<{ id: string }>(`/api/estimates/${estimateId}/convert-to-final-costing`, {
        method: "POST",
      });
      router.push(`/costing/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
      setConverting(false);
    }
  }

  async function sendQuotation() {
    setError(null);
    setSendingQuotation(true);
    try {
      await apiFetch(`/api/estimates/${estimateId}/send-quotation`, { method: "POST" });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setSendingQuotation(false);
    }
  }

  async function recordApproval() {
    setError(null);
    setRecordingApproval(true);
    try {
      await apiFetch(`/api/estimates/${estimateId}/record-approval`, { method: "POST" });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setRecordingApproval(false);
    }
  }

  async function convertToJobCard() {
    setError(null);
    setConvertingOrder(true);
    try {
      const created = await apiFetch<{ id: string }>(`/api/estimates/${estimateId}/convert-to-jobcard`, {
        method: "POST",
      });
      router.push(`/job-cards/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
      setConvertingOrder(false);
    }
  }

  async function refreshGoldRate() {
    setError(null);
    setRefreshingRate(true);
    try {
      await apiFetch(`/api/estimates/${estimateId}/refresh-gold-rate`, { method: "POST" });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setRefreshingRate(false);
    }
  }

  async function pullLabour() {
    setError(null);
    setPullingLabour(true);
    try {
      await apiFetch(`/api/estimates/${estimateId}/pull-labour`, { method: "POST" });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setPullingLabour(false);
    }
  }

  async function pullWastage() {
    setError(null);
    setPullingWastage(true);
    try {
      await apiFetch(`/api/estimates/${estimateId}/pull-wastage`, { method: "POST" });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setPullingWastage(false);
    }
  }

  return (
    <div>
      <div className="mb-2">
        <div className="text-[11px] text-mute mb-1">
          <Link href="/costing" className="hover:text-accent">
            Sales
          </Link>
        </div>
        <h1 className="text-[19px] font-semibold flex items-center gap-2.5 flex-wrap text-ink">
          {estimate.estimateNo ?? "Estimate"} —{" "}
          <Link href={`/products/${estimate.product.serialNo}`} className="mono text-accent">
            {estimate.product.serialNo}
          </Link>
          <EstimateStatusPill status={estimate.status} />
          <span className="text-xs text-mute font-medium mono">
            {estimate.type.replace(/_/g, " ")} · V{estimate.version}
          </span>
        </h1>
      </div>

      <div className="flex items-center gap-2 flex-wrap py-2.5 border-t border-b border-line -mx-3.5 px-3.5 sm:-mx-[18px] sm:px-[18px] mb-3.5">
        {estimate.status === "DRAFT" && (
          <>
            <button className="console-btn" onClick={sendQuotation} disabled={sendingQuotation}>
              {sendingQuotation ? "Sending…" : "Send for Client Approval"}
            </button>
            <button className="console-btn primary" onClick={recordApproval} disabled={recordingApproval}>
              Client Already Approved
            </button>
          </>
        )}
        {estimate.status === "SUBMITTED" && (
          <button className="console-btn primary" onClick={recordApproval} disabled={recordingApproval}>
            {recordingApproval ? "Recording…" : "Record Client Approval"}
          </button>
        )}
        {estimate.status === "APPROVED" &&
          (estimate.jobCards && estimate.jobCards.length > 0 ? (
            <Link href={`/job-cards/${estimate.jobCards[0].id}`} className="console-btn primary flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 flex items-center justify-center">⛟</span> View Job Card {estimate.jobCards[0].id.split('-').pop()}
            </Link>
          ) : (
            <button className="console-btn primary flex items-center gap-1.5" onClick={convertToJobCard} disabled={convertingOrder}>
              <span className="w-3.5 h-3.5 flex items-center justify-center">⛟</span> {convertingOrder ? "Moving…" : "Move to Production"}
            </button>
          ))}
        
        {/* Helper Actions */}
        {editable && (
          <>
            <button className="console-btn" onClick={refreshGoldRate} disabled={refreshingRate}>
              {refreshingRate ? "Refreshing…" : "Refresh Gold Rate"}
            </button>
            {estimate.type === "FINAL_COSTING" && (
              <>
                <button className="console-btn" onClick={pullLabour} disabled={pullingLabour}>
                  {pullingLabour ? "Pulling…" : "Pull Labour"}
                </button>
                <button className="console-btn" onClick={pullWastage} disabled={pullingWastage}>
                  {pullingWastage ? "Pulling…" : "Pull Wastage"}
                </button>
              </>
            )}
          </>
        )}
        {canUnlock && (
          <button className="console-btn" onClick={unlock}>
            Unlock for Editing
          </button>
        )}
        {canAmend && (
          <button className="console-btn text-err-tx" onClick={amend} disabled={amending}>
            {amending ? "Amending…" : "Amend (Super Admin)"}
          </button>
        )}
        <button className="console-btn" onClick={() => openAuthenticated(`/api/estimates/${estimateId}/pdf`)}>
          Export PDF
        </button>
        <button className="console-btn" onClick={() => openAuthenticated(`/api/estimates/${estimateId}/excel`)}>
          Export Excel
        </button>
        <div className="flex-1" />
        {estimate.quotationSentAt && (
          <div className="text-[11px] text-mute">Quotation sent {formatDate(estimate.quotationSentAt)}</div>
        )}
        <div className="text-xs text-ink2">
          It costs <span className="mono font-semibold text-ink">{formatINR(Number(estimate.cost))}</span> to make ·
          customer pays <span className="mono font-semibold text-accent">{formatINR(Number(estimate.netAmount))}</span>
        </div>
      </div>

      {error && <p className="text-sm text-err-tx mb-3">{error}</p>}

      {estimate.type !== "FINAL_COSTING" && (
        <ProductionPanel productId={estimate.productId} customerId={estimate.customerId} estimateId={estimateId} />
      )}

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        {/* Left Side: Fields & Items (2/3) */}
        <div className="lg:col-span-2 space-y-4 min-w-0">
          
          {/* Header Panel */}
          <div className="bg-white border border-slate-200 rounded-md p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="console-field-label">Estimate #</label>
              <input className="console-field" value={estimate.estimateNo ?? "—"} disabled />
            </div>

            <div>
              <label className="console-field-label">Design</label>
              <input className="console-field" value={`${estimate.product.designName} (${estimate.product.serialNo})`} disabled />
            </div>

            <div>
              <label className="console-field-label">Customer</label>
              {editable ? (
                <select className="console-field" value={estimate.customerId ?? ""} onChange={(e) => saveCustomer(e.target.value)}>
                  <option value="">Not set…</option>
                  {customers?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="console-field-static">{estimate.customer?.name ?? "Not set"}</div>
              )}
              {editable && (
                <p className="text-[10.5px] text-mute mt-1 mb-0">Pick who this estimate is for.</p>
              )}
            </div>

            <div>
              <label className="console-field-label">Type</label>
              <div className="console-field-static">{estimate.type.replace(/_/g, " ")}</div>
            </div>

            <div>
              <label className="console-field-label">Estimate Date</label>
              <div className="console-field-static">{formatDate(estimate.estimateDate)}</div>
            </div>

            <div>
              <label className="console-field-label">Status</label>
              <div className="pt-1">
                <EstimateStatusPill status={estimate.status} />
              </div>
            </div>
          </div>

          {/* Lines Panel */}
          <div className="bg-white border border-slate-200 rounded-md p-4 overflow-x-auto min-w-0">
            <div className="text-[11px] font-bold uppercase text-ink2 tracking-wide mb-1.5">1. Materials — Gold &amp; Stones</div>
            {HEADS.filter((h) => MATERIAL_HEADS.includes(h.key)).map((h) => (
              <SectionCard
                key={h.key}
                head={h.key}
                label={h.label}
                unit={h.unit}
                hint={h.hint}
                lines={linesByHead(h.key)}
                subtotal={subtotal(h.key)}
                editable={editable}
                estimateId={estimateId}
                karats={karats ?? []}
                stoneTypes={stoneTypes ?? []}
                goldLines={linesByHead("GOLD")}
                goldRate24k={Number(estimate.goldRateSnapshot24k)}
                onChange={mutate}
                onDeleteLine={deleteLine}
              />
            ))}

            <div className="text-[11px] font-bold uppercase text-ink2 tracking-wide mt-4 mb-1.5">2. Making, Other Charges &amp; Wastage</div>
            {HEADS.filter((h) => CHARGE_HEADS.includes(h.key)).map((h) => (
              <SectionCard
                key={h.key}
                head={h.key}
                label={h.label}
                unit={h.unit}
                hint={h.hint}
                lines={linesByHead(h.key)}
                subtotal={subtotal(h.key)}
                editable={editable}
                estimateId={estimateId}
                karats={karats ?? []}
                stoneTypes={stoneTypes ?? []}
                goldLines={linesByHead("GOLD")}
                goldRate24k={Number(estimate.goldRateSnapshot24k)}
                onChange={mutate}
                onDeleteLine={deleteLine}
              />
            ))}

            {/* Finished Product Composition */}
            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="text-[12px] font-semibold text-slate-800 mb-1">Finished Product Composition</div>
              <div className="text-[10px] text-slate-400 mb-3 leading-relaxed">
                Client ki Chowker Excel methodology — Pure Gold + Stone Equivalent + Wax/Wire/Other Non-Gold. Ye finished product ka weight hai, costing charges se alag (Chizzat ek costing line hai, weight ka hissa nahi).
              </div>
              
              {(() => {
                const goldWt = linesByHead("GOLD").reduce((sum, l) => sum + Number(l.quantity), 0);
                const stoneCt = linesByHead("POLKI").reduce((sum, l) => sum + Number(l.quantity), 0) + linesByHead("COLOURED_STONE").reduce((sum, l) => sum + Number(l.quantity), 0);
                const stoneEquivWt = Number((stoneCt / 5).toFixed(2));
                const grossWt = Number(estimate.product?.grossWeightG) || 0;
                const nonGoldWt = Math.max(0, Number((grossWt - goldWt - stoneEquivWt).toFixed(2)));
                
                return (
                  <div className="flex items-center gap-2 text-[12px] flex-wrap">
                    <div className="flex-1 min-w-[110px] bg-slate-50 border border-slate-200 rounded-md p-2 text-center">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Pure Gold</div>
                      <div className="text-[15px] font-semibold text-slate-900 mono">{goldWt.toFixed(2)} g</div>
                    </div>
                    <div className="text-slate-300 font-semibold">+</div>
                    <div className="flex-1 min-w-[110px] bg-slate-50 border border-slate-200 rounded-md p-2 text-center">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Stone Equivalent</div>
                      <div className="text-[15px] font-semibold text-slate-900 mono">{stoneEquivWt.toFixed(2)} g</div>
                      <div className="text-[9.5px] text-slate-400 mt-0.5">{stoneCt.toFixed(2)} ct ÷ 5</div>
                    </div>
                    <div className="text-slate-300 font-semibold">+</div>
                    <div className="flex-1 min-w-[110px] bg-slate-50 border border-slate-200 rounded-md p-2 text-center">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Wax / Wire / Other</div>
                      <div className="text-[15px] font-semibold text-slate-900 mono">{nonGoldWt.toFixed(2)} g</div>
                    </div>
                    <div className="text-slate-300 font-semibold">=</div>
                    <div className="flex-1 min-w-[110px] bg-blue-50 border border-blue-200 rounded-md p-2 text-center">
                      <div className="text-[10px] text-blue-700 uppercase tracking-wider mb-0.5">Gross Product Weight</div>
                      <div className="text-[15px] font-semibold text-blue-900 mono">{grossWt.toFixed(2)} g</div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Approval & Production Trail */}
            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="text-[12px] font-semibold text-slate-800 mb-3">Approval &amp; Production Trail</div>
              <ActivityTimeline sources={[{ entityType: "Estimate", entityId: estimateId }]} defaultOpen={true} />
            </div>

          </div>
        </div>

        {/* Right Side: Live Summary (1/3) */}
        <div className="lg:col-span-1 p-4 bg-[#FFFCF5] border border-slate-200 rounded-md lg:sticky lg:top-[60px]">
          <div className="text-[11px] uppercase text-mute font-bold mb-2.5">Live Summary</div>

          <div className="console-sumrow">
            <span className="l">Gold &amp; Stones</span>
            <span className="v">{formatINR(Number(estimate.materialCost))}</span>
          </div>
          <div className="console-sumrow">
            <span className="l">Making Charges</span>
            <span className="v">{formatINR(Number(estimate.makingCharges))}</span>
          </div>
          <div className="console-sumrow">
            <span className="l">Other Charges</span>
            <span className="v">{formatINR(Number(estimate.otherCharges))}</span>
          </div>
          <div className="console-sumrow">
            <span className="l">Wastage</span>
            <span className="v">{formatINR(Number(estimate.wastageCost))}</span>
          </div>
          <div className="console-sumrow total">
            <span className="l">Total Cost</span>
            <span className="v">{formatINR(Number(estimate.cost))}</span>
          </div>

          <div className="console-sumrow items-center">
            <span className="l">Your Profit %</span>
            {editable ? (
              <input
                className="console-field w-20 text-right mono"
                type="number"
                step="0.01"
                defaultValue={estimate.profitPct}
                onChange={(e) => setProfitPct(e.target.value)}
                onBlur={saveProfitPct}
              />
            ) : (
              <span className="v">{Number(estimate.profitPct)}%</span>
            )}
          </div>
          <div className="console-sumrow">
            <span className="l">Profit Amount</span>
            <span className="v">{formatINR(Number(estimate.profit))}</span>
          </div>

          <div className="console-sumrow items-center">
            <span className="l">GST %</span>
            {editable ? (
              <input
                className="console-field w-20 text-right mono"
                type="number"
                step="0.01"
                defaultValue={estimate.gstPct}
                onChange={(e) => setGstPct(e.target.value)}
                onBlur={saveGstPct}
              />
            ) : (
              <span className="v">{Number(estimate.gstPct)}%</span>
            )}
          </div>
          <div className="console-sumrow">
            <span className="l">GST Amount</span>
            <span className="v">{formatINR(Number(estimate.gstAmount))}</span>
          </div>

          <div style={{ marginTop: 12, padding: 16, background: "#FFF3DA", border: "1px solid #F3DFAE", borderRadius: 6 }}>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em", color: "#92400E", fontWeight: 700, marginBottom: 4 }}>
              Customer Pays — final bill, GST included
            </div>
            <div className="mono" style={{ fontSize: 28, fontWeight: 800, color: "#78350F" }}>
              {formatINR(Number(estimate.netAmount))}
            </div>
          </div>

          {editable && (
            <>
              <button className="console-btn primary w-full justify-center mt-3 py-2.5 text-[13px]" onClick={approve}>
                Approve &amp; Lock
              </button>
              <p className="text-[11px] text-ink2 mt-2">
                Once you hit &quot;Approve &amp; Lock&quot;, this can&apos;t be edited — you&apos;d need to create a new version instead.
              </p>
            </>
          )}

          {estimate.status === "APPROVED" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 mt-4">
              <div className="text-[11px] text-emerald-800 font-medium flex items-center gap-1.5">
                Client Approved
              </div>
              <div className="text-[11px] text-emerald-700 mt-1">Target delivery: {estimate.jobCards?.[0]?.targetDeliveryDate ? formatDate(estimate.jobCards[0].targetDeliveryDate.toString()) : "—"}</div>
              {estimate.jobCards && estimate.jobCards.length > 0 ? (
                <div className="text-[11px] text-emerald-700 mt-0.5">Job Card: <span className="mono">{estimate.jobCards[0].id.split('-').pop()}</span></div>
              ) : (
                <div className="text-[11px] text-emerald-700 mt-0.5">Pending move to production</div>
              )}
            </div>
          )}
        </div>
      </div>

      <ActivityTimeline sources={[{ entityType: "Estimate", entityId: estimateId }]} defaultOpen />
    </div>
  );
}
