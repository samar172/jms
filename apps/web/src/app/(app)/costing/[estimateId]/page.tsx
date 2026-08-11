"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApi, useKarats, useStoneTypes, useKarigars, useCustomers, useProcessStages } from "@/lib/hooks";
import { apiFetch, ApiError, openAuthenticated } from "@/lib/api";
import { EstimateStatusPill } from "@/components/StatusPill";
import { formatINR, formatDate } from "@/lib/format";
import { deriveRate } from "@jms/shared";
import { useAuth } from "@/lib/auth-context";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { JobStageCard, type JobStage } from "@/components/JobStageCard";

interface EstimateLine {
  id: string;
  head: "GOLD" | "POLKI" | "COLOURED_STONE" | "MAKING" | "OTHER" | "WASTAGE";
  description: string | null;
  karigarName: string | null;
  quantity: string;
  pieces: number | null;
  rateBasis: "PER_CARAT" | "PER_PIECE" | null;
  rate: string;
  amount: string;
  sourceType: string;
}
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
  product: { serialNo: string; designName: string };
  customerId: string | null;
  customer: { id: string; name: string } | null;
  order: { id: string; orderNo: string } | null;
  quotationSentAt: string | null;
}

interface JobCardSummary {
  id: string;
  status: string;
}
interface JobCardDetail {
  id: string;
  status: string;
  product: { purity: { purityFactor: string } };
  stages: JobStage[];
}

const HEADS: { key: EstimateLine["head"]; label: string; unit: string; hint: string }[] = [
  { key: "GOLD", label: "Gold / Metal", unit: "g", hint: "Enter purity + weight in grams — rate is filled in automatically from today's gold rate." },
  { key: "POLKI", label: "Polki", unit: "ct", hint: "Enter stone type + weight in carats (or a flat rate per piece)." },
  { key: "COLOURED_STONE", label: "Coloured Stones", unit: "kt", hint: "Enter stone type + weight in karat (1 karat = 100 cent), or a flat rate per piece." },
  { key: "MAKING", label: "Making Charges", unit: "", hint: "Pull in from approved karigar labour entries, or add a flat lumpsum amount." },
  { key: "OTHER", label: "Other Charges", unit: "", hint: "Anything else — packaging, certification, hallmarking, etc." },
  { key: "WASTAGE", label: "Wastage", unit: "g", hint: "Add a % of a gold line's weight (priced at the 24K rate) or a flat lumpsum — or pull in actual recorded wastage once production is done." },
];

