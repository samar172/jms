"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, RefreshCw, TrendingUp, TrendingDown, Pencil, Check } from "lucide-react";
import { useApi, useKarats, useStoneTypes, useKarigars, useCustomers } from "@/lib/hooks";
import { apiFetch, ApiError } from "@/lib/api";
import { EstimateStatusBadge } from "@/components/shared/status-badge";
import { formatINR } from "@/lib/format";
import { deriveRate } from "@jms/shared";
import { useAuth } from "@/lib/auth-context";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { PageFormSkeleton } from "@/components/shared/page-skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { WorkflowStepper } from "@/components/shared/workflow-stepper";
import { JobCardPanel } from "@/components/shared/job-card-panel";
import { ProductTimeline } from "@/components/shared/product-timeline";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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
  productId: string;
  karigarId: string | null;
  karigar: { id: string; name: string } | null;
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
}
interface ProductEstimateSummary {
  id: string;
  type: string;
  status: string;
  version: number;
  netAmount: string;
}

const HEADS: { key: EstimateLine["head"]; label: string; unit: string; hint: string }[] = [
  { key: "GOLD", label: "Gold", unit: "g", hint: "Enter purity + weight in grams — rate is filled in automatically from today's gold rate." },
  { key: "POLKI", label: "Polki", unit: "ct", hint: "Enter stone type + weight in carats (or a flat rate per piece)." },
  { key: "COLOURED_STONE", label: "Coloured Stones", unit: "ct", hint: "Enter stone type + weight in carat (1 carat = 100 cent), or a flat rate per piece." },
  { key: "MAKING", label: "Making Charges", unit: "", hint: "Pull in from approved karigar labour entries, or add a flat lumpsum amount." },
  { key: "OTHER", label: "Other Charges", unit: "", hint: "Anything else — packaging, certification, hallmarking, etc." },
  { key: "WASTAGE", label: "Wastage", unit: "g", hint: "Add a % of a gold line's weight (your usual method, priced at the 24K rate) or a flat lumpsum — or pull in actual recorded wastage once production is done." },
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
  const { data: karigars } = useKarigars();
  const { data: customers } = useCustomers();
  const [profitPct, setProfitPct] = useState<string | null>(null);
  const [gstPct, setGstPct] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [amending, setAmending] = useState(false);
  const [amendDialogOpen, setAmendDialogOpen] = useState(false);
  const [refreshingRate, setRefreshingRate] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const { data: jobCards } = useApi<{ id: string }[]>(
    estimate ? `/api/job-cards?productId=${estimate.productId}` : null
  );
  const { data: productEstimates } = useApi<ProductEstimateSummary[]>(
    estimate ? `/api/estimates/product/${estimate.productId}` : null
  );
  const { data: currentGoldRate } = useApi<{ ratePerGram24k: string }>(
    estimate?.type === "FINAL_COSTING" ? "/api/masters/gold-rates/current" : null
  );

  if (!estimate) return <PageFormSkeleton sections={2} />;

  const isRough = estimate.type === "ROUGH_ESTIMATE";
  const isFinal = estimate.type === "FINAL_COSTING";
  const editable = estimate.status === "DRAFT";
  const canUnlock = user?.role === "SUPER_ADMIN" && estimate.status === "SUBMITTED";
  const canAmend = user?.role === "SUPER_ADMIN" && estimate.status === "APPROVED";
  const linesByHead = (head: EstimateLine["head"]) => estimate.lines.filter((l) => l.head === head);
  const subtotal = (head: EstimateLine["head"]) =>
    linesByHead(head).reduce((sum, l) => sum + Number(l.amount), 0);
  const sourceRoughEstimate = productEstimates?.find(
    (e) => e.type === "ROUGH_ESTIMATE" && e.status === "APPROVED" && e.id !== estimate.id
  );

  async function saveProfitPct() {
    if (profitPct === null) return;
    try {
      await apiFetch(`/api/estimates/${estimateId}`, { method: "PATCH", body: { profitPct: Number(profitPct) } });
      setProfitPct(null);
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save profit %");
    }
  }

  async function saveGstPct() {
    if (gstPct === null) return;
    try {
      await apiFetch(`/api/estimates/${estimateId}`, { method: "PATCH", body: { gstPct: Number(gstPct) } });
      setGstPct(null);
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save GST %");
    }
  }

  async function approve() {
    try {
      await apiFetch(`/api/estimates/${estimateId}/approve`, { method: "POST" });
      toast.success("Estimate approved and locked");
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to approve");
    }
  }

  async function pullLabour() {
    await apiFetch(`/api/estimates/${estimateId}/pull-labour`, { method: "POST" });
    toast.success("Labour pulled in");
    await mutate();
  }

  async function pullWastage() {
    await apiFetch(`/api/estimates/${estimateId}/pull-wastage`, { method: "POST" });
    toast.success("Wastage pulled in");
    await mutate();
  }

  async function removePulledWastage() {
    const pulled = estimate!.lines.filter((l) => l.head === "WASTAGE" && l.sourceType === "FROM_WASTAGE");
    await Promise.all(pulled.map((l) => apiFetch(`/api/estimates/lines/${l.id}`, { method: "DELETE" })));
    toast.success("Pulled wastage lines removed");
    await mutate();
  }

  async function deleteLine(lineId: string) {
    await apiFetch(`/api/estimates/lines/${lineId}`, { method: "DELETE" });
    await mutate();
  }

  async function unlock() {
    try {
      await apiFetch(`/api/estimates/${estimateId}/unlock`, { method: "POST" });
      toast.success("Estimate unlocked for editing");
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to unlock");
    }
  }

  async function amend() {
    setAmending(true);
    try {
      await apiFetch(`/api/estimates/${estimateId}/amend`, { method: "POST" });
      toast.success("Estimate reopened for amendment");
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to amend");
    } finally {
      setAmending(false);
    }
  }

  async function saveKarigar(karigarId: string) {
    try {
      await apiFetch(`/api/estimates/${estimateId}`, { method: "PATCH", body: { karigarId: karigarId || null } });
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to set karigar");
    }
  }

  async function saveCustomer(customerId: string) {
    if (!customerId) return;
    try {
      await apiFetch(`/api/estimates/${estimateId}`, { method: "PATCH", body: { customerId } });
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to set customer");
    }
  }

  async function convertToFinalCosting() {
    setConverting(true);
    try {
      const created = await apiFetch<{ id: string }>(`/api/estimates/${estimateId}/convert-to-final-costing`, {
        method: "POST",
      });
      toast.success("Moved to production — detailed costing started");
      router.push(`/costing/${created.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to move to production");
      setConverting(false);
    }
  }

  async function moveToProduction() {
    // A Job Card is the manufacturing workflow (karigar-per-stage, material
    // issue/receipt, wastage) — make sure one exists for this product before
    // starting the detailed costing that will later pull labour/wastage from it.
    if (jobCards && jobCards.length === 0) {
      toast.info("Create a job card for this piece first, then come back here to move it to production.");
      router.push(`/job-cards/new?productId=${estimate!.productId}`);
      return;
    }
    await convertToFinalCosting();
  }

  async function cancelEstimate() {
    setCancelling(true);
    try {
      await apiFetch(`/api/estimates/${estimateId}`, { method: "DELETE" });
      toast.success("Estimate cancelled");
      router.push(`/costing/new?productId=${estimate!.productId}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to cancel estimate");
      setCancelling(false);
    }
  }

  async function refreshGoldRate() {
    setRefreshingRate(true);
    try {
      await apiFetch(`/api/estimates/${estimateId}/refresh-gold-rate`, { method: "POST" });
      toast.success("Gold rate refreshed to today's rate");
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to refresh gold rate");
    } finally {
      setRefreshingRate(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            Estimate —{" "}
            <Link href={`/products/${estimate.product.serialNo}`} className="font-mono text-primary">
              {estimate.product.serialNo}
            </Link>
          </h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {estimate.type.replace(/_/g, " ")} · Version {estimate.version} <EstimateStatusBadge status={estimate.status} />
          </p>
          <div className="mt-3">
            <WorkflowStepper
              estimateType={estimate.type as "ROUGH_ESTIMATE" | "FINAL_COSTING"}
              estimateStatus={estimate.status as "DRAFT" | "SUBMITTED" | "APPROVED" | "SUPERSEDED"}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && (
            <>
              {isFinal && (
                <>
                  <Button variant="outline" onClick={pullLabour}>
                    Pull Labour
                  </Button>
                  <Button variant="outline" onClick={pullWastage}>
                    Pull Wastage
                  </Button>
                  {linesByHead("WASTAGE").some((l) => l.sourceType === "FROM_WASTAGE") && (
                    <Button variant="outline" onClick={removePulledWastage}>
                      Remove Pulled Wastage
                    </Button>
                  )}
                </>
              )}
              <Button variant="destructive" onClick={() => setCancelDialogOpen(true)} disabled={cancelling}>
                {cancelling ? "Cancelling…" : "Cancel Estimate"}
              </Button>
              <Button onClick={approve}>{isRough ? "Approve Estimate" : "Approve & Lock"}</Button>
            </>
          )}
          {!editable && (
            <>
              {isRough && (
                <Button variant="outline" onClick={moveToProduction} disabled={converting}>
                  {converting ? "Moving…" : "Move to Production"}
                </Button>
              )}
              {canUnlock && (
                <Button variant="outline" onClick={unlock}>
                  Unlock for Editing
                </Button>
              )}
              {canAmend && (
                <Button variant="destructive" onClick={() => setAmendDialogOpen(true)} disabled={amending}>
                  {amending ? "Amending…" : "Amend (Super Admin)"}
                </Button>
              )}
              <a
                href={`/api/estimates/${estimateId}/pdf`}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                Export PDF
              </a>
              <a
                href={`/api/estimates/${estimateId}/excel`}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                Export Excel
              </a>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        title="Cancel this estimate?"
        description="This permanently deletes the draft and all its lines. Its version number becomes free again for the next estimate you create for this product."
        confirmLabel="Cancel Estimate"
        destructive
        onConfirm={cancelEstimate}
      />

      <ConfirmDialog
        open={amendDialogOpen}
        onOpenChange={setAmendDialogOpen}
        title="Amend this estimate?"
        description="This reverses the invoice already posted to the customer's ledger and reopens the estimate for editing. A corrected invoice is posted when you re-approve."
        confirmLabel="Amend"
        destructive
        onConfirm={amend}
      />

      <Card size="sm">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Customer:</span>
            {estimate.customer ? (
              <span className="font-medium">{estimate.customer.name}</span>
            ) : editable ? (
              <Select
                onValueChange={(v: string | null) => v && saveCustomer(v)}
                items={(customers ?? []).map((c) => ({ value: c.id, label: c.name }))}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder="Not set…" />
                </SelectTrigger>
                <SelectContent>
                  {customers?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-muted-foreground">Not set</span>
            )}
          </div>
          {isFinal && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Karigar:</span>
              {editable ? (
                <Select
                  value={estimate.karigarId ?? ""}
                  onValueChange={(v) => saveKarigar(v ?? "")}
                  items={(karigars ?? []).map((k) => ({ value: k.id, label: k.name }))}
                >
                  <SelectTrigger size="sm">
                    <SelectValue placeholder="Not set…" />
                  </SelectTrigger>
                  <SelectContent>
                    {karigars?.map((k) => (
                      <SelectItem key={k.id} value={k.id}>
                        {k.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="font-medium">{estimate.karigar?.name ?? "Not set"}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="costing">
        <TabsList>
          <TabsTrigger value="costing">Costing</TabsTrigger>
          <TabsTrigger value="production">Production</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="costing" className="space-y-5 pt-4">
      {isRough && (
        <Card className="border-primary/20 bg-primary/5 py-3">
          <CardContent className="text-sm text-primary">
            <strong>Rough Estimate</strong> — an approximate customer quote. Detailed line-by-line costing (karigar,
            multiple gold/Polki/stone lines, labour, wastage) happens after <strong>Move to Production</strong>.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="text-sm leading-relaxed">
          It costs <strong className="tabular-nums">{formatINR(Number(estimate.cost))}</strong> to make this piece. Add{" "}
          <strong>{Number(estimate.profitPct)}%</strong> profit and <strong>{Number(estimate.gstPct)}%</strong> GST, and the
          customer pays <strong className="tabular-nums text-primary">{formatINR(Number(estimate.netAmount))}</strong>.
        </CardContent>
      </Card>

      {isFinal && sourceRoughEstimate && (
        <Card className="py-3">
          <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Original Estimate</div>
              <div className="font-semibold tabular-nums">{formatINR(Number(sourceRoughEstimate.netAmount))}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Current Final Cost</div>
              <div className="font-semibold tabular-nums">{formatINR(Number(estimate.netAmount))}</div>
            </div>
            {(() => {
              const variance = Number(estimate.netAmount) - Number(sourceRoughEstimate.netAmount);
              const pct = Number(sourceRoughEstimate.netAmount) !== 0 ? (variance / Number(sourceRoughEstimate.netAmount)) * 100 : 0;
              const up = variance > 0;
              return (
                <div className={cn("flex items-center gap-1 font-medium tabular-nums", up ? "text-warning" : "text-success")}>
                  {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {up ? "+" : ""}
                  {formatINR(variance)} ({up ? "+" : ""}
                  {pct.toFixed(1)}%)
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {isFinal && currentGoldRate && (
        <Card className="py-3">
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="font-medium">Today&apos;s Gold Rate (24K):</span>
            <span className="tabular-nums">{formatINR(Number(currentGoldRate.ratePerGram24k))}/g</span>
            <span className="text-xs text-muted-foreground">
              This estimate is priced at {formatINR(Number(estimate.goldRateSnapshot24k))}/g
            </span>
            {editable && (
              <Button variant="outline" size="sm" onClick={refreshGoldRate} disabled={refreshingRate} className="ml-auto">
                <RefreshCw size={14} className={refreshingRate ? "animate-spin" : undefined} />
                Refresh Rate
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="space-y-4">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">1. Materials — gold &amp; stones</h2>
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
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">2. Making, other charges &amp; wastage</h2>
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
        </div>

        <Card className="h-fit space-y-2 text-sm lg:sticky lg:top-20">
          <CardContent className="space-y-2">
            <h2 className="mb-2 font-semibold">3. Final Bill</h2>
            <Row label="Gold &amp; Stones" value={formatINR(Number(estimate.materialCost))} />
            <Row label="Making Charges" value={formatINR(Number(estimate.makingCharges))} />
            <Row label="Other Charges" value={formatINR(Number(estimate.otherCharges))} />
            <Row label="Wastage" value={formatINR(Number(estimate.wastageCost))} />
            <div className="my-2 border-t border-border" />
            <Row label="Total Cost" value={formatINR(Number(estimate.cost))} bold />
            <p className="-mt-1 text-xs text-muted-foreground">What it costs you to make this piece.</p>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Your Profit %</span>
              {editable ? (
                <Input
                  className="w-20 text-right"
                  type="number"
                  step="0.01"
                  defaultValue={estimate.profitPct}
                  onChange={(e) => setProfitPct(e.target.value)}
                  onBlur={saveProfitPct}
                />
              ) : (
                <span className="tabular-nums">{Number(estimate.profitPct)}%</span>
              )}
            </div>
            <Row label="Profit Amount" value={formatINR(Number(estimate.profit))} />
            <div className="my-2 border-t border-border" />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">GST %</span>
              {editable ? (
                <Input
                  className="w-20 text-right"
                  type="number"
                  step="0.01"
                  defaultValue={estimate.gstPct}
                  onChange={(e) => setGstPct(e.target.value)}
                  onBlur={saveGstPct}
                />
              ) : (
                <span className="tabular-nums">{Number(estimate.gstPct)}%</span>
              )}
            </div>
            <Row label="GST Amount" value={formatINR(Number(estimate.gstAmount))} />
            <div className="my-2 border-t-2 border-primary" />
            <div className="-mx-4 flex items-baseline justify-between rounded bg-primary/10 px-4 py-2.5">
              <div>
                <div className="font-semibold">Customer Pays</div>
                <div className="text-xs font-normal text-muted-foreground">Final bill, GST included</div>
              </div>
              <span className="text-xl font-bold tabular-nums text-primary">{formatINR(Number(estimate.netAmount))}</span>
            </div>
            {editable && (
              <p className="pt-1 text-xs text-muted-foreground">
                Once you hit &quot;Approve &amp; Lock&quot;, this can&apos;t be edited — you&apos;d need to create a new version instead.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
        </TabsContent>

        <TabsContent value="production" className="pt-4">
          {jobCards === undefined ? (
            <PageFormSkeleton sections={2} />
          ) : jobCards.length === 0 ? (
            <Card className="py-3">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  No job card yet for this piece — create one to assign karigars to each stage of work.
                </span>
                <Button variant="outline" onClick={() => router.push(`/job-cards/new?productId=${estimate.productId}`)}>
                  Create Job Card
                </Button>
              </CardContent>
            </Card>
          ) : (
            <JobCardPanel jobCardId={jobCards[0].id} />
          )}
        </TabsContent>

        <TabsContent value="timeline" className="pt-4">
          <ProductTimeline productId={estimate.productId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={cn("flex justify-between", bold && "font-semibold")}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
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
    <Card className="overflow-hidden py-0">
      <div className="flex items-center justify-between gap-3 border-l-4 border-l-primary bg-muted/40 px-5 py-3">
        <div>
          <h3 className="font-semibold">{label}</h3>
          <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{hint}</p>
        </div>
        <span className="shrink-0 font-medium tabular-nums">{formatINR(subtotal)}</span>
      </div>
      {head === "GOLD" && karats.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border bg-muted/20 px-5 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Indicative rate/g today:</span>
          {karats.map((k) => (
            <span key={k.id} className="tabular-nums">
              {k.code}: <span className="font-medium text-foreground">{formatINR(deriveRate(goldRate24k, Number(k.purityFactor)))}</span>
            </span>
          ))}
        </div>
      )}
      <div className="px-5 py-3">
        {lines.length > 0 && (
          <Table className="mb-2">
            <TableBody>
              {lines.map((l) => (
                <LineRow key={l.id} line={l} unit={unit} editable={editable} onDeleteLine={onDeleteLine} onChange={onChange} />
              ))}
            </TableBody>
          </Table>
        )}
        {editable && (
          <>
            <Button variant="ghost" size="xs" onClick={() => setShowForm((s) => !s)}>
              + Add {label} Line
            </Button>
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
    </Card>
  );
}

function LineRow({
  line,
  unit,
  editable,
  onDeleteLine,
  onChange,
}: {
  line: EstimateLine;
  unit: string;
  editable: boolean;
  onDeleteLine: (id: string) => void;
  onChange: () => void;
}) {
  const isPerPiece = line.rateBasis === "PER_PIECE";
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(String(isPerPiece ? (line.pieces ?? 0) : Number(line.quantity)));
  const [rate, setRate] = useState(String(Number(line.rate)));
  const [saving, setSaving] = useState(false);

  function startEditing() {
    setQty(String(isPerPiece ? (line.pieces ?? 0) : Number(line.quantity)));
    setRate(String(Number(line.rate)));
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/api/estimates/lines/${line.id}`, {
        method: "PATCH",
        body: isPerPiece ? { pieces: Number(qty), rate: Number(rate) } : { quantity: Number(qty), rate: Number(rate) },
      });
      toast.success("Line updated");
      setEditing(false);
      onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update line");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <TableRow>
        <TableCell>{line.description ?? line.karigarName ?? "—"}</TableCell>
        <TableCell className="text-right">
          <Input
            type="number"
            step="0.001"
            className="ml-auto w-20 text-right"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </TableCell>
        <TableCell className="text-right">
          <Input
            type="number"
            step="0.01"
            className="ml-auto w-24 text-right"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </TableCell>
        <TableCell className="text-right font-medium tabular-nums">
          {formatINR((Number(qty) || 0) * (Number(rate) || 0))}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon-xs" disabled={saving} onClick={save}>
              <Check />
            </Button>
            <Button variant="ghost" size="icon-xs" disabled={saving} onClick={() => setEditing(false)}>
              <X />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>{line.description ?? line.karigarName ?? "—"}</TableCell>
      <TableCell className="text-right tabular-nums">
        {line.rateBasis === "PER_PIECE" && line.pieces
          ? `${line.pieces} pc`
          : unit
            ? `${Number(line.quantity)} ${unit}${line.pieces ? ` (${line.pieces} pc)` : ""}`
            : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {formatINR(Number(line.rate))}
        {line.rateBasis === "PER_PIECE" ? "/pc" : ""}
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">{formatINR(Number(line.amount))}</TableCell>
      {editable && (
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon-xs" onClick={startEditing}>
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={() => onDeleteLine(line.id)}>
              <X />
            </Button>
          </div>
        </TableCell>
      )}
    </TableRow>
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

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch(`/api/estimates/${estimateId}/lines`, {
        method: "POST",
        body: { head, description: description || undefined, quantity: 1, rate: Number(amount) },
      });
      toast.success("Line added");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add line");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-muted/40 p-3">
      <div>
        <Label className="mb-1.5">Description</Label>
        <Input className="w-40" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <Label className="mb-1.5">Lumpsum Amount (₹)</Label>
        <Input required type="number" step="0.01" min="0.01" className="w-32" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <Button type="submit" disabled={submitting}>{submitting ? "Adding…" : "Add"}</Button>
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
      toast.success("Line added");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add line");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-muted/40 p-3">
      <div className="flex w-full items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === "PERCENT"} onChange={() => setMode("PERCENT")} disabled={goldLines.length === 0} />
          % of gold weight
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === "LUMPSUM"} onChange={() => setMode("LUMPSUM")} />
          Lumpsum
        </label>
        {goldLines.length === 0 && mode === "PERCENT" && (
          <span className="text-xs text-muted-foreground">Add a Gold line first to use % of weight.</span>
        )}
      </div>
      {mode === "PERCENT" ? (
        <>
          <div>
            <Label className="mb-1.5">Gold line</Label>
            <Select
              required
              value={goldLineId}
              onValueChange={(v) => setGoldLineId(v ?? "")}
              items={goldLines.map((l) => ({ value: l.id, label: `${l.description ?? "Gold"} — ${Number(l.quantity)}g` }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {goldLines.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.description ?? "Gold"} — {Number(l.quantity)}g
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5">Wastage %</Label>
            <Input required type="number" step="0.01" className="w-24" value={pct} onChange={(e) => setPct(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5">Description (optional)</Label>
            <Input className="w-40" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </>
      ) : (
        <>
          <div>
            <Label className="mb-1.5">Description</Label>
            <Input className="w-40" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5">Lumpsum Amount (₹)</Label>
            <Input required type="number" step="0.01" min="0.01" className="w-32" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </>
      )}
      <Button type="submit" disabled={submitting}>{submitting ? "Adding…" : "Add"}</Button>
      {mode === "PERCENT" && wastageWeightG !== null && wastageAmount !== null && (
        <p className="w-full text-xs tabular-nums text-muted-foreground">
          {wastageWeightG}g at today&apos;s locked 24K rate = <span className="font-medium text-foreground">{formatINR(wastageAmount)}</span>
        </p>
      )}
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

  const isStone = head === "POLKI" || head === "COLOURED_STONE";
  const unitLabel = head === "GOLD" ? "g" : "ct";
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
      toast.success("Line added");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add line");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-muted/40 p-3">
      {head !== "GOLD" && (
        <div>
          <Label className="mb-1.5">Description</Label>
          <Input className="w-40" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      )}
      {head === "GOLD" && (
        <div>
          <Label className="mb-1.5">Purity</Label>
          <Select
            required
            value={purityId}
            onValueChange={(v) => setPurityId(v ?? "")}
            items={karats.map((k) => ({ value: k.id, label: k.code }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {karats.map((k) => (
                <SelectItem key={k.id} value={k.id}>
                  {k.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {indicativeRate !== null && (
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">Indicative: {formatINR(indicativeRate)}/g</p>
          )}
        </div>
      )}
      {isStone && (
        <>
          <div>
            <Label className="mb-1.5">Stone Type</Label>
            <Select
              required
              value={stoneTypeId}
              onValueChange={(v) => setStoneTypeId(v ?? "")}
              items={relevantStoneTypes.map((s) => ({ value: s.id, label: s.name }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {relevantStoneTypes.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5">Quality rate is per</Label>
            <Select
              value={rateBasis}
              onValueChange={(v) => setRateBasis((v as typeof rateBasis) ?? "PER_CARAT")}
              items={[
                { value: "PER_CARAT", label: "Carat" },
                { value: "PER_PIECE", label: "Piece" },
              ]}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PER_CARAT">Carat</SelectItem>
                <SelectItem value="PER_PIECE">Piece</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}
      <div>
        <Label className="mb-1.5">
          Quantity ({unitLabel}){head === "COLOURED_STONE" ? " · 100 cent = 1ct" : ""}
        </Label>
        <Input required type="number" step="0.001" className="w-24" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </div>
      {isStone && (
        <div>
          <Label className="mb-1.5">Pieces {rateBasis === "PER_CARAT" ? "(reference only)" : ""}</Label>
          <Input
            required={rateBasis === "PER_PIECE"}
            type="number"
            step="1"
            min="1"
            className="w-20"
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
          <Label className="mb-1.5">
            Rate {isStone ? `(per ${rateBasis === "PER_PIECE" ? "piece" : "carat"})` : "(optional)"}
          </Label>
          <Input
            type="number"
            step="0.01"
            required={isStone && rateBasis === "PER_PIECE"}
            className="w-28"
            value={rate}
            placeholder={indicativeRate !== null ? String(indicativeRate) : undefined}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
      )}
      <Button type="submit" disabled={submitting}>{submitting ? "Adding…" : "Add"}</Button>
      {head === "GOLD" && useTodaysRate && indicativeAmount !== null && (
        <p className="w-full text-xs tabular-nums text-muted-foreground">
          Amount at today&apos;s rate: <span className="font-medium text-foreground">{formatINR(indicativeAmount)}</span>
        </p>
      )}
    </form>
  );
}