const MATERIAL_HEADS: EstimateLine["head"][] = ["GOLD", "POLKI", "COLOURED_STONE"];
const CHARGE_HEADS: EstimateLine["head"][] = ["MAKING", "OTHER", "WASTAGE"];

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
      await openAuthenticated(`/api/estimates/${estimateId}/pdf`);
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setSendingQuotation(false);
    }
  }

  async function convertToOrder() {
    setError(null);
    setConvertingOrder(true);
    try {
      const created = await apiFetch<{ id: string }>(`/api/estimates/${estimateId}/convert-to-order`, {
        method: "POST",
      });
      router.push(`/orders/${created.id}`);
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
        {editable && estimate.type === "FINAL_COSTING" && (
          <>
            <button className="console-btn" onClick={refreshGoldRate} disabled={refreshingRate}>
              {refreshingRate ? "Refreshing…" : "Refresh Gold Rate"}
            </button>
            <button className="console-btn" onClick={pullLabour} disabled={pullingLabour}>
              {pullingLabour ? "Pulling…" : "Pull Labour"}
            </button>
            <button className="console-btn" onClick={pullWastage} disabled={pullingWastage}>
              {pullingWastage ? "Pulling…" : "Pull Wastage"}
            </button>
          </>
        )}
        {!editable && (
          <>
            {estimate.type === "ROUGH_ESTIMATE" && (
              <button className="console-btn" onClick={convertToFinalCosting} disabled={converting}>
                {converting ? "Sending…" : "Send to Production"}
              </button>
            )}
            {estimate.type === "FINAL_COSTING" &&
              estimate.status === "APPROVED" &&
              (estimate.order ? (
                <Link href={`/orders/${estimate.order.id}`} className="console-btn primary">
                  View Order {estimate.order.orderNo}
                </Link>
              ) : (
                <button className="console-btn primary" onClick={convertToOrder} disabled={convertingOrder}>
                  {convertingOrder ? "Converting…" : "Convert to Order"}
                </button>
              ))}
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
            <button className="console-btn" onClick={sendQuotation} disabled={sendingQuotation}>
              {sendingQuotation ? "Sending…" : "Send Quotation"}
            </button>
            <button className="console-btn" onClick={() => openAuthenticated(`/api/estimates/${estimateId}/pdf`)}>
              Export PDF
            </button>
            <button className="console-btn" onClick={() => openAuthenticated(`/api/estimates/${estimateId}/excel`)}>
              Export Excel
            </button>
          </>
        )}
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

      {estimate.type === "FINAL_COSTING" && (
        <ProductionPanel productId={estimate.productId} customerId={estimate.customerId} />
      )}

      <div className="grid lg:grid-cols-[240px_1fr_320px] border border-line rounded-md bg-panel overflow-hidden items-start">
        <div className="border-b lg:border-b-0 lg:border-r border-line p-3.5">
          <label className="console-field-label">Estimate #</label>
          <input className="console-field" value={estimate.estimateNo ?? "—"} disabled />

          <label className="console-field-label">Design</label>
          <input className="console-field" value={`${estimate.product.designName} (${estimate.product.serialNo})`} disabled />

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
            <p className="text-[10.5px] text-mute -mt-1 mb-0">Same design, different customer? Pick who this estimate is for.</p>
          )}

          <label className="console-field-label">Type</label>
          <div className="console-field-static">{estimate.type.replace(/_/g, " ")}</div>

          <label className="console-field-label">Estimate Date</label>
          <div className="console-field-static">{formatDate(estimate.estimateDate)}</div>

          <label className="console-field-label">Status</label>
          <div className="pb-1">
            <EstimateStatusPill status={estimate.status} />
          </div>
        </div>

        <div className="p-3.5 overflow-x-auto min-w-0">
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
        </div>

        <div className="p-4 bg-[#FFFCF5] border-t lg:border-t-0 lg:border-l border-line lg:sticky lg:top-[60px] self-start">
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
        </div>
      </div>

      <ActivityTimeline sources={[{ entityType: "Estimate", entityId: estimateId }]} defaultOpen />
    </div>
  );
}

// Lets a manager create the job card and assign a karigar per process stage
// right from Final Costing — the same design is often split across several
// karigars (one per stage), so a single "karigar" field on the estimate isn't
// enough; "Pull Labour" then picks up each stage's approved labour separately.
function ProductionPanel({ productId, customerId }: { productId: string; customerId: string | null }) {
  const { data: jobCards, mutate } = useApi<JobCardSummary[]>(`/api/job-cards?productId=${productId}`);
  const { data: stages } = useProcessStages();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleStage(id: string) {
    setSelectedStages((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function createJobCard() {
    if (selectedStages.length === 0) {
      setError("Select at least one process stage");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const orderedStageIds = (stages ?? [])
        .filter((s) => selectedStages.includes(s.id))
        .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
        .map((s) => s.id);
      await apiFetch("/api/job-cards", {
        method: "POST",
        body: { productId, customerId: customerId || undefined, processStageIds: orderedStageIds },
      });
      setShowCreate(false);
      setSelectedStages([]);
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create job card");
    } finally {
      setCreating(false);
    }
  }

  const activeCards = jobCards?.filter((jc) => jc.status !== "CLOSED") ?? [];

  return (
    <div className="console-panel p-3.5 mb-3.5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-[12.5px] font-semibold text-ink">Production — Job Card &amp; Karigar Assignment</h3>
        {jobCards && activeCards.length === 0 && !showCreate && (
          <button className="console-btn" onClick={() => setShowCreate(true)}>
            + Create Job Card
          </button>
        )}
      </div>

      {error && <p className="text-sm text-err-tx mb-2">{error}</p>}

      {jobCards && activeCards.length === 0 && showCreate && (
        <div className="bg-neu-bg p-3 rounded-md">
          <label className="console-field-label">Process Stages</label>
          <div className="space-y-1.5 mb-2">
            {stages
              ?.slice()
              .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
              .map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-[12.5px] text-ink">
                  <input type="checkbox" checked={selectedStages.includes(s.id)} onChange={() => toggleStage(s.id)} />
                  {s.name}
                </label>
              ))}
          </div>
          <div className="flex gap-2">
            <button className="console-btn primary" disabled={creating} onClick={createJobCard}>
              {creating ? "Creating…" : "Create Job Card"}
            </button>
            <button className="console-btn" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {activeCards.map((jc) => (
        <JobCardStages key={jc.id} jobCardId={jc.id} />
      ))}
    </div>
  );
}

// Fetches the same full detail the standalone job-cards/[id] page uses, so
// each stage can expand into the exact same JobStageCard — material issue,
// receive/reconcile, wastage exceptions, labour — right here, no page-hop.
// Compact table by default (matches the rest of the costing page's density)
// with a per-stage "Details" toggle that expands the same full JobStageCard
// used on the standalone job-cards/[id] page — issue/receive/wastage/labour,
// all reachable from here, but only for the one stage actually being worked
// on at a time, not all of them stretched open at once.
function JobCardStages({ jobCardId }: { jobCardId: string }) {
  const { data: jobCard, mutate } = useApi<JobCardDetail>(`/api/job-cards/${jobCardId}`);
  const { data: karigars, mutate: mutateKarigars } = useKarigars();
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [busyStage, setBusyStage] = useState<string | null>(null);
  const [stageKarigar, setStageKarigar] = useState<Record<string, string>>({});
  const [assigningStage, setAssigningStage] = useState<string | null>(null);

  if (!jobCard) return null;

  async function assignKarigar(stageId: string, currentKarigarId: string | null) {
    const karigarId = stageKarigar[stageId] ?? currentKarigarId;
    if (!karigarId) return;
    setAssigningStage(stageId);
    try {
      await apiFetch(`/api/job-cards/stages/${stageId}`, { method: "PATCH", body: { karigarId } });
      await mutate();
    } finally {
      setAssigningStage(null);
    }
  }

  const sortedStages = jobCard.stages.slice().sort((a, b) => a.processStage.sequenceOrder - b.processStage.sequenceOrder);
  const expanded = sortedStages.find((s) => s.id === expandedStage);

  return (
    <div className="mb-2 last:mb-0">
      <table className="console-etable">
        <thead>
          <tr>
            <th>Stage</th>
            <th>Status</th>
            <th>Karigar</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sortedStages.map((stage) => (
            <tr key={stage.id}>
              <td>{stage.processStage.name}</td>
              <td>
                <span className="console-pill neu">{stage.status}</span>
              </td>
              <td>
                <select
                  className="console-field w-auto"
                  value={stageKarigar[stage.id] ?? stage.karigarId ?? ""}
                  onChange={(e) => setStageKarigar((prev) => ({ ...prev, [stage.id]: e.target.value }))}
                >
                  <option value="">Unassigned</option>
                  {karigars?.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <button
                  className="console-btn"
                  disabled={
                    assigningStage === stage.id || !stageKarigar[stage.id] || stageKarigar[stage.id] === stage.karigarId
                  }
                  onClick={() => assignKarigar(stage.id, stage.karigarId)}
                >
                  {assigningStage === stage.id ? "Saving…" : "Assign"}
                </button>
              </td>
              <td>
                <button
                  className="text-[11px] text-accent hover:underline"
                  onClick={() => setExpandedStage(expandedStage === stage.id ? null : stage.id)}
                >
                  {expandedStage === stage.id ? "Hide" : "Issue Material"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {expanded && (
        <div className="mt-2">
          <JobStageCard
            stage={expanded}
            purityFactor={Number(jobCard.product.purity.purityFactor)}
            karigars={karigars ?? []}
            onKarigarCreated={() => mutateKarigars()}
            busy={busyStage === expanded.id}
            setBusy={(v) => setBusyStage(v ? expanded.id : null)}
            onChange={() => mutate()}
          />
        </div>
      )}

      <Link href={`/job-cards/${jobCard.id}`} className="text-[11px] text-accent hover:underline">
        Open full job card →
      </Link>
    </div>
  );
}

function SectionCard({
  head,
  label,
  unit,
  hint,
  lines,
  subtotal,
  editable,
  estimateId,
  karats,
  stoneTypes,
  goldLines,
  goldRate24k,
  onChange,
  onDeleteLine,
}: {
  head: EstimateLine["head"];
  label: string;
  unit: string;
  hint: string;
  lines: EstimateLine[];
  subtotal: number;
  editable: boolean;
  estimateId: string;
  karats: { id: string; code: string; purityFactor: string }[];
  stoneTypes: { id: string; name: string; category: string }[];
  goldLines: EstimateLine[];
  goldRate24k: number;
  onChange: () => void;
  onDeleteLine: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="text-[12.5px] font-semibold text-ink">{label}</h3>
        <span className="mono text-xs font-semibold text-ink shrink-0">{formatINR(subtotal)}</span>
      </div>
      <p className="text-[11px] text-mute mb-1.5">{hint}</p>
      {head === "GOLD" && karats.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink2">
          <span className="font-medium text-ink">Indicative rate/g today:</span>
          {karats.map((k) => (
            <span key={k.id} className="mono">
              {k.code}: <span className="text-ink font-medium">{formatINR(deriveRate(goldRate24k, Number(k.purityFactor)))}</span>
            </span>
          ))}
        </div>
      )}
      {lines.length > 0 && (
        <div className="overflow-x-auto mb-1.5">
          <table className="console-etable">
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Amount</th>
                {editable && <th></th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.description ?? "—"}
                    {l.karigarName && <span className="text-mute"> · {l.karigarName}</span>}
                  </td>
                  <td className="mono">
                    {l.rateBasis === "PER_PIECE" && l.pieces
                      ? `${l.pieces} pc`
                      : unit
                        ? `${Number(l.quantity)} ${unit}${l.pieces ? ` (${l.pieces} pc)` : ""}`
                        : "—"}
                  </td>
                  <td className="mono text-ink2">
                    {formatINR(Number(l.rate))}
                    {l.rateBasis === "PER_PIECE" ? "/pc" : ""}
                  </td>
                  <td className="mono font-semibold">{formatINR(Number(l.amount))}</td>
                  {editable && (
                    <td>
                      <button className="text-mute hover:text-err-tx text-xs" onClick={() => onDeleteLine(l.id)}>
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editable && (
        <>
          <button className="text-[11px] text-accent font-medium hover:underline" onClick={() => setShowForm((s) => !s)}>
            + Add {label} Line
          </button>
          {showForm && head === "MAKING" && (
            <LumpsumAddForm
              head={head}
              estimateId={estimateId}
              onDone={() => {
                setShowForm(false);
                onChange();
              }}
            />
          )}
          {showForm && head === "WASTAGE" && (
            <WastageAddForm
              estimateId={estimateId}
              goldLines={goldLines}
              goldRate24k={goldRate24k}
              onDone={() => {
                setShowForm(false);
                onChange();
              }}
            />
          )}
          {showForm && !["MAKING", "WASTAGE"].includes(head) && (
            <AddLineForm
              head={head}
              estimateId={estimateId}
              karats={karats}
              stoneTypes={stoneTypes}
              goldRate24k={goldRate24k}
              onDone={() => {
                setShowForm(false);
                onChange();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function LumpsumAddForm({
  head,
  estimateId,
  onDone,
}: {
  head: EstimateLine["head"];
  estimateId: string;
  onDone: () => void;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/estimates/${estimateId}/lines`, {
        method: "POST",
        body: { head, description: description || undefined, quantity: 1, rate: Number(amount) },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add line");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 mt-2 bg-neu-bg p-3 rounded-md">
      <div>
        <label className="console-field-label">Description</label>
        <input className="console-field w-40" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <label className="console-field-label">Lumpsum Amount (₹)</label>
        <input required type="number" step="0.01" min="0.01" className="console-field w-32" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <button className="console-btn primary" disabled={submitting}>
        {submitting ? "Adding…" : "Add"}
      </button>
      {error && <p className="text-sm text-err-tx w-full">{error}</p>}
    </form>
  );
}

// Matches how wastage is actually worked out on paper today (e.g. the Chowker
// N-562 costing sheet): a % of a specific gold line's weight, always priced
// at the locked-in 24K rate — not the purity-adjusted rate of that line.
function WastageAddForm({
  estimateId,
  goldLines,
  goldRate24k,
  onDone,
}: {
  estimateId: string;
  goldLines: EstimateLine[];
  goldRate24k: number;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"PERCENT" | "LUMPSUM">(goldLines.length > 0 ? "PERCENT" : "LUMPSUM");
  const [goldLineId, setGoldLineId] = useState(goldLines[0]?.id ?? "");
  const [pct, setPct] = useState("7");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const basisLine = goldLines.find((l) => l.id === goldLineId);
  const wastageWeightG = basisLine && pct ? round(Number(basisLine.quantity) * (Number(pct) / 100), 3) : null;
  const wastageAmount = wastageWeightG !== null ? round(wastageWeightG * goldRate24k, 2) : null;

  function round(n: number, dp: number) {
    const f = 10 ** dp;
    return Math.round(n * f) / f;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "PERCENT") {
        if (wastageWeightG === null) throw new Error("Pick a gold line and a %");
        await apiFetch(`/api/estimates/${estimateId}/lines`, {
          method: "POST",
          body: {
            head: "WASTAGE",
            description: description || `${pct}% wastage on ${basisLine?.description ?? "gold"}`,
            quantity: wastageWeightG,
            rate: goldRate24k,
          },
        });
      } else {
        await apiFetch(`/api/estimates/${estimateId}/lines`, {
          method: "POST",
          body: { head: "WASTAGE", description: description || undefined, quantity: 1, rate: Number(amount) },
        });
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add line");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 mt-2 bg-neu-bg p-3 rounded-md">
      <div className="flex items-center gap-3 w-full text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === "PERCENT"} onChange={() => setMode("PERCENT")} disabled={goldLines.length === 0} />
          % of gold weight
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === "LUMPSUM"} onChange={() => setMode("LUMPSUM")} />
          Lumpsum
        </label>
        {goldLines.length === 0 && mode === "PERCENT" && (
          <span className="text-xs text-mute">Add a Gold line first to use % of weight.</span>
        )}
      </div>
      {mode === "PERCENT" ? (
        <>
          <div>
            <label className="console-field-label">Gold line</label>
            <select required className="console-field" value={goldLineId} onChange={(e) => setGoldLineId(e.target.value)}>
              {goldLines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.description ?? "Gold"} — {Number(l.quantity)}g
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="console-field-label">Wastage %</label>
            <input required type="number" step="0.01" className="console-field w-24" value={pct} onChange={(e) => setPct(e.target.value)} />
          </div>
          <div>
            <label className="console-field-label">Description (optional)</label>
            <input className="console-field w-40" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="console-field-label">Description</label>
            <input className="console-field w-40" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="console-field-label">Lumpsum Amount (₹)</label>
            <input required type="number" step="0.01" min="0.01" className="console-field w-32" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </>
      )}
      <button className="console-btn primary" disabled={submitting}>
        {submitting ? "Adding…" : "Add"}
      </button>
      {mode === "PERCENT" && wastageWeightG !== null && wastageAmount !== null && (
        <p className="text-xs text-ink2 w-full mono">
          {wastageWeightG}g at today&apos;s locked 24K rate = <span className="text-ink font-medium">{formatINR(wastageAmount)}</span>
        </p>
      )}
      {error && <p className="text-sm text-err-tx w-full">{error}</p>}
    </form>
  );
}

function AddLineForm({
  head,
  estimateId,
  karats,
  stoneTypes,
  goldRate24k,
  onDone,
}: {
  head: EstimateLine["head"];
  estimateId: string;
  karats: { id: string; code: string; purityFactor: string }[];
  stoneTypes: { id: string; name: string; category: string }[];
  goldRate24k: number;
  onDone: () => void;
}) {
  const [description, setDescription] = useState("");
  const [purityId, setPurityId] = useState("");
  const [stoneTypeId, setStoneTypeId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [pieces, setPieces] = useState("");
  const [rateBasis, setRateBasis] = useState<"PER_CARAT" | "PER_PIECE">("PER_CARAT");
  const [rate, setRate] = useState("");
  const [useTodaysRate, setUseTodaysRate] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isStone = head === "POLKI" || head === "COLOURED_STONE";
  const unitLabel = head === "GOLD" ? "g" : head === "POLKI" ? "ct" : "kt";
  const relevantStoneTypes =
    head === "POLKI"
      ? stoneTypes.filter((s) => s.category === "POLKI")
      : stoneTypes.filter((s) => s.category !== "POLKI");

  const selectedKarat = karats.find((k) => k.id === purityId);
  const indicativeRate = selectedKarat ? deriveRate(goldRate24k, Number(selectedKarat.purityFactor)) : null;
  const indicativeAmount =
    indicativeRate !== null && quantity ? Math.round(indicativeRate * Number(quantity) * 100) / 100 : null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/estimates/${estimateId}/lines`, {
        method: "POST",
        body: {
          head,
          description: description || undefined,
          purityId: head === "GOLD" ? purityId : undefined,
          stoneTypeId: isStone ? stoneTypeId : undefined,
          quantity: Number(quantity),
          pieces: isStone && pieces ? Number(pieces) : undefined,
          rateBasis: isStone ? rateBasis : undefined,
          rate: head === "GOLD" && useTodaysRate ? undefined : rate ? Number(rate) : undefined,
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add line");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 mt-2 bg-neu-bg p-3 rounded-md">
      {head !== "GOLD" && (
        <div>
          <label className="console-field-label">Description</label>
          <input className="console-field w-40" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      )}
      {head === "GOLD" && (
        <div>
          <label className="console-field-label">Purity</label>
          <select required className="console-field" value={purityId} onChange={(e) => setPurityId(e.target.value)}>
            <option value="">Select…</option>
            {karats.map((k) => (
              <option key={k.id} value={k.id}>
                {k.code}
              </option>
            ))}
          </select>
          {indicativeRate !== null && (
            <p className="text-xs text-ink2 mt-1 mono">Indicative: {formatINR(indicativeRate)}/g</p>
          )}
        </div>
      )}
      {isStone && (
        <>
          <div>
            <label className="console-field-label">Stone Type</label>
            <select required className="console-field" value={stoneTypeId} onChange={(e) => setStoneTypeId(e.target.value)}>
              <option value="">Select…</option>
              {relevantStoneTypes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="console-field-label">Quality rate is per</label>
            <select className="console-field" value={rateBasis} onChange={(e) => setRateBasis(e.target.value as typeof rateBasis)}>
              <option value="PER_CARAT">{head === "POLKI" ? "Carat" : "Karat"}</option>
              <option value="PER_PIECE">Piece</option>
            </select>
          </div>
        </>
      )}
      <div>
        <label className="console-field-label">Quantity ({unitLabel}){head === "COLOURED_STONE" ? " · 100 cent = 1kt" : ""}</label>
        <input required type="number" step="0.001" className="console-field w-24" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </div>
      {isStone && (
        <div>
          <label className="console-field-label">Pieces {rateBasis === "PER_CARAT" ? "(reference only)" : ""}</label>
          <input
            required={rateBasis === "PER_PIECE"}
            type="number"
            step="1"
            min="1"
            className="console-field w-20"
            value={pieces}
            onChange={(e) => setPieces(e.target.value)}
          />
        </div>
      )}
      {head === "GOLD" ? (
        <div className="flex items-center gap-2 pb-2">
          <input
            id="autorate"
            type="checkbox"
            checked={useTodaysRate}
            onChange={(e) => setUseTodaysRate(e.target.checked)}
          />
          <label htmlFor="autorate" className="text-sm">
            Use today&apos;s rate
          </label>
        </div>
      ) : null}
      {(head !== "GOLD" || !useTodaysRate) && (
        <div>
          <label className="console-field-label">Rate {isStone ? `(per ${rateBasis === "PER_PIECE" ? "piece" : head === "POLKI" ? "carat" : "karat"})` : "(optional)"}</label>
          <input
            type="number"
            step="0.01"
            required={isStone && rateBasis === "PER_PIECE"}
            className="console-field w-28"
            value={rate}
            placeholder={indicativeRate !== null ? String(indicativeRate) : undefined}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
      )}
      <button className="console-btn primary" disabled={submitting}>
        {submitting ? "Adding…" : "Add"}
      </button>
      {head === "GOLD" && useTodaysRate && indicativeAmount !== null && (
        <p className="text-xs text-ink2 w-full mono">
          Amount at today&apos;s rate: <span className="text-ink font-medium">{formatINR(indicativeAmount)}</span>
        </p>
      )}
      {error && <p className="text-sm text-err-tx w-full">{error}</p>}
    </form>
  );
}
